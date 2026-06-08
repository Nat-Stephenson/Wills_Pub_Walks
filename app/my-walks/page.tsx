"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type CompletionRow = {
	completed_at: string;
	routes: {
		id: string;
		route_code: string;
		name: string;
		distance_km: number | null;
		duration_hours: number | null;
	} | null;
};

export default function MyWalksPage() {
	const router = useRouter();
	const supabase = supabaseBrowser();
	const [rows, setRows] = useState<CompletionRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const load = async () => {
			setLoading(true);
			setError(null);

			const {
				data: { user },
				error: userError,
			} = await supabase.auth.getUser();

			// "Auth session missing!" means no session — redirect instead of showing error
			if (userError) {
				setLoading(false);
				router.push("/login");
				return;
			}

			if (!user) {
				router.push("/login");
				return;
			}

			// This join assumes your foreign key is route_completions.route_id -> routes.id
			// Supabase join syntax: select routes(...) via the relationship.
			const { data, error } = await supabase
				.from("route_completions")
				.select(
					`completed_at,
					 routes ( id, route_code, name, distance_km, duration_hours )`,  
				)
				.eq("user_id", user.id)
				.order("completed_at", { ascending: false });

			setLoading(false);

			if (error) {
				setError(error.message);
				return;
			}

			setRows((data ?? []) as unknown as CompletionRow[]);
		};

		load();
	}, [router, supabase]);

	const stats = useMemo(() => {
		const totalWalks = rows.length;
		const totalDistanceKm = rows.reduce(
			(sum, r) => sum + (r.routes?.distance_km ?? 0),
			0,
		);
		const totalHours = rows.reduce(
			(sum, r) => sum + (r.routes?.duration_hours ?? 0),
			0,
		);
		return { totalWalks, totalDistanceKm, totalHours };
	}, [rows]);

	if (loading) return <main style={{ padding: 16 }}>Loading…</main>;
	if (error) return <main style={{ padding: 16, color: "crimson" }}>{error}</main>;

	return (
		<main style={{ padding: 16 }}>
			<h1>My Walks</h1>

			<p>Total walks: {stats.totalWalks}</p>
			<p>Total distance (km): {stats.totalDistanceKm.toFixed(1)}</p>
			<p>Total time (hours): {stats.totalHours.toFixed(1)}</p>

			<h2>Completed routes</h2>
			<ul>
				{rows.map((r, idx) => (
					<li key={idx}>
						{r.routes ? r.routes.name : "Unknown route"} (completed:{" "}
						{new Date(r.completed_at).toLocaleDateString("en-GB")})
					</li>
				))}
			</ul>
		</main>
	);
}