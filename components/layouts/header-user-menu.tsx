"use client";

import { signOut, useSession } from "next-auth/react";
import { LogOut } from "lucide-react";

export function HeaderUserMenu() {
	const { data } = useSession();
	const email = data?.user?.email ?? "";
	const initial = email.charAt(0).toUpperCase() || "U";

	return (
		<div className="flex items-center gap-2">
			<span title={email} className="grid h-8 w-8 place-items-center rounded-full bg-violet-100 text-sm font-semibold text-violet-700 dark:bg-violet-900 dark:text-violet-200">{initial}</span>
			<button type="button" onClick={() => signOut({ callbackUrl: "/login" })} aria-label="Sign out" title="Sign out" className="rounded-md p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
				<LogOut className="h-4 w-4" />
			</button>
		</div>
	);
}
