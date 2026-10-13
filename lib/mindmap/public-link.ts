export const PUBLIC_LINK_EXPIRATION_OPTIONS = [
	{ value: "1d", label: "1 day", days: 1 },
	{ value: "7d", label: "7 days", days: 7 },
	{ value: "30d", label: "30 days", days: 30 },
	{ value: "never", label: "Never", days: null },
	{ value: "custom", label: "Custom", days: null },
] as const;

export type PublicLinkExpiration = (typeof PUBLIC_LINK_EXPIRATION_OPTIONS)[number]["value"] | string;

export function parsePublicLinkExpiration(value: unknown): PublicLinkExpiration | null {
	if (typeof value !== "string") return null;
	if (PUBLIC_LINK_EXPIRATION_OPTIONS.some((option) => option.value === value)) {
		return value as PublicLinkExpiration;
	}
	if (!isNaN(Date.parse(value))) {
		return value;
	}
	return null;
}

export function publicLinkExpiresAt(expiration: PublicLinkExpiration, now = new Date()): Date | null {
	const option = PUBLIC_LINK_EXPIRATION_OPTIONS.find((item) => item.value === expiration);
	if (option) {
		if (option.days === null) return null;
		return new Date(now.getTime() + option.days * 24 * 60 * 60 * 1000);
	}
	const date = new Date(expiration);
	return isNaN(date.getTime()) ? null : date;
}
