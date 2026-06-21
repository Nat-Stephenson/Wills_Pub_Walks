"use client";

import { useEffect, useRef } from "react";

interface RouteMapProps {
	geojson: any;
	pubLat?: number | null;
	pubLon?: number | null;
	pubLabel?: string | null;
	pubWebsite?: string | null;
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

export function RouteMap({ geojson, pubLabel, pubWebsite }: RouteMapProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const mapRef = useRef<any>(null);
	const initialisedRef = useRef(false);

	useEffect(() => {
		if (initialisedRef.current || !containerRef.current) return;
		initialisedRef.current = true;

		const container = containerRef.current;

		Promise.all([import("leaflet"), import("leaflet/dist/leaflet.css" as any)]).then(([L]) => {
			if (!containerRef.current) return;
			const map = L.default.map(container, { zoomAnimation: false, maxZoom: 19 });
			mapRef.current = map;

			L.default.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
				attribution: "© OpenStreetMap contributors",
				maxZoom: 19,
				detectRetina: true,
			}).addTo(map);

			const layer = L.default.geoJSON(geojson, {
				style: { color: "#2563eb", weight: 5 },
			}).addTo(map);

			// Start / pub marker — derived from the first route coordinate (accurate)
			const startCoord = extractStartCoord(geojson);
			if (startCoord) {
				const pubIcon = L.default.icon({
					iconUrl: "/PintBeer.png",
					iconSize: [36, 36],
					iconAnchor: [18, 36],
					popupAnchor: [0, -38],
				});
				const name = pubLabel ?? "The Pub";
				const nameHtml = pubWebsite
					? `<a href="${pubWebsite}" target="_blank" rel="noopener noreferrer" style="color:#92400e;font-weight:700;">${name}</a>`
					: `<strong>${name}</strong>`;
				const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(name + " pub")}/@${startCoord[0]},${startCoord[1]},17z`;
				L.default.marker(startCoord, { icon: pubIcon })
					.addTo(map)
					.bindPopup(
						`${nameHtml}<br/><small style="color:#555">Start &amp; end of walk</small>` +
						`<br/><a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" style="font-size:0.8rem;color:#1d4ed8">📍 Find on Google Maps</a>`
					);
			}

			const bounds = layer.getBounds();
			if (bounds.isValid()) {
				map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15, animate: false });
			}
		});

		return () => {
			if (mapRef.current) {
				mapRef.current.stop();
				mapRef.current.remove();
				mapRef.current = null;
			}
		};
	}, [geojson, pubLabel, pubWebsite]);

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
