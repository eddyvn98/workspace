import type { Metadata, Viewport } from "next";
import type React from "react";
import { Open_Sans, JetBrains_Mono } from "next/font/google";

import "./globals.css";
import "./styles/workspace-base.css";
import "./styles/workspace-content.css";
import "./styles/workspace-tools.css";
import "./styles/workspace-canvas.css";
import "@fortune-sheet/react/dist/index.css";
import "@/lib/suppress-known-dev-warnings";
import AuthSessionProvider from "@/components/features/auth/session-provider";
import { ThemeProvider } from "@/components/features/auth/theme-provider";
import { Toaster } from "sonner";

export const viewport: Viewport = {
	width: "device-width",
	initialScale: 1,
	maximumScale: 5,
	userScalable: true,
	interactiveWidget: "resizes-content",
	viewportFit: "cover",
};

const openSans = Open_Sans({
	subsets: ["latin"],
	variable: "--font-sans",
	display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
	subsets: ["latin"],
	variable: "--font-mono",
	display: "swap",
});

export const metadata: Metadata = {
	title: "Workspace",
	description: "A collaborative visual workspace",
	icons: { icon: "/workspace-mark.svg" },
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html
			lang="en"
			suppressHydrationWarning
			className={`${openSans.variable} ${jetbrainsMono.variable}`}
		>
			<body className="font-sans antialiased" suppressHydrationWarning>
				<ThemeProvider
					attribute="class"
					defaultTheme="system"
					enableSystem
				>
					<AuthSessionProvider>{children}</AuthSessionProvider>
					<Toaster richColors position="bottom-right" />
				</ThemeProvider>
			</body>
		</html>
	);
}
