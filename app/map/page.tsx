"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
	return (
		<Suspense fallback={<main style={{ padding: 16 }}>Loading map…</main>}>
			<MapInner />
		</Suspense>
	);
}

function MapInner() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const focusRouteCode = searchParams.get("route");
	const containerRef = useRef<HTMLDivElement>(null);
	const mapRef = useRef<any>(null);
	const initialisedRef = useRef(false);
	const gpsWatchRef = useRef<number | null>(null);
	const userMarkerRef = useRef<any>(null);
	const [routes, setRoutes] = useState<RouteRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [gpsError, setGpsError] = useState<string | null>(null);

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
			const map = L.default.map(containerRef.current, { zoomAnimation: false }).setView([52.5, -1.9], 10);
			mapRef.current = map;

			L.default
				.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
					attribution: "© OpenStreetMap contributors",
				})
				.addTo(map);

			const allBounds: InstanceType<typeof L.default.LatLngBounds>[] = [];
			let focusedRouteBounds: InstanceType<typeof L.default.LatLngBounds> | null = null;

			routes.forEach((route) => {
				if (!route.geometry_geojson) return;

				const isFocused = focusRouteCode && route.route_code === focusRouteCode;

				const layer = L.default
					.geoJSON(route.geometry_geojson, {
						style: { color: isFocused ? "#1d4ed8" : "#92400e", weight: isFocused ? 5 : 4, opacity: 0.8 },
					})
					.addTo(map);

				const bounds = layer.getBounds();
				if (bounds.isValid()) {
					allBounds.push(bounds);
					if (isFocused) focusedRouteBounds = bounds;

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

					const treeIcon = L.default.icon({
						iconUrl: "/Tree.png",
						iconSize: [36, 36],
						iconAnchor: [18, 36],
						popupAnchor: [0, -38],
					});

					L.default
						.marker(center, { icon: treeIcon })
						.addTo(map)
						.bindPopup(popup);
				}
			});

			// Zoom to focused route or all routes
			if (focusedRouteBounds) {
				map.fitBounds(focusedRouteBounds, { padding: [60, 60], animate: false });
			} else if (allBounds.length > 0) {
				const combined = allBounds.reduce((acc, b) => acc.extend(b));
				map.fitBounds(combined, { padding: [40, 40], animate: false });
			}

			// GPS tracking — start watching position
			if (focusRouteCode && navigator.geolocation) {
				const userIcon = L.default.divIcon({
					className: "",
					html: `<div style="
						width:18px;height:18px;
						background:#2563eb;
						border:3px solid #fff;
						border-radius:50%;
						box-shadow:0 0 0 3px rgba(37,99,235,0.35);
					"></div>`,
					iconSize: [18, 18],
					iconAnchor: [9, 9],
				});

				const watchId = navigator.geolocation.watchPosition(
					(pos) => {
						if (destroyed) return;
						const { latitude, longitude } = pos.coords;
						const latlng = L.default.latLng(latitude, longitude);
						if (!userMarkerRef.current) {
							userMarkerRef.current = L.default.marker(latlng, { icon: userIcon, zIndexOffset: 1000 })
								.addTo(map)
								.bindPopup("You are here");
						} else {
							userMarkerRef.current.setLatLng(latlng);
						}
					},
					(err) => {
						if (!destroyed) setGpsError(`GPS unavailable: ${err.message}`);
					},
					{ enableHighAccuracy: true, maximumAge: 5000 },
				);
				gpsWatchRef.current = watchId;
			}
		});

		return () => {
			destroyed = true;
			if (gpsWatchRef.current !== null) {
				navigator.geolocation.clearWatch(gpsWatchRef.current);
				gpsWatchRef.current = null;
			}
			if (mapRef.current) {
				mapRef.current.stop();
				mapRef.current.remove();
				mapRef.current = null;
				initialisedRef.current = false;
			}
		};
	}, [loading, routes, router, focusRouteCode]);

	if (loading)
		return <main style={{ padding: 16 }}>Loading map…</main>;
	if (error)
		return <main style={{ padding: 16, color: "crimson" }}>{error}</main>;

	return (
		<main>
			{gpsError && (
				<div style={{ padding: "0.5rem 1rem", backgroundColor: "#fef9c3", color: "#854d0e", fontSize: "0.85rem" }}>
					{gpsError}
				</div>
			)}
			<div
				ref={containerRef}
				style={{
					height: gpsError ? "calc(100dvh - 72px - 36px)" : "calc(100dvh - 72px)",
					width: "100%",
				}}
			/>
		</main>
	);
}
