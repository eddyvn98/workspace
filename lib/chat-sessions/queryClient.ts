import { QueryClient } from "@tanstack/react-query";
import type { ChatSessionListItem } from "@/types/chat-sessions.types";

// Singleton shared between the React tree (mounted via QueryClientProvider
// in history-sidebar.tsx) and plain-JS callers outside React —
// lib/llm/adapters/difyAdapter.ts patches this same cache directly after a
// chat_sessions upsert succeeds, so a new message never forces the sidebar
// list to refetch over the network.
export const chatSessionsQueryClient = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			staleTime: 30_000,
		},
	},
});

const QUERY_ROOT = "chat-sessions" as const;

export function chatSessionsQueryKey(categories?: string[], pinned?: boolean) {
	return [
		QUERY_ROOT,
		categories && categories.length ? [...categories].sort().join(",") : "all",
		pinned === undefined ? "any" : pinned,
	] as const;
}

interface InfinitePage {
	items: ChatSessionListItem[];
	nextCursor: string | null;
}
interface InfiniteData {
	pages: InfinitePage[];
	pageParams: unknown[];
}

// Every mutation below collapses all currently-loaded pages of a query into
// one synthetic page before reordering — page boundaries only matter for
// requesting the next cursor, and reconstituting per-page counts after a
// client-side reorder isn't worth the complexity. The last real page's
// nextCursor is preserved so "load more" keeps working afterward.
function collapseAndMutate(
	data: InfiniteData,
	mutate: (items: ChatSessionListItem[]) => ChatSessionListItem[],
): InfiniteData {
	const flat = data.pages.flatMap((p) => p.items);
	const nextItems = mutate(flat);
	const lastPage = data.pages[data.pages.length - 1];
	return {
		pageParams: [data.pageParams[0]],
		pages: [{ items: nextItems, nextCursor: lastPage?.nextCursor ?? null }],
	};
}

function reinsertByPin(
	items: ChatSessionListItem[],
	updated: ChatSessionListItem,
): ChatSessionListItem[] {
	const rest = items.filter((i) => i.id !== updated.id);
	const pinnedItems = rest.filter((i) => i.pinned);
	const recentItems = rest.filter((i) => !i.pinned);
	return updated.pinned
		? [updated, ...pinnedItems, ...recentItems]
		: [...pinnedItems, updated, ...recentItems];
}

function queryMatchesItem(queryKey: readonly unknown[], item: ChatSessionListItem): boolean {
	const [root, categoriesKey, pinnedKey] = queryKey;
	if (root !== QUERY_ROOT) return false;
	if (categoriesKey !== "all") {
		const categories = String(categoriesKey).split(",");
		if (!categories.includes(item.category)) return false;
	}
	if (pinnedKey !== "any" && Boolean(pinnedKey) !== item.pinned) return false;
	return true;
}

// Inserts/moves `item` to the top of its bucket (pinned vs recents) in every
// mounted chat-sessions list query it belongs to. Used both for the
// optimistic pin toggle and for folding a just-upserted session (from a new
// message) into the list without a network refetch.
export function upsertChatSessionInCache(item: ChatSessionListItem): void {
	const queries = chatSessionsQueryClient.getQueryCache().findAll({ queryKey: [QUERY_ROOT] });
	for (const query of queries) {
		if (!queryMatchesItem(query.queryKey, item)) continue;
		chatSessionsQueryClient.setQueryData<InfiniteData>(query.queryKey, (old) =>
			old ? collapseAndMutate(old, (items) => reinsertByPin(items, item)) : old,
		);
	}
}

export function removeChatSessionFromCache(id: string): void {
	const queries = chatSessionsQueryClient.getQueryCache().findAll({ queryKey: [QUERY_ROOT] });
	for (const query of queries) {
		chatSessionsQueryClient.setQueryData<InfiniteData>(query.queryKey, (old) =>
			old ? collapseAndMutate(old, (items) => items.filter((i) => i.id !== id)) : old,
		);
	}
}
