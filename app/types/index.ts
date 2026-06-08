export type NavItem = {
	path: string;
	label: string;
	icon: any;
};

export type Route = {
	id: string;
	route_code: string;
	name: string;
	story: string | null;
	distance_km: number | null;
	duration_hours: number | null;
	difficulty: 1 | 2 | 3 | 4 | 5 | null;
	is_published: boolean;
	isCompleted?: boolean;
};
