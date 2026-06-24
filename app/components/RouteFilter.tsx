"use client";

import { useState, useMemo } from "react";
import { RouteCard } from "./RouteCard";
import type { Route } from "@/types";

interface RouteFilterProps {
	routes: Route[];
}

function uniqueSorted(values: (string | null)[]): string[] {
	return [...new Set(values.filter((v): v is string => v != null && v.trim() !== ""))].sort();
}

export function RouteFilter({ routes }: RouteFilterProps) {
	const [query, setQuery] = useState("");
	const [routeType, setRouteType] = useState("");
	const [walkType, setWalkType] = useState("");
	const [region, setRegion] = useState("");

	const routeTypes = useMemo(() => uniqueSorted(routes.map((r) => r.route_type)), [routes]);
	const walkTypes = useMemo(() => uniqueSorted(routes.map((r) => r.walk_type)), [routes]);
	const regions = useMemo(() => uniqueSorted(routes.map((r) => r.region)), [routes]);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		return routes.filter(
			(r) =>
				(!q || r.name.toLowerCase().includes(q) || r.pub_label?.toLowerCase().includes(q)) &&
				(!routeType || r.route_type === routeType) &&
				(!walkType || r.walk_type === walkType) &&
				(!region || r.region === region),
		);
	}, [routes, query, routeType, walkType, region]);

	const hasFilters = query || routeType || walkType || region;

	function clearAll() {
		setQuery("");
		setRouteType("");
		setWalkType("");
		setRegion("");
	}

	const showDropdowns = routeTypes.length > 0 || walkTypes.length > 0 || regions.length > 0;

	return (
		<>
			{/* Search + filter bar */}
			<div style={{
				backgroundColor: "#f7f3ed",
				border: "1px solid #e2d9ce",
				borderRadius: "0.75rem",
				padding: "1.25rem",
				marginBottom: "1.5rem",
				display: "flex",
				flexDirection: "column",
				gap: "1rem",
			}}>
				{/* Search input */}
				<div style={{ position: "relative" }}>
					<span style={{
						position: "absolute",
						left: "0.875rem",
						top: "50%",
						transform: "translateY(-50%)",
						fontSize: "1rem",
						pointerEvents: "none",
						color: "#9ca3af",
					}}>🔍</span>
					<input
						type="text"
						placeholder="Search by route name or pub…"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						style={{
							width: "100%",
							padding: "0.65rem 1rem 0.65rem 2.4rem",
							borderRadius: "0.5rem",
							border: "1.5px solid #d6c9b8",
							backgroundColor: "#fff",
							color: "#2c1a0a",
							fontSize: "0.95rem",
							outline: "none",
							boxSizing: "border-box",
							transition: "border-color 0.15s",
						}}
						onFocus={(e) => (e.currentTarget.style.borderColor = "#4e7a3a")}
						onBlur={(e) => (e.currentTarget.style.borderColor = "#d6c9b8")}
					/>
					{query && (
						<button
							onClick={() => setQuery("")}
							aria-label="Clear search"
							style={{
								position: "absolute",
								right: "0.75rem",
								top: "50%",
								transform: "translateY(-50%)",
								background: "none",
								border: "none",
								cursor: "pointer",
								color: "#9ca3af",
								fontSize: "1rem",
								lineHeight: 1,
								padding: 0,
							}}
						>✕</button>
					)}
				</div>

				{/* Dropdowns row */}
				{showDropdowns && (
					<div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end" }}>
						{routeTypes.length > 0 && (
							<label style={{ display: "flex", flexDirection: "column", gap: "0.3rem", flex: "1 1 130px" }}>
								<span style={{ fontSize: "0.7rem", fontWeight: 700, color: "#6b4c2a", textTransform: "uppercase", letterSpacing: "0.05em" }}>Route Type</span>
								<select
									value={routeType}
									onChange={(e) => setRouteType(e.target.value)}
									style={{
										padding: "0.5rem 0.75rem",
										borderRadius: "0.4rem",
										border: `1.5px solid ${routeType ? "#4e7a3a" : "#d6c9b8"}`,
										backgroundColor: routeType ? "#eef5eb" : "#fff",
										color: "#2c1a0a",
										fontSize: "0.875rem",
										fontWeight: 500,
										cursor: "pointer",
										width: "100%",
									}}
								>
									<option value="">All</option>
									{routeTypes.map((v) => <option key={v} value={v}>{v}</option>)}
								</select>
							</label>
						)}

						{walkTypes.length > 0 && (
							<label style={{ display: "flex", flexDirection: "column", gap: "0.3rem", flex: "1 1 130px" }}>
								<span style={{ fontSize: "0.7rem", fontWeight: 700, color: "#6b4c2a", textTransform: "uppercase", letterSpacing: "0.05em" }}>Walk Type</span>
								<select
									value={walkType}
									onChange={(e) => setWalkType(e.target.value)}
									style={{
										padding: "0.5rem 0.75rem",
										borderRadius: "0.4rem",
										border: `1.5px solid ${walkType ? "#4e7a3a" : "#d6c9b8"}`,
										backgroundColor: walkType ? "#eef5eb" : "#fff",
										color: "#2c1a0a",
										fontSize: "0.875rem",
										fontWeight: 500,
										cursor: "pointer",
										width: "100%",
									}}
								>
									<option value="">All</option>
									{walkTypes.map((v) => <option key={v} value={v}>{v}</option>)}
								</select>
							</label>
						)}

						{regions.length > 0 && (
							<label style={{ display: "flex", flexDirection: "column", gap: "0.3rem", flex: "1 1 130px" }}>
								<span style={{ fontSize: "0.7rem", fontWeight: 700, color: "#6b4c2a", textTransform: "uppercase", letterSpacing: "0.05em" }}>Region</span>
								<select
									value={region}
									onChange={(e) => setRegion(e.target.value)}
									style={{
										padding: "0.5rem 0.75rem",
										borderRadius: "0.4rem",
										border: `1.5px solid ${region ? "#4e7a3a" : "#d6c9b8"}`,
										backgroundColor: region ? "#eef5eb" : "#fff",
										color: "#2c1a0a",
										fontSize: "0.875rem",
										fontWeight: 500,
										cursor: "pointer",
										width: "100%",
									}}
								>
									<option value="">All</option>
									{regions.map((v) => <option key={v} value={v}>{v}</option>)}
								</select>
							</label>
						)}

						<div style={{ display: "flex", alignItems: "flex-end", gap: "0.75rem", marginLeft: "auto" }}>
							{hasFilters && (
								<button
									onClick={clearAll}
									style={{
										padding: "0.5rem 0.875rem",
										borderRadius: "0.4rem",
										border: "1.5px solid #c8b49a",
										backgroundColor: "transparent",
										color: "#6b4c2a",
										fontSize: "0.8rem",
										fontWeight: 600,
										cursor: "pointer",
										whiteSpace: "nowrap",
									}}
								>
									✕ Clear all
								</button>
							)}
							<span style={{ fontSize: "0.8rem", color: "#9ca3af", whiteSpace: "nowrap" }}>
								{filtered.length} {filtered.length === 1 ? "route" : "routes"}
							</span>
						</div>
					</div>
				)}

				{/* Route count when no dropdowns */}
				{!showDropdowns && (
					<div style={{ textAlign: "right", fontSize: "0.8rem", color: "#9ca3af" }}>
						{filtered.length} {filtered.length === 1 ? "route" : "routes"}
					</div>
				)}
			</div>

			{/* Route grid */}
			{filtered.length > 0 ? (
				<div className="routeGrid">
					{filtered.map((r) => (
						<RouteCard key={r.id} route={r} />
					))}
				</div>
			) : (
				<p style={{ color: "#94a3b8", textAlign: "center", padding: "2rem 0" }}>
					No routes match your search.
				</p>
			)}
		</>
	);
}

