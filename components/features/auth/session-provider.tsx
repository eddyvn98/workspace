"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";
import { signIn, useSession } from "next-auth/react";
import { useEffect, useRef } from "react";

function LocalSession() {
	const { status } = useSession();
	const attempted = useRef(false);
	useEffect(() => {
		if (process.env.NODE_ENV === "production" || status !== "unauthenticated" || attempted.current) return;
		attempted.current = true;
		void signIn("dev-credentials", { redirect: false });
	}, [status]);
	return null;
}

export default function AuthSessionProvider({ children }: { children: ReactNode }) {
	return <SessionProvider><LocalSession />{children}</SessionProvider>;
}
