"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function AuthCallbackPage() {
	const router = useRouter();

	useEffect(() => {
		const supabase = supabaseBrowser();

		// Exchange the code in the URL for a session
		supabase.auth.getSession().then(() => {
			router.replace("/");
		});
	}, [router]);

	return <main style={{ padding: 16 }}>Signing you in…</main>;
}
