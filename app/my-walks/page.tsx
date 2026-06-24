"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import mapIcon from "@/app/assets/Map.png";
import trekIcon from "@/app/assets/Trek.png";
import pintIcon from "@/app/assets/PintBeer.png";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { RouteCard } from "@/components/RouteCard";
import type { Route } from "@/types";

export default function MyWalksPage() {
	const router = useRouter();
	const [completedRoutes, setCompletedRoutes] = useState<Route[]>([]);
	const [favouriteRoutes, setFavouriteRoutes] = useState<Route[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const load = async () => {
			setLoading(true);
			setError(null);
			const supabase = supabaseBrowser();

			const { data: { user }, error: userError } = await supabase.auth.getUser();

			if (userError || !user) {
				router.push("/login");
				return;
			}

			const [{ data: completions, error: cErr }, { data: favourites, error: fErr }] = await Promise.all([
				supabase
					.from("route_completions")
					.select("routes ( id, route_code, name, distance_km, duration_minutes, story, difficulty, is_published, pub_label, pub_postcode )")
					.eq("user_id", user.id)
					.order("completed_at", { ascending: false }),
				supabase
					.from("route_favourites")
.select("routes ( id, route_code, name, distance_km, duration_minutes, story, difficulty, is_published, pub_label, pub_postcode )")
					.eq("user_id", user.id),
			]);

			setLoading(false);

			if (cErr || fErr) {
				setError((cErr ?? fErr)!.message);
				return;
			}

			setCompletedRoutes(
				(completions ?? []).map((r: any) => r.routes).filter(Boolean) as Route[]
			);
			setFavouriteRoutes(
				(favourites ?? []).map((r: any) => r.routes).filter(Boolean) as Route[]
			);
		};

		load();
	}, [router]);

	if (loading) return <main style={{ padding: 16 }}>Loading…</main>;
	if (error) return <main style={{ padding: 16, color: "crimson" }}>{error}</main>;

	const completedIds = new Set(completedRoutes.map((r) => r.id));
	const favouriteIds = new Set(favouriteRoutes.map((r) => r.id));
	// Merge: all unique routes from either list
	const allRouteMap = new Map<string, Route>();
	[...completedRoutes, ...favouriteRoutes].forEach((r) => allRouteMap.set(r.id, r));
	const allRoutes = Array.from(allRouteMap.values());

	return (
		<main>
			<div style={{
				backgroundColor: "#f7f3ed",
				borderTop: "8px solid #4e7a3a",
				borderBottom: "8px solid #4e7a3a",
				color: "#2c1a0a",
				padding: "2.5rem 2rem 2rem",
				textAlign: "center",
			}}>
				<Image
					src="/LogoWithName.png"
					alt="Will's Walks logo"
					width={220}
					height={220}
					style={{ borderRadius: "16px", marginBottom: "1rem" }}
				/>
				<h1 style={{ margin: "0 0 0.75rem", fontSize: "2.25rem", fontWeight: 800, letterSpacing: "-0.02em", color: "#2c1a0a" }}>
					My Walks
				</h1>
				<p style={{ margin: "0 auto", maxWidth: "480px", fontSize: "1.05rem", lineHeight: 1.6, color: "#3d2b1a" }}>
					Your completed and favourited routes, all in one place.
				</p>
				<div style={{ display: "flex", justifyContent: "center", gap: "2rem", marginTop: "1.5rem", flexWrap: "wrap" }}>
					<span style={{ fontSize: "0.9rem", color: "#4e7a3a", fontWeight: 600 }}>✓ {completedRoutes.length} completed</span>
					<span style={{ fontSize: "0.9rem", color: "#92400e", fontWeight: 600 }}>♥ {favouriteRoutes.length} favourited</span>
				</div>
			</div>

			<div style={{ padding: "1.5rem 1.5rem 2rem", maxWidth: "1200px", margin: "0 auto" }}>
				{allRoutes.length === 0 ? (
					<p style={{ color: "#64748b", textAlign: "center", marginTop: "2rem" }}>
						No walks yet — head to the{" "}
						<button onClick={() => router.push("/")} style={{ background: "none", border: "none", color: "#92400e", fontWeight: 600, cursor: "pointer", padding: 0 }}>
							home page
						</button>{" "}
						to explore routes.
					</p>
				) : (
					<div className="routeGrid">
						{allRoutes.map((r) => (
							<RouteCard
								key={r.id}
								route={r}
								isCompleted={completedIds.has(r.id)}
								isFavourited={favouriteIds.has(r.id)}
							/>
						))}
					</div>
				)}
			</div>
		</main>
	);
}