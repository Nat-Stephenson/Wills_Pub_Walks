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

async function orsDirectionsGeojson(coordinates) {
  const url = "https://api.openrouteservice.org/v2/directions/foot-hiking/geojson";
  const radiuses = new Array(coordinates.length).fill(1000); // metres

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
      }),
    });

    if (res.status === 429) {
      console.log(
        `  ORS 429 rate limit. Waiting ${RATE_LIMIT_WAIT_MS / 1000}s (attempt ${attempt}/${MAX_RETRIES_429})...`
      );
      await new Promise((r) => setTimeout(r, RATE_LIMIT_WAIT_MS));
      continue;
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`ORS ${res.status}: ${text}`);
    }

    return await res.json();
  }

  throw new Error("ORS 429: rate limit did not clear after retries");
}

async function main() {
  const { data: routes, error: routesErr } = await sb
    .from("routes")
    .select("id, route_code, name")
    .is("geometry_geojson", null);

  if (routesErr) throw routesErr;

  console.log(`Routes missing geometry: ${routes.length}`);

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

    let geojson;
    try {
      geojson = await orsDirectionsGeojson(coordinates);
    } catch (e) {
      console.log(`  ORS failed: ${e.message}`);
      continue;
    }

    const line = geojson?.features?.[0]?.geometry;
    if (!line || line.type !== "LineString" || !Array.isArray(line.coordinates)) {
      console.log("  ORS returned unexpected geometry");
      continue;
    }

    const bbox = bboxFromCoords(line.coordinates);

    const { error: updErr } = await sb
      .from("routes")
      .update({ geometry_geojson: geojson, geometry_bbox: bbox })
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