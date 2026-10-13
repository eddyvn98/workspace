import { createHash, timingSafeEqual } from "crypto";
import { SignJWT, jwtVerify, errors as joseErrors } from "jose";

export const WORKSPACE_AGENT_TOKEN_TTL_SECONDS = 300;

/** The scope this module mints and the only one it accepts. */
export const WORKSPACE_AGENT_TOKEN_SCOPE = "workspace_agent";

/** Preferred transport for the user token: a per-invocation request header. */
export const WORKSPACE_AGENT_USER_TOKEN_HEADER = "X-Workspace-User-Token";

/** Fallback transport for Dify tools that cannot bind custom headers. */
export const WORKSPACE_AGENT_USER_TOKEN_FIELD = "workspace_user_token";

export type WorkspaceAgentAuthFailureCode =
	| "SERVER_NOT_CONFIGURED"
	| "SERVICE_AUTH_MISSING"
	| "SERVICE_AUTH_MALFORMED"
	| "SERVICE_AUTH_INVALID"
	| "USER_TOKEN_MISSING"
	| "USER_TOKEN_INVALID"
	| "USER_TOKEN_EXPIRED"
	| "USER_TOKEN_SCOPE_INVALID"
	| "USER_TOKEN_SUBJECT_INVALID";

export type WorkspaceAgentAuthFailure = {
	ok: false;
	/** 401 identity failure, 500 misconfiguration. Board-level permission
	 *  (authenticated but not allowed on *this* board) is never decided here —
	 *  see resolveAccessRole, which the calling route applies afterwards and
	 *  which reports "no access" as 404, not 403. */
	status: 401 | 500;
	code: WorkspaceAgentAuthFailureCode;
	message: string;
};

export type WorkspaceAgentAuthResult =
	| { ok: true; email: string }
	| WorkspaceAgentAuthFailure;

function fail(
	status: 401 | 500,
	code: WorkspaceAgentAuthFailureCode,
	message: string,
): WorkspaceAgentAuthFailure {
	return { ok: false, status, code, message };
}

/** Read on each call; only presence is exposed. */
function getSecret(name: string): string | null {
	// The local override is intentionally available only to a development
	// process. A production deployment must authenticate Dify with the one
	// credential configured on the Workspace gateway; otherwise an accidentally
	// inherited *_LOCAL value can make every Custom Tool call fail with 401.
	const allowLocalOverride = process.env.NODE_ENV !== "production";
	const value =
		allowLocalOverride && name === "WORKSPACE_AGENT_SERVICE_KEY"
			? (process.env.WORKSPACE_AGENT_SERVICE_KEY_LOCAL ?? process.env[name])
			: process.env[name];
	if (!value || value.trim().length === 0) return null;
	return value;
}

/** Local bypass is available only in development; user and board checks remain. */
function isLocalServiceAuthBypassEnabled(): boolean {
	return (
		process.env.NODE_ENV === "development" &&
		process.env.WORKSPACE_AGENT_ALLOW_INSECURE_LOCAL_AUTH === "true"
	);
}

export function getWorkspaceAgentTokenSigningSecret(): Uint8Array {
	const secret = getSecret("WORKSPACE_AGENT_TOKEN_SECRET");
	if (!secret) {
		throw new Error(
			"WORKSPACE_AGENT_TOKEN_SECRET is not configured. Set it in .env before using the Workspace Agent gateway.",
		);
	}
	return new TextEncoder().encode(secret);
}

/** Whether the gateway can operate at all. Presence only — never the values. */
export function isWorkspaceAgentGatewayConfigured(): boolean {
	return (
		getSecret("WORKSPACE_AGENT_TOKEN_SECRET") !== null &&
		(getSecret("WORKSPACE_AGENT_SERVICE_KEY") !== null ||
			isLocalServiceAuthBypassEnabled())
	);
}

export type MintedWorkspaceAgentToken = {
	token: string;
	/** Seconds, so a caller can schedule a refresh without parsing the JWT. */
	expiresIn: number;
	expiresAt: string;
};

/** Mints a short-lived identity token. The caller must authenticate the email. */
export async function signWorkspaceAgentUserToken(
	email: string,
): Promise<MintedWorkspaceAgentToken> {
	const normalized = String(email ?? "")
		.trim()
		.toLowerCase();
	if (!normalized || !normalized.includes("@")) {
		throw new Error(
			"signWorkspaceAgentUserToken requires an authenticated email",
		);
	}
	const expiresAt = new Date(
		Date.now() + WORKSPACE_AGENT_TOKEN_TTL_SECONDS * 1000,
	);
	const token = await new SignJWT({
		email: normalized,
		scope: WORKSPACE_AGENT_TOKEN_SCOPE,
	})
		.setProtectedHeader({ alg: "HS256" })
		.setIssuedAt()
		.setExpirationTime(`${WORKSPACE_AGENT_TOKEN_TTL_SECONDS}s`)
		.sign(getWorkspaceAgentTokenSigningSecret());

	return {
		token,
		expiresIn: WORKSPACE_AGENT_TOKEN_TTL_SECONDS,
		expiresAt: expiresAt.toISOString(),
	};
}

export type VerifiedWorkspaceAgentUserToken = { ok: true; email: string };

/** Verifies signature, expiry and scope, returning only the email. */
export async function verifyWorkspaceAgentUserToken(
	token: string | null | undefined,
): Promise<VerifiedWorkspaceAgentUserToken | WorkspaceAgentAuthFailure> {
	const raw = String(token ?? "").trim();
	if (!raw) {
		return fail(401, "USER_TOKEN_MISSING", "Missing Workspace Agent user token");
	}

	let secret: Uint8Array;
	try {
		secret = getWorkspaceAgentTokenSigningSecret();
	} catch {
		return fail(500, "SERVER_NOT_CONFIGURED", "Workspace Agent gateway is not configured");
	}

	let payload: Record<string, unknown>;
	try {
		const verified = await jwtVerify(raw, secret, { algorithms: ["HS256"] });
		payload = verified.payload as Record<string, unknown>;
	} catch (error) {
		if (error instanceof joseErrors.JWTExpired) {
			return fail(401, "USER_TOKEN_EXPIRED", "Workspace Agent user token expired");
		}
		return fail(401, "USER_TOKEN_INVALID", "Invalid Workspace Agent user token");
	}

	if (payload.scope !== WORKSPACE_AGENT_TOKEN_SCOPE) {
		return fail(
			401,
			"USER_TOKEN_SCOPE_INVALID",
			"Workspace Agent user token has the wrong scope",
		);
	}

	const email = String(payload.email ?? "")
		.trim()
		.toLowerCase();
	if (!email || !email.includes("@")) {
		return fail(
			401,
			"USER_TOKEN_SUBJECT_INVALID",
			"Workspace Agent user token carries no usable subject",
		);
	}

	return { ok: true, email };
}

/** Verifies the Dify service key with a constant-time digest comparison. */
export function verifyWorkspaceAgentServiceKey(
	headers: Headers,
): true | WorkspaceAgentAuthFailure {
	if (isLocalServiceAuthBypassEnabled()) return true;

	const expected = getSecret("WORKSPACE_AGENT_SERVICE_KEY");
	if (!expected) {
		return fail(500, "SERVER_NOT_CONFIGURED", "Workspace Agent gateway is not configured");
	}

	const header = headers.get("authorization") ?? "";
	if (!header) {
		return fail(401, "SERVICE_AUTH_MISSING", "Missing service authentication");
	}
	if (!/^Bearer\s+\S/i.test(header)) {
		return fail(
			401,
			"SERVICE_AUTH_MALFORMED",
			"Service authentication must be a Bearer credential",
		);
	}

	const presented = header.replace(/^Bearer\s+/i, "").trim();
	const a = createHash("sha256").update(presented).digest();
	const b = createHash("sha256").update(expected).digest();
	if (!timingSafeEqual(a, b)) {
		return fail(401, "SERVICE_AUTH_INVALID", "Invalid service credential");
	}
	return true;
}

/** Reads the user token from the header, parsed body, or query string. */
export function readWorkspaceAgentUserTokenFromRequest(
	request: Request,
	body?: unknown,
): string | null {
	const header = request.headers.get(WORKSPACE_AGENT_USER_TOKEN_HEADER);
	if (header && header.trim()) return header.trim();

	if (body && typeof body === "object" && !Array.isArray(body)) {
		const field = (body as Record<string, unknown>)[
			WORKSPACE_AGENT_USER_TOKEN_FIELD
		];
		if (typeof field === "string" && field.trim()) return field.trim();
	}

	try {
		const query = new URL(request.url).searchParams.get(
			WORKSPACE_AGENT_USER_TOKEN_FIELD,
		);
		if (query && query.trim()) return query.trim();
	} catch {
		// A malformed URL cannot carry a token; fall through to "missing".
	}

	return null;
}

/** Distinguishes agent requests from browser-cookie requests. */
export function hasWorkspaceAgentUserToken(
	request: Request,
	body?: unknown,
): boolean {
	return readWorkspaceAgentUserTokenFromRequest(request, body) !== null;
}

/** Verifies both Dify and user identity; board access is checked by the route. */
export async function authenticateWorkspaceAgentRequest(
	request: Request,
	body?: unknown,
): Promise<WorkspaceAgentAuthResult> {
	const service = verifyWorkspaceAgentServiceKey(request.headers);
	if (service !== true) return service;

	const verified = await verifyWorkspaceAgentUserToken(
		readWorkspaceAgentUserTokenFromRequest(request, body),
	);
	if (verified.ok !== true) return verified;

	return { ok: true, email: verified.email };
}
