"use client";

import { useEffect, useRef } from "react";

interface RouteMapProps {
	geojson: any;
	pubLat?: number | null;
	pubLon?: number | null;
	pubLabel?: string | null;
}

export function RouteMap({ geojson, pubLat, pubLon, pubLabel }: RouteMapProps) {
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

			// Pub marker using PintBeer.png
			if (pubLat != null && pubLon != null) {
				const pubIcon = L.default.icon({
					iconUrl: "/PintBeer.png",
					iconSize: [36, 36],
					iconAnchor: [18, 36],
					popupAnchor: [0, -38],
				});
				L.default.marker([pubLat, pubLon], { icon: pubIcon })
					.addTo(map)
					.bindPopup(`<strong>${pubLabel ?? "The Pub"}</strong><br/>${pubLat.toFixed(5)}, ${pubLon.toFixed(5)}`);
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
	}, [geojson, pubLat, pubLon, pubLabel]);

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
