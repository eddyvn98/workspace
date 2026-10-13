import type { WorkspaceJson } from "./contracts";

const FLOW_QUANTITIES: Record<string, number> = {
	"2": 2, two: 2, hai: 2,
	"3": 3, three: 3, ba: 3,
	"4": 4, four: 4, bon: 4,
};

export function requestedImageFlowCount(query: string): number {
	const normalized = query.toLocaleLowerCase();
		const explicit = normalized.match(/\b(2|two|hai|3|three|ba|4|four|bon)\s+(?:(?:new|image)\s+)*(?:image\s+)?(?:flows?|luồng)(?:\s+ảnh)?\b/i); // vi-allow: match Vietnamese flow-count requests
	if (explicit) return FLOW_QUANTITIES[explicit[1]] ?? 1;
		if (/\b(?:multiple|several|both)\s+(?:image\s+)?flows?\b|\b(?:nhiều|vài)\s+(?:luồng|flows?)(?:\s+ảnh)?\b/i.test(normalized)) return 2; // vi-allow: match Vietnamese flow-count requests
		if (/\bsecond\s+(?:image\s+)?flow\b|\bflow\s+thứ\s+hai\b/i.test(normalized)) return 2; // vi-allow: match Vietnamese flow-count requests
	return 1;
}

export function limitImageFlowCreations(
	actions: WorkspaceJson[],
	remainingCreations: number,
): { actions: WorkspaceJson[]; suppressed: number } {
	let allowed = Math.max(0, remainingCreations);
	let suppressed = 0;
	const filtered = actions.filter((action) => {
		if (action.type !== "create_image_flow") return true;
		if (allowed > 0) {
			allowed -= 1;
			return true;
		}
		suppressed += 1;
		return false;
	});
	return { actions: filtered, suppressed };
}
