import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

export const authOptions: NextAuthOptions = {
	providers: [
		CredentialsProvider({
			id: "dev-credentials",
			name: "Local Workspace User",
			credentials: {},
			async authorize() {
				if (process.env.NODE_ENV === "production") return null;
				const email = (
					process.env.WORKSPACE_DEV_USER_EMAIL ??
					"user@example.com"
				).trim().toLowerCase();
				return { id: email, email, name: "Local Workspace User" };
			},
		}),
	],
	secret: process.env.NEXTAUTH_SECRET,
	session: { strategy: "jwt" },
	callbacks: {
		async jwt({ token, profile }) {
			const claims = profile as Record<string, unknown> | undefined;
			const email = token.email ?? claims?.preferred_username ?? claims?.upn;
			if (typeof email === "string") token.email = email.trim().toLowerCase();
			return token;
		},
		async session({ session, token }) {
			if (session.user && typeof token.email === "string") {
				session.user.email = token.email;
			}
			return session;
		},
	},
};
