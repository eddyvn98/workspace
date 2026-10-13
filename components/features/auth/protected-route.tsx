"use client";

import type React from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

interface ProtectedRouteProps {
	children: React.ReactNode;
	/** Stable server-rendered dev bypass, passed through the route boundary. */
	devBypass?: boolean;
}

export default function ProtectedRoute({ children, devBypass = false }: ProtectedRouteProps) {
	const { status } = useSession();
	const router = useRouter();


	// Once we've rendered the app with an authenticated session, a later
	// "loading" status only means an in-place session refresh (e.g. a
	// useSession().update() call after a mutation), not a real navigation.
	// Unmounting children in that case would reset any in-app tab/route
	// state the user had open, so the full-screen loader is reserved for
	// the genuine initial load.
	const hasAuthenticatedRef = useRef(false);
	if (status === "authenticated") {
		hasAuthenticatedRef.current = true;
	}

	useEffect(() => {
		if (devBypass) return;
		if (status === "unauthenticated") {
			const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
			router.push(`/login?callbackUrl=${encodeURIComponent(returnTo)}`);
		}
	}, [status, router, devBypass]);

	if (devBypass) {
		return <>{children}</>;
	}

	if (status === "loading" && !hasAuthenticatedRef.current) {
		return (
			<div
				className="flex min-h-screen w-full items-center justify-center bg-gray-50 px-4 dark:bg-slate-900"
				role="status"
				aria-live="polite"
				aria-label="Loading your workspace"
			>
				<div className="flex w-full max-w-[300px] flex-col items-center gap-5 rounded-2xl border border-gray-200 bg-white px-8 py-10 shadow-panel dark:border-slate-700 dark:bg-slate-800">
					<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-sm font-bold text-violet-700 dark:bg-violet-950 dark:text-violet-300" aria-hidden="true">W</div>

					<div className="flex items-center gap-[6px]" aria-hidden="true">
						<span className="typing-dot inline-block h-[6px] w-[6px] rounded-full bg-gray-400 dark:bg-gray-500" />
						<span className="typing-dot inline-block h-[6px] w-[6px] rounded-full bg-gray-400 dark:bg-gray-500" />
						<span className="typing-dot inline-block h-[6px] w-[6px] rounded-full bg-gray-400 dark:bg-gray-500" />
					</div>

					<span className="text-sm font-medium text-muted-foreground">
						Loading your workspace...
					</span>
				</div>
			</div>
		);
	}

	if (status === "unauthenticated") {
		return null; // Will redirect to login
	}

	return <>{children}</>;
}
