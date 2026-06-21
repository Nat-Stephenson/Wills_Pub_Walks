"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { RouteMap } from "@/components/RouteMap";

type RouteRow = {
	id: string;
	route_code: string;
	name: string;
	geometry_geojson: any | null;
	story: string | null;
	safety_note: string | null;
	distance_km: number | null;
	duration_hours: number | null;
	difficulty: number | null;
	pub_label: string | null;
	pub_lat: number | null;
	pub_lon: number | null;
	pub_website: string | null;
};

export default function RoutePage() {
	const router = useRouter();
	const params = useParams<{ route_code: string }>();
	const routeCode = params.route_code;

	const [route, setRoute] = useState<RouteRow | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [userId, setUserId] = useState<string | null>(null);
	const [isCompleted, setIsCompleted] = useState(false);
	const [isFavourited, setIsFavourited] = useState(false);
	const [actionLoading, setActionLoading] = useState(false);
	const [showLoginPrompt, setShowLoginPrompt] = useState(false);

	useEffect(() => {
		const load = async () => {
			setLoading(true);
			setError(null);
			const supabase = supabaseBrowser();

			const [{ data }, { data: { user } }] = await Promise.all([
				supabase
					.from("routes")
					.select("id, route_code, name, geometry_geojson, story, safety_note, distance_km, duration_hours, difficulty, pub_label, pub_lat, pub_lon, pub_website")
					.eq("route_code", routeCode)
					.maybeSingle(),
				supabase.auth.getUser(),
			]);

			setLoading(false);
			setRoute((data ?? null) as RouteRow | null);

			if (user && data) {
				setUserId(user.id);
				const [{ data: completions }, { data: favourites }] = await Promise.all([
					supabase.from("route_completions").select("route_id").eq("user_id", user.id).eq("route_id", data.id),
					supabase.from("route_favourites").select("route_id").eq("user_id", user.id).eq("route_id", data.id),
				]);
				setIsCompleted((completions ?? []).length > 0);
				setIsFavourited((favourites ?? []).length > 0);
			}
		};

		load();
	}, [routeCode]);

	const handleProtectedAction = (action: () => void) => {
		if (!userId) { setShowLoginPrompt(true); return; }
		action();
	};

	const handleMarkComplete = async () => {
		if (!route || !userId) return;
		setActionLoading(true);
		const supabase = supabaseBrowser();
		await supabase.from("route_completions").upsert({ user_id: userId, route_id: route.id, completed_at: new Date().toISOString() });
		setIsCompleted(true);
		setActionLoading(false);
	};

	const handleToggleFavourite = async () => {
		if (!route || !userId) return;
		setActionLoading(true);
		const supabase = supabaseBrowser();
		if (isFavourited) {
			await supabase.from("route_favourites").delete().eq("user_id", userId).eq("route_id", route.id);
			setIsFavourited(false);
		} else {
			await supabase.from("route_favourites").upsert({ user_id: userId, route_id: route.id });
			setIsFavourited(true);
		}
		setActionLoading(false);
	};

	if (loading) return <main style={{ padding: 16 }}>Loading…</main>;
	if (error) return <main style={{ padding: 16, color: "crimson" }}>{error}</main>;
	if (!route) return <main style={{ padding: 16 }}>Route not found</main>;

	const difficultyLabel = route.difficulty ? `Grade ${route.difficulty}` : null;

	return (
		<main style={{ maxWidth: 800, margin: "0 auto", padding: "1.5rem 1rem 3rem" }}>
			<button
				onClick={() => router.back()}
				style={{ background: "none", border: "none", cursor: "pointer", color: "#92400e", fontWeight: 600, padding: "0 0 1rem", fontSize: "0.9rem" }}
			>
				← Back
			</button>

			<h1 style={{ margin: "0 0 0.5rem", fontSize: "1.75rem", fontWeight: 800, color: "#1e293b" }}>{route.name}</h1>

			<div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1rem" }}>
				{route.distance_km != null && <span style={{ fontSize: "0.9rem", color: "#475569" }}>📏 {route.distance_km} km</span>}
				{route.duration_hours != null && <span style={{ fontSize: "0.9rem", color: "#475569" }}>⏱️ {route.duration_hours} hrs</span>}
				{difficultyLabel && <span style={{ fontSize: "0.9rem", color: "#475569" }}>🏔 {difficultyLabel}</span>}
			</div>

			{/* Complete + Favourite actions */}
			<div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1.5rem", alignItems: "center" }}>
				<button
					onClick={() => router.push(`/map?route=${route.route_code}`)}
					style={{ padding: "0.5rem 1.25rem", backgroundColor: "#92400e", color: "#fff", border: "none", borderRadius: "0.5rem", fontWeight: 600, cursor: "pointer", fontSize: "0.9rem" }}
				>
					Start Route
				</button>

				{isCompleted ? (
					<div style={{ padding: "0.5rem 1rem", backgroundColor: "#dcfce7", color: "#166534", borderRadius: "9999px", fontWeight: 600, fontSize: "0.875rem" }}>
						✓ Completed
					</div>
				) : (
					<button
						onClick={() => handleProtectedAction(handleMarkComplete)}
						disabled={actionLoading}
						style={{ padding: "0.5rem 1.25rem", backgroundColor: "transparent", color: "#166534", border: "1.5px solid #166534", borderRadius: "0.5rem", fontWeight: 600, cursor: "pointer", fontSize: "0.9rem" }}
					>
						{actionLoading ? "Saving…" : "Mark as Completed"}
					</button>
				)}

				<button
					onClick={() => handleProtectedAction(handleToggleFavourite)}
					disabled={actionLoading}
					style={{
						padding: "0.5rem 0.9rem",
						backgroundColor: isFavourited ? "#fff1f2" : "transparent",
						color: isFavourited ? "#e11d48" : "#94a3b8",
						border: `1.5px solid ${isFavourited ? "#e11d48" : "#cbd5e1"}`,
						borderRadius: "0.5rem",
						fontWeight: 600,
						cursor: "pointer",
						fontSize: "1.1rem",
					}}
					title={isFavourited ? "Remove from favourites" : "Add to favourites"}
				>
					{isFavourited ? "♥" : "♡"}
				</button>
			</div>

			{showLoginPrompt && (
				<div style={{ padding: "0.75rem 1rem", backgroundColor: "#fef9c3", border: "1px solid #fde68a", borderRadius: "0.5rem", marginBottom: "1.5rem", fontSize: "0.875rem", color: "#92400e" }}>
					<p style={{ margin: "0 0 0.5rem", fontWeight: 500 }}>You need to be logged in to do this.</p>
					<div style={{ display: "flex", gap: "0.5rem" }}>
						<button onClick={() => router.push("/login")} style={{ padding: "0.35rem 0.9rem", backgroundColor: "#92400e", color: "#fff", border: "none", borderRadius: "0.4rem", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer" }}>Log in</button>
						<button onClick={() => setShowLoginPrompt(false)} style={{ padding: "0.35rem 0.9rem", backgroundColor: "transparent", color: "#92400e", border: "1px solid #92400e", borderRadius: "0.4rem", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer" }}>Cancel</button>
					</div>
				</div>
			)}

			{route.story && <p style={{ color: "#475569", lineHeight: 1.7, marginBottom: "1.5rem" }}>{route.story}</p>}

			{route.pub_label && (
				<div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1.5rem", padding: "0.75rem 1rem", backgroundColor: "#fef3c7", border: "1px solid #fde68a", borderRadius: "0.5rem" }}>
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img src="/PintBeer.png" alt="" width={28} height={28} />
					<div>
						{route.pub_website ? (
							<a href={route.pub_website} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700, color: "#92400e", textDecoration: "underline" }}>{route.pub_label}</a>
						) : (
							<span style={{ fontWeight: 700, color: "#92400e" }}>{route.pub_label}</span>
						)}
						{route.pub_lat != null && route.pub_lon != null && (
							<span style={{ marginLeft: "0.75rem", fontSize: "0.8rem", color: "#78350f" }}>
								{route.pub_lat.toFixed(5)}, {route.pub_lon.toFixed(5)}
							</span>
						)}
					</div>
				</div>
			)}

			{route.safety_note && (
				<section style={{ backgroundColor: "#fef9c3", border: "1px solid #fde68a", borderRadius: "0.5rem", padding: "1rem", marginBottom: "1.5rem" }}>
					<h2 style={{ margin: "0 0 0.5rem", fontSize: "1rem", fontWeight: 700 }}>⚠ Safety notes</h2>
					<p style={{ margin: 0, color: "#92400e", fontSize: "0.9rem" }}>{route.safety_note}</p>
				</section>
			)}

			{route.geometry_geojson ? (
				<RouteMap
					geojson={route.geometry_geojson}
					pubLabel={route.pub_label}
					pubWebsite={route.pub_website}
				/>
			) : (
				<p style={{ color: "#94a3b8" }}>No map geometry saved for this route.</p>
			)}
		</main>
	);
}