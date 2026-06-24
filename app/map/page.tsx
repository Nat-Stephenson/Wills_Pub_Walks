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
	duration_minutes: number | null;
	difficulty: number | null;
	pub_label: string | null;
	pub_lat: number | null;
	pub_lon: number | null;
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

/** Appends the first coordinate of a LineString to close the loop visually if within 500 m. */
function closeLoop(geojson: any): any {
	if (!geojson) return geojson;
	if (geojson.type === "Feature") return { ...geojson, geometry: closeLoop(geojson.geometry) };
	if (geojson.type === "LineString") {
		const coords: number[][] = geojson.coordinates;
		if (coords.length < 2) return geojson;
		const first = coords[0];
		const last = coords[coords.length - 1];
		const R = 6371000, toR = (d: number) => (d * Math.PI) / 180;
		const dLat = toR(last[1] - first[1]), dLon = toR(last[0] - first[0]);
		const a = Math.sin(dLat / 2) ** 2 + Math.cos(toR(first[1])) * Math.cos(toR(last[1])) * Math.sin(dLon / 2) ** 2;
		const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
		if (dist <= 500) return { ...geojson, coordinates: [...coords, first] };
	}
	return geojson;
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
		const [focusedWaypoints, setFocusedWaypoints] = useState<{ seq: number; lat: number; lon: number; label?: string | null }[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [gpsError, setGpsError] = useState<string | null>(null);
	const [nav, setNav] = useState<NavState>(null);

	useEffect(() => {
		const supabase = supabaseBrowser();
		const load = async () => {
			const { data, error } = await supabase
				.from("routes")
				.select("id, route_code, name, geometry_geojson, distance_km, duration_minutes, difficulty, pub_label, pub_lat, pub_lon")
				.eq("is_published", true);
			if (error) { setError(error.message); setLoading(false); return; }
			const typedRoutes = (data ?? []) as RouteRow[];
			setRoutes(typedRoutes);
			if (focusRouteCode) {
				const focused = typedRoutes.find(r => r.route_code === focusRouteCode);
				if (focused) {
					const { data: wps } = await supabase
						.from("route_waypoints")
						.select("seq, lat, lon, label")
						.eq("route_id", focused.id)
						.order("seq", { ascending: true });
					setFocusedWaypoints((wps ?? []) as { seq: number; lat: number; lon: number }[]);
				}
			}
			setLoading(false);
		};
		load();
	}, [focusRouteCode]);

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

			const pubIcon = L.default.icon({
				iconUrl: "/PintBeer.png",
				iconSize: [32, 32],
				iconAnchor: [16, 32],
				popupAnchor: [0, -34],
			});
			const routeIcon = L.default.divIcon({
				className: "",
				html: `<div style="
					width: 28px; height: 28px;
					background: #4e7a3a;
					border: 3px solid #fff;
					border-radius: 50% 50% 50% 0;
					transform: rotate(-45deg);
					box-shadow: 0 2px 6px rgba(0,0,0,0.35);
				"></div>`,
				iconSize: [28, 28],
				iconAnchor: [14, 28],
				popupAnchor: [0, -30],
			});

			routes.forEach((route) => {
				const isFocused = focusRouteCode && route.route_code === focusRouteCode;

				// Draw route line if geometry exists
				if (route.geometry_geojson) {
					const layer = L.default
						.geoJSON(closeLoop(route.geometry_geojson), {
							style: { color: isFocused ? "#1d4ed8" : "#92400e", weight: isFocused ? 6 : 4, opacity: 0.9 },
						})
						.addTo(map);

					const bounds = layer.getBounds();
					if (bounds.isValid()) {
						allBounds.push(bounds);
						if (isFocused) focusedRouteBounds = bounds;

						// Tree marker at route centre
						const center = bounds.getCenter();
						const difficultyLabel = route.difficulty ? `Grade ${route.difficulty}` : "";
						const popup = L.default
							.popup()
							.setContent(
								`<strong>${route.name}</strong><br/>` +
									(route.distance_km ? `📏 ${route.distance_km} km&nbsp;&nbsp;` : "") +
									(route.duration_minutes ? `⏱️ ${route.duration_minutes} mins&nbsp;&nbsp;` : "") +
									(difficultyLabel ? `🏔️ ${difficultyLabel}` : "") +
									`<br/><a href="/routes/${route.route_code}" style="color:#92400e;font-weight:600;">View route →</a>`,
							);

						L.default.marker(center, { icon: routeIcon }).addTo(map).bindPopup(popup);

						// Pub / start marker — derived from the first geometry coordinate (accurate)
						const startCoord = extractStartCoord(route.geometry_geojson);
						if (startCoord) {
							const pubName = route.pub_label ?? "The Pub";
							const mapsSearchUrl = `https://www.google.com/maps/search/${encodeURIComponent(pubName + " pub")}/@${startCoord[0]},${startCoord[1]},17z`;
							const pubPopupContent =
								`<strong>${pubName}</strong>` +
								`<br/><small style="color:#555">Start &amp; end point</small>` +
								`<br/><a href="${mapsSearchUrl}" target="_blank" rel="noopener noreferrer" style="font-size:0.8rem;color:#1d4ed8">📍 Find on Google Maps</a>`;
							L.default
								.marker(startCoord, { icon: pubIcon })
								.addTo(map)
								.bindPopup(pubPopupContent);
						}
					}
				}
			});

if (focusRouteCode && focusedWaypoints.length > 0) {
const intermediate = focusedWaypoints.slice(1);
intermediate.forEach((wp, i) => {
const n = i + 1;
const wpIcon = L.default.divIcon({
className: "",
html: `<div style="width:24px;height:24px;background:#4e7a3a;border:2px solid #fff;border-radius:50%;text-align:center;line-height:20px;font-size:11px;font-weight:700;color:#fff;box-shadow:0 1px 4px rgba(0,0,0,0.4);">${n}</div>`,
iconSize: [24, 24],
iconAnchor: [12, 12],
popupAnchor: [0, -14],
});
L.default.marker([Number(wp.lat), Number(wp.lon)], { icon: wpIcon })
.addTo(map)
.bindPopup(`<strong>Waypoint ${n}</strong>${wp.label ? `<br/>${wp.label}` : ""}`);
});
}

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
	}, [loading, routes, router, focusRouteCode, focusedWaypoints]);

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
