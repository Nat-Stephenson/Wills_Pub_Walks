"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { RouteCard } from "@/components/RouteCard";
import type { Route } from "@/types";

export default function HomePage() {
	const [routes, setRoutes] = useState<Route[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [userId, setUserId] = useState<string | null>(null);
	const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());

	useEffect(() => {
		const load = async () => {
			setLoading(true);
			setError(null);
			const supabase = supabaseBrowser();

			const [{ data: { user } }, { data: routeData, error: routeError }] = await Promise.all([
				supabase.auth.getUser(),
				supabase
					.from("routes")
					.select("id, route_code, name, distance_km, duration_hours, story, difficulty, is_published")
					.eq("is_published", true)
					.order("name", { ascending: true }),
			]);

			setLoading(false);

			if (routeError) {
				setError(routeError.message);
				return;
			}

			setRoutes((routeData ?? []) as Route[]);

			if (user) {
				setUserId(user.id);
				const { data: completions } = await supabase
					.from("route_completions")
					.select("route_id")
					.eq("user_id", user.id);
				setCompletedIds(new Set((completions ?? []).map((c: { route_id: string }) => c.route_id)));
			}
		};

		load();
	}, []);

	const handleMarkComplete = useCallback(async (routeId: string) => {
		if (!userId) return;
		const supabase = supabaseBrowser();
		const { error } = await supabase
			.from("route_completions")
			.upsert({ user_id: userId, route_id: routeId, completed_at: new Date().toISOString() });
		if (!error) {
			setCompletedIds((prev) => new Set([...prev, routeId]));
		}
	}, [userId]);

	if (loading) return <main className="container" style={{ padding: 16 }}>Loading…</main>;
	if (error) return <main className="container" style={{ padding: 16, color: "crimson" }}>{error}</main>;

	return (
		<main>
			<div style={{
				display: "flex",
				alignItems: "center",
				gap: "1rem",
				padding: "1.25rem 1rem",
				backgroundColor: "#92400e",
				color: "#fff",
			}}>
				<Image src="/LogoWithName.png" alt="Will's Walks logo" width={48} height={48} style={{ borderRadius: "8px" }} />
				<h1 style={{ margin: 0, fontSize: "1.75rem", fontWeight: 700, letterSpacing: "-0.01em" }}>Will's Walks</h1>
			</div>

			<div className="container" style={{ padding: 16 }}>
				<div style={{ display: "grid", gap: "1rem", marginTop: "1rem" }}>
					{routes.map((r) => (
						<RouteCard
							key={r.id}
							route={r}
							isLoggedIn={!!userId}
							isCompleted={completedIds.has(r.id)}
							onMarkComplete={handleMarkComplete}
						/>
					))}
				</div>
			</div>
		</main>
	);
}