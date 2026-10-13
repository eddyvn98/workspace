"use client";

import * as React from "react";
import {
	ThemeProvider as NextThemesProvider,
	type ThemeProviderProps,
} from "next-themes";
import "@/lib/suppress-known-dev-warnings";

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
	return (
		<NextThemesProvider
			attribute="class"
			defaultTheme="system"
			enableSystem={true}
			{...props}
		>
			{children}
		</NextThemesProvider>
	);
}
