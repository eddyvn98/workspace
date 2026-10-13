"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

export default function LoginPage() {
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");

	async function signInLocally() {
		setLoading(true);
		setError("");
		try {
			const result = await signIn("dev-credentials", { callbackUrl: "/workspace" });
			if (result?.error) setError("Sign in could not be completed. Please try again.");
		} catch {
			setError("Sign in could not be completed. Please try again.");
		} finally {
			setLoading(false);
		}
	}

	return (
		<main className="grid min-h-dvh place-items-center bg-slate-50 p-6 dark:bg-slate-950">
			<section className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
				<div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-violet-100 text-lg font-semibold text-violet-700 dark:bg-violet-950 dark:text-violet-300">W</div>
				<h1 className="text-xl font-semibold text-slate-900 dark:text-white">Sign in to Workspace</h1>
				<p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Use the local development identity configured for this app.</p>
				<button type="button" onClick={signInLocally} disabled={loading} className="mt-6 w-full rounded-lg bg-violet-600 px-4 py-3 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60">
					{loading ? "Connecting…" : "Continue locally"}
				</button>
				{error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}
			</section>
		</main>
	);
}
