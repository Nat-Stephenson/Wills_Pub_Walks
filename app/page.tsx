import Image from "next/image";
import mapIcon from "@/app/assets/Map.png";
import trekIcon from "@/app/assets/Trek.png";
import pintIcon from "@/app/assets/PintBeer.png";
import { createClient } from "@supabase/supabase-js";
import { RouteCard } from "@/components/RouteCard";
import { RouteFilter } from "@/components/RouteFilter";
import type { Route } from "@/types";

export default async function HomePage() {
	const supabase = createClient(
		process.env.NEXT_PUBLIC_SUPABASE_URL!,
		process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
	);

	const { data: routes, error } = await supabase
		.from("routes")
		.select("id, route_code, name, distance_km, duration_minutes, story, difficulty, is_published, pub_label, pub_lat, pub_lon, pub_postcode, route_type, walk_type, region")
		.eq("is_published", true)
		.order("name", { ascending: true });

	if (error) {
		return <main style={{ padding: 16, color: "crimson" }}>{error.message}</main>;
	}

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
					Discover, Pint, Enjoy
				</h1>
				<p style={{ margin: "0 auto", maxWidth: "520px", fontSize: "1.05rem", lineHeight: 1.6, color: "#3d2b1a" }}>
					A growing collection of UK pub walks, each route centred around a great local, perfect for a weekend adventure.
					Browse the routes below, fire up the GPS tracker, and earn your pint.
				</p>
				<div style={{ display: "flex", justifyContent: "center", gap: "2rem", marginTop: "1.5rem", flexWrap: "wrap" }}>
					<span style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.9rem", color: "#2c1a0a", fontWeight: 500 }}>
						<Image src={mapIcon} alt="" width={24} height={24} />
						Interactive maps
					</span>
					<span style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.9rem", color: "#2c1a0a", fontWeight: 500 }}>
						<Image src={trekIcon} alt="" width={24} height={24} />
						GPS tracking
					</span>
					<span style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.9rem", color: "#2c1a0a", fontWeight: 500 }}>
						<Image src={pintIcon} alt="" width={24} height={24} />
						Pub at the finish
					</span>
					<span style={{ fontSize: "0.9rem", color: "#4e7a3a", fontWeight: 600 }}>✓ Track your completions</span>
				</div>
			</div>

			<div style={{ padding: "1.5rem 1.5rem 2rem", maxWidth: "1200px", margin: "0 auto" }}>
				<h2 style={{ margin: "0 0 1.25rem", fontSize: "1.25rem", fontWeight: 700, color: "#1e293b" }}>
					All Routes
				</h2>
				<RouteFilter routes={(routes ?? []) as Route[]} />
			</div>
		</main>
	);
}