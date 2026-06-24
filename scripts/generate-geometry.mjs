import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const orsKey = process.env.OPENROUTESERVICE_API_KEY;

if (!supabaseUrl || !supabaseServiceKey || !orsKey) {
  console.error(
    "Missing env vars. Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENROUTESERVICE_API_KEY"
  );
  process.exit(1);
}

const sb = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

const PER_ROUTE_DELAY_MS = 4000;     // 4 seconds between routes
const RATE_LIMIT_WAIT_MS = 300000;   // 5 minutes when you hit 429
const MAX_RETRIES_429 = 12;          // up to 1 hour waiting on a single route

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

// Radii to try in sequence. Kept tight so waypoints snap to footpaths/tracks
// rather than distant roads. Larger values risk snapping to a road instead of
// a nearby path, even within the foot-hiking network.
const SNAP_RADII_FALLBACK = [100, 200, 350, 500];

async function orsDirectionsGeojson(coordinates, radius) {
  const url = "https://api.openrouteservice.org/v2/directions/foot-hiking/geojson";
  const radiuses = new Array(coordinates.length).fill(radius);

  for (let attempt = 1; attempt <= MAX_RETRIES_429; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        authorization: orsKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        coordinates,
        radiuses,
        instructions: false,
        continue_straight: false,
      }),
    });

    if (res.status === 429) {
      console.log(
        `  ORS 429 rate limit. Waiting ${RATE_LIMIT_WAIT_MS / 1000}s (attempt ${attempt}/${MAX_RETRIES_429})...`
      );
      await new Promise((r) => setTimeout(r, RATE_LIMIT_WAIT_MS));
      continue;
    }

    // 404 with code 2010 = waypoint out of range — let caller try next radius
    if (res.status === 404) {
      const body = await res.json().catch(() => ({}));
      if (body?.error?.code === 2010) {
        throw { isSnapError: true, body };
      }
      throw new Error(`ORS 404: ${JSON.stringify(body)}`);
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`ORS ${res.status}: ${text}`);
    }

    return await res.json();
  }

  throw new Error("ORS 429: rate limit did not clear after retries");
}

async function orsDirectionsWithFallback(coordinates) {
  for (const radius of SNAP_RADII_FALLBACK) {
    try {
      const result = await orsDirectionsGeojson(coordinates, radius);
      if (radius > SNAP_RADII_FALLBACK[0]) {
        console.log(`  Succeeded with fallback radius ${radius}m`);
      }
      return result;
    } catch (err) {
      if (err?.isSnapError) {
        console.log(`  Snap failed at ${radius}m, trying next…`);
        continue;
      }
      throw err;
    }
  }
  throw new Error(`ORS snap failed at all radii: ${SNAP_RADII_FALLBACK.join("m, ")}m`);
}

const FORCE_ALL = process.argv.includes("--force");
// --codes 18,19,21  — only regenerate specific route codes
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

    // If the last waypoint is the same as the first (a loop route), strip it
    // before sending to ORS. Routing pub→...→pub causes ORS to approach the
    // pub from two different directions, creating messy overlapping segments
    // through the village. Instead we route to the penultimate waypoint only
    // and close the loop ourselves in the geometry afterwards.
    const isLoop = distFirstLastM <= 50;
    const coordsToSend = isLoop ? coordinates.slice(0, -1) : coordinates;
    if (isLoop) {
      console.log(`  Loop route: stripped duplicate end waypoint — will close geometry after routing`);
    } else {
      // Non-loop: append start at end so ORS routes back to the start
      coordsToSend.push([first[0], first[1]]);
      console.log(`  Closing loop: appended start waypoint at end (was ${Math.round(distFirstLastM)}m apart)`);
    }

    let geojson;
    try {
      geojson = await orsDirectionsWithFallback(coordsToSend);
    } catch (e) {
      console.log(`  ORS failed: ${e.message}`);
      continue;
    }

    const line = geojson?.features?.[0]?.geometry;
    if (!line || line.type !== "LineString" || !Array.isArray(line.coordinates)) {
      console.log("  ORS returned unexpected geometry");
      continue;
    }

    // Close the loop by appending the very first geometry coordinate.
    // For loop routes this draws one clean closing segment from wherever ORS
    // ended back to the pub, avoiding a second pass through the village.
    {
      const geomCoords = line.coordinates;
      const geomFirst = geomCoords[0];
      const geomLast = geomCoords[geomCoords.length - 1];
      const geomGapM = haversineMetres(geomFirst, geomLast);
      if (geomGapM > 1) {
        geomCoords.push([geomFirst[0], geomFirst[1]]);
        console.log(`  Closed geometry loop (gap was ${Math.round(geomGapM)}m)`);
      }
    }

    // Save only the clean LineString as a single GeoJSON Feature.
    // Storing the full ORS FeatureCollection causes Leaflet to render
    // metadata/extra features as stray lines on the map.
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