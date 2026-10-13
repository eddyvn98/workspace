/**
 * framer-motion's AnimatePresence speculatively reads `children.props.ref` to support
 * React 19's ref-as-prop model. Under React 18.3+, merely reading `props.ref` triggers
 * a dev-only forward-compat warning even though framer-motion's fallback (`children.ref`)
 * resolves correctly — refs work fine, this is just noise.
 * Upstream: https://github.com/motiondivision/motion/blob/main/packages/framer-motion/src/components/AnimatePresence/PopChild.tsx
 */
const REF_NOT_A_PROP_MARKER = "is not a prop. Trying to access it will result in";

function isKnownBenignWarning(args: unknown[]): boolean {
	return args.some(
		(arg) => typeof arg === "string" && arg.includes(REF_NOT_A_PROP_MARKER),
	);
}

if (process.env.NODE_ENV !== "production") {
	const globalWithFlag = globalThis as { __refWarningPatched?: boolean };
	if (!globalWithFlag.__refWarningPatched) {
		globalWithFlag.__refWarningPatched = true;
		const originalConsoleError = console.error;
		console.error = (...args: unknown[]) => {
			if (isKnownBenignWarning(args)) return;
			originalConsoleError(...args);
		};
	}
}
