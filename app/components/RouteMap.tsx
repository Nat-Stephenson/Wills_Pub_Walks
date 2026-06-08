"use client";

import { useEffect, useRef } from "react";

interface RouteMapProps {
	geojson: any;
}

export function RouteMap({ geojson }: RouteMapProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const mapRef = useRef<any>(null);
	const initialisedRef = useRef(false);

	useEffect(() => {
		if (initialisedRef.current || !containerRef.current) return;
		initialisedRef.current = true;

		const container = containerRef.current;

		Promise.all([import("leaflet"), import("leaflet/dist/leaflet.css" as any)]).then(([L]) => {
			if (!containerRef.current) return;
			const map = L.default.map(container, { zoomAnimation: false });
			mapRef.current = map;

			L.default.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
				attribution: "© OpenStreetMap contributors",
			}).addTo(map);

			const layer = L.default.geoJSON(geojson, {
				style: { color: "#2563eb", weight: 4 },
			}).addTo(map);

			const bounds = layer.getBounds();
			if (bounds.isValid()) {
				map.fitBounds(bounds, { padding: [20, 20], animate: false });
			}
		});

		return () => {
			if (mapRef.current) {
				mapRef.current.stop();
				mapRef.current.remove();
				mapRef.current = null;
			}
		};
	}, [geojson]);

	return <div ref={containerRef} style={{ height: 400, width: "100%" }} />;
}
