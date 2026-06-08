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

type NavState = {
	directionLabel: string;
	bearingDeg: number;
	distToNextM: number;
	distRemainingKm: number;
} | null;

// ── Geometry helpers ──────────────────────────────────────────────────────────

function extractCoords(geojson: any): [number, number][] {
	// Returns ordered [lat, lng] pairs
	const pairs: [number, number][] = [];
	const push = (coords: [number, number][]) =>
		coords.forEach(([lng, lat]) => pairs.push([lat, lng]));
	if (!geojson) return pairs;
	if (geojson.type === "LineString") push(geojson.coordinates);
	else if (geojson.type === "MultiLineString") geojson.coordinates.forEach(push);
	else if (geojson.type === "FeatureCollection")
		geojson.features?.forEach((f: any) => {
			if (f.geometry?.type === "LineString") push(f.geometry.coordinates);
			else if (f.geometry?.type === "MultiLineString") f.geometry.coordinates.forEach(push);
		});
	else if (geojson.type === "Feature") {
		if (geojson.geometry?.type === "LineString") push(geojson.geometry.coordinates);
	}
	return pairs;
}

function toRad(d: number) { return (d * Math.PI) / 180; }
function toDeg(r: number) { return (r * 180) / Math.PI; }

function haversineM(a: [number, number], b: [number, number]) {
	const R = 6371000;
	const dLat = toRad(b[0] - a[0]);
	const dLng = toRad(b[1] - a[1]);
	const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
	return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function bearingDeg(from: [number, number], to: [number, number]) {
	const lat1 = toRad(from[0]), lat2 = toRad(to[0]);
	const dLng = toRad(to[1] - from[1]);
	const y = Math.sin(dLng) * Math.cos(lat2);
	const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
	return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function bearingLabel(deg: number) {
	const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
	return dirs[Math.round(deg / 45) % 8];
}

function getNavInstruction(userLatLng: [number, number], coords: [number, number][]): NavState {
	if (coords.length < 2) return null;

	// Find nearest coord index
	let nearestIdx = 0;
	let nearestDist = Infinity;
	coords.forEach((c, i) => {
		const d = haversineM(userLatLng, c);
		if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
	});

	// Target is a few waypoints ahead of nearest (lookahead ~50m)
	let targetIdx = nearestIdx + 1;
	while (targetIdx < coords.length - 1 && haversineM(coords[nearestIdx], coords[targetIdx]) < 50) {
		targetIdx++;
	}
	if (targetIdx >= coords.length) targetIdx = coords.length - 1;

	const target = coords[targetIdx];
	const distToNextM = haversineM(userLatLng, target);

	// Remaining distance from nearest point to end
	let distRemainingM = haversineM(userLatLng, coords[nearestIdx]);
	for (let i = nearestIdx; i < coords.length - 1; i++) {
		distRemainingM += haversineM(coords[i], coords[i + 1]);
	}

	const deg = bearingDeg(userLatLng, target);
	return {
		bearingDeg: deg,
		directionLabel: bearingLabel(deg),
		distToNextM: Math.round(distToNextM),
		distRemainingKm: Math.round(distRemainingM / 100) / 10,
	};
}

// ── Component ─────────────────────────────────────────────────────────────────

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
	const routeCoordsRef = useRef<[number, number][]>([]);
	const [routes, setRoutes] = useState<RouteRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [gpsError, setGpsError] = useState<string | null>(null);
	const [nav, setNav] = useState<NavState>(null);

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
			const map = L.default.map(containerRef.current, { zoomAnimation: false, maxZoom: 19 }).setView([52.5, -1.9], 10);
			mapRef.current = map;

			L.default
				.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
					attribution: "© OpenStreetMap contributors",
					maxZoom: 19,
					detectRetina: true,
				})
				.addTo(map);

			const allBounds: InstanceType<typeof L.default.LatLngBounds>[] = [];
			let focusedRouteBounds: InstanceType<typeof L.default.LatLngBounds> | null = null;

			routes.forEach((route) => {
				if (!route.geometry_geojson) return;

				const isFocused = focusRouteCode && route.route_code === focusRouteCode;

				const layer = L.default
					.geoJSON(route.geometry_geojson, {
						style: { color: isFocused ? "#1d4ed8" : "#92400e", weight: isFocused ? 6 : 4, opacity: 0.9 },
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
				map.fitBounds(focusedRouteBounds, { padding: [80, 80], maxZoom: 15, animate: false });
			} else if (allBounds.length > 0) {
				const combined = allBounds.reduce((acc, b) => acc.extend(b));
				map.fitBounds(combined, { padding: [50, 50], animate: false });
			}

			// GPS tracking — start watching position
			if (focusRouteCode && navigator.geolocation) {
				// Store route coords for navigation
				const focusedRoute = routes.find((r) => r.route_code === focusRouteCode);
				if (focusedRoute?.geometry_geojson) {
					routeCoordsRef.current = extractCoords(focusedRoute.geometry_geojson);
				}

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
						// Update navigation instruction
						const instruction = getNavInstruction([latitude, longitude], routeCoordsRef.current);
						setNav(instruction);
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

	const arrowDirs: Record<string, string> = {
		N: "↑", NE: "↗", E: "→", SE: "↘", S: "↓", SW: "↙", W: "←", NW: "↖",
	};

	return (
		<main style={{ position: "relative" }}>
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

			{/* Navigation panel — shown only when in Start Route mode and GPS is active */}
			{focusRouteCode && nav && (
				<div style={{
					position: "absolute",
					bottom: "1.5rem",
					left: "50%",
					transform: "translateX(-50%)",
					zIndex: 1000,
					backgroundColor: "#fff",
					border: "2px solid #4e7a3a",
					borderRadius: "1rem",
					boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
					padding: "1rem 1.5rem",
					minWidth: "260px",
					maxWidth: "90vw",
					display: "flex",
					alignItems: "center",
					gap: "1.25rem",
				}}>
					{/* Direction arrow */}
					<div style={{
						fontSize: "2.5rem",
						lineHeight: 1,
						color: "#4e7a3a",
						fontWeight: 700,
						minWidth: "2.5rem",
						textAlign: "center",
					}}>
						{arrowDirs[nav.directionLabel] ?? "↑"}
					</div>

					<div style={{ flex: 1 }}>
						<div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#2c1a0a" }}>
							Head {nav.directionLabel}
						</div>
						<div style={{ fontSize: "0.875rem", color: "#3d2b1a", marginTop: "0.15rem" }}>
							{nav.distToNextM < 1000
								? `Next point: ${nav.distToNextM}m`
								: `Next point: ${(nav.distToNextM / 1000).toFixed(1)}km`}
						</div>
						<div style={{ fontSize: "0.8rem", color: "#4e7a3a", marginTop: "0.15rem", fontWeight: 600 }}>
							{nav.distRemainingKm}km remaining
						</div>
					</div>
				</div>
			)}

			{/* Waiting for GPS message */}
			{focusRouteCode && !nav && !gpsError && (
				<div style={{
					position: "absolute",
					bottom: "1.5rem",
					left: "50%",
					transform: "translateX(-50%)",
					zIndex: 1000,
					backgroundColor: "#fff",
					border: "2px solid #c9bfad",
					borderRadius: "1rem",
					padding: "0.75rem 1.5rem",
					fontSize: "0.875rem",
					color: "#3d2b1a",
					boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
				}}>
					📍 Waiting for GPS signal…
				</div>
			)}
		</main>
	);
}
