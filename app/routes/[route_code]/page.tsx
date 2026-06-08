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
};

export default function RoutePage() {
	const router = useRouter();
	const params = useParams<{ route_code: string }>();
	const routeCode = params.route_code;

	const supabase = supabaseBrowser();

	const [route, setRoute] = useState<RouteRow | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const [marking, setMarking] = useState(false);
	const [markedMessage, setMarkedMessage] = useState<string | null>(null);

	useEffect(() => {
		const load = async () => {
			setLoading(true);
			setError(null);

			const { data, error } = await supabase
				.from("routes")
				.select(
					"id, route_code, name, geometry_geojson, story, safety_note, distance_km, duration_hours, difficulty",
				)
				.eq("route_code", routeCode)
				.maybeSingle();

			setLoading(false);

			if (error) {
				setError(error.message);
				return;
			}

			setRoute((data ?? null) as RouteRow | null);
		};

		load();
	}, [routeCode, supabase]);

	const markCompleted = async () => {
		if (!route) return;

		setError(null);
		setMarkedMessage(null);
		setMarking(true);

		const {
			data: { user },
			error: userError,
		} = await supabase.auth.getUser();

		if (userError) {
			setError(userError.message);
			setMarking(false);
			return;
		}

		if (!user) {
			router.push("/login");
			return;
		}

		const { error } = await supabase.from("route_completions").insert({
			user_id: user.id,
			route_id: route.id,
		});

		setMarking(false);

		if (error) {
			if (error.message.toLowerCase().includes("duplicate")) {
				setMarkedMessage("Already completed");
				return;
			}

			setError(error.message);
			return;
		}

		setMarkedMessage("Marked as completed");
	};

	if (loading) return <main style={{ padding: 16 }}>Loading…</main>;
	if (error) return <main style={{ padding: 16, color: "crimson" }}>{error}</main>;
	if (!route) return <main style={{ padding: 16 }}>Route not found</main>;

	return (
		<main style={{ padding: 16 }}>
			<h1>{route.name}</h1>

			{route.story ? <p>{route.story}</p> : null}

			{route.safety_note ? (
				<section>
					<h2>Safety notes</h2>
					<p>{route.safety_note}</p>
				</section>
			) : null}

			<button onClick={markCompleted} disabled={marking}>
				{marking ? "Marking…" : "Mark completed"}
			</button>

			{markedMessage ? <p>{markedMessage}</p> : null}

			{route.geometry_geojson ? (
				<RouteMap geojson={route.geometry_geojson} />
			) : (
				<p>No map geometry saved for this route.</p>
			)}
		</main>
	);
}