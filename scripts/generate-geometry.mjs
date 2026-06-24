import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN;

if (!supabaseUrl || !supabaseServiceKey || !mapboxToken) {
  console.error(
    "Missing env vars. Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MAPBOX_ACCESS_TOKEN"
  );
  process.exit(1);
}

const sb = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

const PER_ROUTE_DELAY_MS = 300; // Mapbox free tier is generous

function bboxFromCoords(coords) {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const [lon, lat] of coords) {
    minLon = Math.min(minLon, lon);
    minLat = Math.min(minLat, lat);
    maxLon = Math.max(maxLon, lon);
    maxLat = Math.max(maxLat, lat);
  }
  return [minLon, minLat, maxLon, maxLat];
}

function haversineMetres([lon1, lat1], [lon2, lat2]) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Call the Mapbox Directions API (walking profile) and return the LineString geometry.
 * Coordinates are [lon, lat] pairs. Max 25 waypoints per request.
 */
async function mapboxDirections(coordinates) {
  const coordStr = coordinates.map(([lon, lat]) => `${lon},${lat}`).join(";");
  const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${coordStr}?geometries=geojson&overview=full&steps=false&access_token=${mapboxToken}`;

  const res = await fetch(url);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mapbox ${res.status}: ${text}`);
  }

  const json = await res.json();

  if (!json.routes || json.routes.length === 0) {
    throw new Error(`Mapbox returned no routes: ${JSON.stringify(json)}`);
  }

  // routes[0].geometry is already a GeoJSON LineString
  return json.routes[0].geometry;
}

const FORCE_ALL = process.argv.includes("--force");
const ONLY_CODES = (() => {
  const idx = process.argv.indexOf("--codes");
  if (idx === -1) return null;
  return process.argv[idx + 1]?.split(",").map((s) => s.trim()) ?? null;
})();

async function main() {
  let query = sb.from("routes").select("id, route_code, name");
  if (!FORCE_ALL && !ONLY_CODES) query = query.is("geometry_geojson", null);

  const { data: allRoutes, error: routesErr } = await query;
  if (routesErr) throw routesErr;

  const routes = ONLY_CODES
    ? allRoutes.filter((r) => ONLY_CODES.includes(String(r.route_code)))
    : allRoutes;

  console.log(
    ONLY_CODES
      ? `Regenerating ${routes.length} specified route(s)`
      : FORCE_ALL
      ? `Regenerating all routes: ${routes.length}`
      : `Routes missing geometry: ${routes.length}`
  );

  for (const r of routes) {
    console.log(`\nGenerating ${r.route_code}: ${r.name}`);

    const { data: wps, error: wpsErr } = await sb
      .from("route_waypoints")
      .select("seq, lat, lon")
      .eq("route_id", r.id)
      .order("seq", { ascending: true });

    if (wpsErr) {
      console.log(`  Waypoints load failed: ${wpsErr.message}`);
      continue;
    }
    if (!wps || wps.length < 2) {
      console.log("  Not enough waypoints");
      continue;
    }

    const coordinates = wps.map((w) => [Number(w.lon), Number(w.lat)]);

    const first = coordinates[0];
    const last = coordinates[coordinates.length - 1];
    const distFirstLastM = haversineMetres(first, last);

    // Always route back to the pub (start). Mapbox handles pub→...→pub cleanly
    // via footpaths — no need to strip the duplicate endpoint like ORS required.
    // If the last waypoint is NOT the pub, append it so the route closes.
    const coordsToSend = [...coordinates];
    if (distFirstLastM > 50) {
      coordsToSend.push([first[0], first[1]]);
      console.log(`  Appended start at end to close loop (last wp was ${Math.round(distFirstLastM)}m from pub)`);
    } else {
      console.log(`  Loop route: last waypoint is pub — routing full circle`);
    }

    let line;
    try {
      line = await mapboxDirections(coordsToSend);
    } catch (e) {
      console.log(`  Mapbox failed: ${e.message}`);
      continue;
    }

    if (!line || line.type !== "LineString" || !Array.isArray(line.coordinates)) {
      console.log("  Mapbox returned unexpected geometry");
      continue;
    }

    const cleanGeojson = { type: "Feature", geometry: line };
    const bbox = bboxFromCoords(line.coordinates);

    const { error: updErr } = await sb
      .from("routes")
      .update({ geometry_geojson: cleanGeojson, geometry_bbox: bbox })
      .eq("id", r.id);

    if (updErr) {
      console.log(`  Save failed: ${updErr.message}`);
      continue;
    }

    console.log("  Saved");
    await new Promise((res) => setTimeout(res, PER_ROUTE_DELAY_MS));
  }

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
