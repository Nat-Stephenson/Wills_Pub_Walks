"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { RouteCard } from "@/components/RouteCard";
import type { Route } from "@/types";

export default function HomePage() {
	const supabase = supabaseBrowser();
	const [routes, setRoutes] = useState<Route[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const load = async () => {
			setLoading(true);
			setError(null);

			const { data, error } = await supabase
				.from("routes")
				.select("id, route_code, name, distance_km, duration_hours, story, safety_note, difficulty, is_published")
				.eq("is_published", true)
				.order("name", { ascending: true });

			setLoading(false);

			if (error) {
				setError(error.message);
				return;
			}

			setRoutes((data ?? []) as Route[]);
		};

		load();
	}, [supabase]);

	if (loading) return <main className="container" style={{ padding: 16 }}>Loading…</main>;
	if (error) return <main className="container" style={{ padding: 16, color: "crimson" }}>{error}</main>;

	return (
		<main className="container" style={{ padding: 16 }}>
			<h1>Routes</h1>
			<div style={{ display: "grid", gap: "1rem", marginTop: "1rem" }}>
				{routes.map((r) => (
					<RouteCard key={r.id} route={r} />
				))}
			</div>
		</main>
	);
}