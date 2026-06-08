"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import "leaflet/dist/leaflet.css";

type RouteRow = {
	id: string;
	route_code: string;
	name: string;
	geometry_geojson: any | null;
	distance_km: number | null;
	duration_hours: number | null;
	difficulty: number | null;
};

export default function MapPage() {
	const router = useRouter();
	const containerRef = useRef<HTMLDivElement>(null);
	const mapRef = useRef<any>(null);
	const initialisedRef = useRef(false);
	const [routes, setRoutes] = useState<RouteRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const supabase = supabaseBrowser();
		supabase
			.from("routes")
			.select("id, route_code, name, geometry_geojson, distance_km, duration_hours, difficulty")
			.eq("is_published", true)
			.then(({ data, error }) => {
				if (error) setError(error.message);
				else setRoutes((data ?? []) as RouteRow[]);
				setLoading(false);
			});
	}, []);

	useEffect(() => {
		if (loading || initialisedRef.current || !containerRef.current) return;
		initialisedRef.current = true;

		let destroyed = false;

		// Leaflet must be imported dynamically (SSR-safe)
		import("leaflet").then((L) => {
			if (destroyed || !containerRef.current) return;
			const map = L.default.map(containerRef.current, { zoomAnimation: false }).setView([52.5, -1.9], 8);
			mapRef.current = map;

			L.default
				.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
					attribution: "© OpenStreetMap contributors",
				})
				.addTo(map);

			const allBounds: InstanceType<typeof L.default.LatLngBounds>[] = [];

			routes.forEach((route) => {
				if (!route.geometry_geojson) return;

				const layer = L.default
					.geoJSON(route.geometry_geojson, {
						style: { color: "#92400e", weight: 4, opacity: 0.8 },
					})
					.addTo(map);

				const bounds = layer.getBounds();
				if (bounds.isValid()) {
					allBounds.push(bounds);

					// Clickable circle marker at the route centre
					const center = bounds.getCenter();
					const difficultyLabel = route.difficulty ? `Grade ${route.difficulty}` : "";
					const popup = L.default
						.popup()
						.setContent(
							`<strong>${route.name}</strong><br/>` +
								(route.distance_km ? `📏 ${route.distance_km} km&nbsp;&nbsp;` : "") +
								(route.duration_hours ? `⏱️ ${route.duration_hours} hrs&nbsp;&nbsp;` : "") +
								(difficultyLabel ? `🏔️ ${difficultyLabel}` : "") +
								`<br/><a href="/routes/${route.route_code}" style="color:#92400e;font-weight:600;">View route →</a>`,
						);

					L.default
						.circleMarker(center, {
							radius: 8,
							color: "#92400e",
							fillColor: "#92400e",
							fillOpacity: 1,
							weight: 2,
						})
						.addTo(map)
						.bindPopup(popup);
				}
			});

			if (allBounds.length > 0) {
				const combined = allBounds.reduce((acc, b) => acc.extend(b));
				map.fitBounds(combined, { padding: [40, 40], animate: false });
			}
		});

		return () => {
			destroyed = true;
			if (mapRef.current) {
				mapRef.current.stop();
				mapRef.current.remove();
				mapRef.current = null;
			}
		};
	}, [loading, routes, router]);

	if (loading)
		return <main style={{ padding: 16 }}>Loading map…</main>;
	if (error)
		return <main style={{ padding: 16, color: "crimson" }}>{error}</main>;

	return (
		<main>
			<div
				ref={containerRef}
				style={{
					height: "calc(100dvh - 72px)",
					width: "100%",
				}}
			/>
		</main>
	);
}
