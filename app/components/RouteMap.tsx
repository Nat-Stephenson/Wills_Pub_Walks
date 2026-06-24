"use client";

import { useEffect, useRef } from "react";

interface RouteMapProps {
	geojson: any;
	pubLat?: number | null;
	pubLon?: number | null;
	pubLabel?: string | null;
	waypoints?: { seq: number; lat: number; lon: number; label?: string | null }[];
}

/** Haversine distance in metres between two [lon, lat] points. */
function haversineMetres([lon1, lat1]: number[], [lon2, lat2]: number[]): number {
	const R = 6371000;
	const toRad = (d: number) => (d * Math.PI) / 180;
	const dLat = toRad(lat2 - lat1);
	const dLon = toRad(lon2 - lon1);
	const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
	return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * If the LineString's first and last coordinates are within 500 m of each other,
 * append the first coordinate to close the loop visually.
 */
function closeLoop(geojson: any): any {
	if (!geojson) return geojson;
	if (geojson.type === "Feature") {
		return { ...geojson, geometry: closeLoop(geojson.geometry) };
	}
	if (geojson.type === "LineString") {
		const coords: number[][] = geojson.coordinates;
		if (coords.length < 2) return geojson;
		const first = coords[0];
		const last = coords[coords.length - 1];
		if (haversineMetres(first, last) <= 500) {
			return { ...geojson, coordinates: [...coords, first] };
		}
	}
	return geojson;
}

/** Returns the first [lat, lng] coordinate from any supported GeoJSON geometry. */
function extractStartCoord(geojson: any): [number, number] | null {
	if (!geojson) return null;
	const fromCoords = (coords: number[][]): [number, number] | null =>
		coords.length > 0 ? [coords[0][1], coords[0][0]] : null;
	if (geojson.type === "LineString") return fromCoords(geojson.coordinates);
	if (geojson.type === "MultiLineString") return fromCoords(geojson.coordinates[0] ?? []);
	if (geojson.type === "Feature") return extractStartCoord(geojson.geometry);
	if (geojson.type === "FeatureCollection") {
		for (const f of geojson.features ?? []) {
			const c = extractStartCoord(f);
			if (c) return c;
		}
	}
	return null;
}

export function RouteMap({ geojson, pubLat, pubLon, pubLabel, waypoints = [] }: RouteMapProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const mapRef = useRef<any>(null);
	const initialisedRef = useRef(false);

	useEffect(() => {
		if (initialisedRef.current || !containerRef.current) return;
		initialisedRef.current = true;
		let destroyed = false;
		const container = containerRef.current;

		Promise.all([import("leaflet"), import("leaflet/dist/leaflet.css" as any)]).then(([L]) => {
			// Guard against cleanup having run before this Promise resolved
			if (destroyed || !containerRef.current) return;

			const map = L.default.map(container, { zoomAnimation: false, maxZoom: 19 });
			mapRef.current = map;

			L.default.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
				attribution: "© OpenStreetMap contributors",
				maxZoom: 19,
				detectRetina: true,
			}).addTo(map);

			const layer = L.default.geoJSON(closeLoop(geojson), {
				style: { color: "#2563eb", weight: 5 },
			}).addTo(map);

			// Pub marker
			const pubCoord: [number, number] | null =
				pubLat != null && pubLon != null ? [pubLat, pubLon] : extractStartCoord(geojson);
			if (pubCoord) {
				const pubIcon = L.default.icon({
					iconUrl: "/PintBeer.png",
					iconSize: [36, 36],
					iconAnchor: [18, 36],
					popupAnchor: [0, -38],
				});
				const name = pubLabel ?? "The Pub";
				const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(name + " pub")}/@${pubCoord[0]},${pubCoord[1]},17z`;
				L.default.marker(pubCoord, { icon: pubIcon })
					.addTo(map)
					.bindPopup(
						`<strong>${name}</strong><br/><small style="color:#555">Start &amp; end point</small>` +
						`<br/><a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" style="font-size:0.8rem;color:#1d4ed8">📍 Find on Google Maps</a>`
					);
			}

			// Numbered waypoint markers — skip first waypoint (pub/start, lowest seq)
			const intermediate = waypoints.slice(1);
			intermediate.forEach((wp, i) => {
				const n = i + 1;
				const icon = L.default.divIcon({
					className: "",
					html: `<div style="width:24px;height:24px;background:#4e7a3a;border:2px solid #fff;border-radius:50%;text-align:center;line-height:20px;font-size:11px;font-weight:700;color:#fff;box-shadow:0 1px 4px rgba(0,0,0,0.4);">${n}</div>`,
					iconSize: [24, 24],
					iconAnchor: [12, 12],
					popupAnchor: [0, -14],
				});
				L.default.marker([Number(wp.lat), Number(wp.lon)], { icon })
					.addTo(map)
					.bindPopup(`<strong>Waypoint ${n}</strong>${wp.label ? `<br/>${wp.label}` : ""}`);
			});

			const bounds = layer.getBounds();
			if (bounds.isValid()) {
				map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15, animate: false });
			}
		});

		return () => {
			destroyed = true;
			if (mapRef.current) {
				mapRef.current.stop();
				mapRef.current.remove();
				mapRef.current = null;
			}
			initialisedRef.current = false;
		};
	}, [geojson, pubLat, pubLon, pubLabel, waypoints]);

	return (
		<div
			ref={containerRef}
			style={{
				height: "clamp(280px, 50vw, 480px)",
				width: "100%",
			}}
		/>
	);
}
