import { IMessage, Conversation } from "@/interface/IMessage";
import { AIModel, DEFAULT_AI_MODEL } from "@/lib/ai-models";
import { rememberSelectedAIModelName } from "@/lib/selected-ai-model";
import { create } from "zustand";
import { useFileStore } from "./useFileStore";
import { useImageStore } from "./useImageStore";
import { useImageSettingsStore, MultiViewEntry } from "./useImageSettingsStore";
import { createClientFromCategory } from "@/lib/llm/factory";
import { splitMessageFilesByOwner } from "@/services/message.utils";

// Abort controllers for in-flight history requests — cancelled when a newer
// request for the same resource starts, preventing stale responses from
// overwriting more-recent state.
let _fetchConvsAbort: AbortController | null = null;
let _loadMsgsAbort: AbortController | null = null;

// Shared by loadMessagesByConversationId and loadChatSessionMessages — both
// consume the same Dify /messages response shape ({ data: [{query, answer,
// message_files, inputs, created_at, ...}] }).
function formatDifyMessagesResponse(json: any, category: string): IMessage[] {
	let isFirstMessage = true;

	return (Array.isArray(json?.data) ? json.data : []).flatMap((item: any) => {
		const timestamp = new Date(item.created_at * 1000).toLocaleString();

		if (!item.query && !item.answer) return [];

		const result: IMessage[] = [];

		const shouldShowUserMessage = category !== "DESIGN_AGENT" || !isFirstMessage;

		const { userImages, userFiles, aiImages, aiFiles } = splitMessageFilesByOwner(
			item.message_files || [],
		);

		if (item.query && shouldShowUserMessage) {
			result.push({
				id: item.id + "_user",
				role: "user",
				content: item.query,
				timestamp,
				...(userFiles.length ? { files: userFiles } : {}),
				...(userImages.length ? { images: userImages } : {}),
			});
		}

		if (item.answer) {
			const thinkRegex = /^<think>([\s\S]*?)(?:<\/think>([\s\S]*))?$/;
			const match = item.answer.match(thinkRegex);

			let thought = "";
			let finalContent = item.answer;

			if (match) {
				thought = match[1] || "";
				finalContent = match[2] || "";
			} else {
				finalContent = item.answer.replace(/^<think>/, "");
			}

			result.push({
				id: item.id + "_ai",
				role: "assistant",
				content: finalContent.trim(),
				thought: thought.trim(),
				isThinkingFinished: true,
				timestamp,
				...(aiFiles.length ? { files: aiFiles } : {}),
				...(aiImages.length ? { images: aiImages } : {}),
				...(item.inputs ? { generationParams: item.inputs } : {}),
			});
		} else {
			result.push({
				id: item.id + "_ai",
				role: "assistant",
				content: "Oops! Something went wrong on our side. Please retry.",
				timestamp,
			});
		}

		if (isFirstMessage && (item.query || item.answer)) {
			isFirstMessage = false;
		}

		return result;
	});
}

interface MessageStore {
	messages: IMessage[];
	conversations: Conversation[];
	currentConversationId: string | null;
	selectedCategory: string;
	setSelectedCategory: (category: string) => void;
	selectedModel: AIModel;
	setSelectedModel: (model: AIModel) => void;

	// ===== UI shared states =====
	selectedCountry: string;
	isLoading: boolean;
	titleNewChat: string;
	conversationsLoading: boolean;
	// Latches true once a chat session has messages, and stays true through a
	// "New chat" reset (which only clears `messages`) so nav chrome that keys
	// off "is there an active session" doesn't flicker back to the bare home
	// state. Only cleared explicitly (e.g. navigating away via the home logo).
	chatStarted: boolean;

	/** Text queued for the main chat composer by a flow that lives outside the
	 *  chat tree (e.g. "Create with AI" in the Skills/Prompts library, which is
	 *  mounted next to ToolLayout and has no access to the composer ref).
	 *  ChatInterface consumes it once — prefilling and focusing the composer —
	 *  then clears it. It is never sent automatically: the user reviews, edits,
	 *  and sends manually. */
	composerDraft: string | null;

	/** True while Pair Canvas is running a job loop in the background — lets the composer hide/lock its own image upload zones instead of flickering through each job's staged images. */
	isRunningPairBatch: boolean;
	pairBatchProgress: { done: number; total: number } | null;
	setPairBatchProgress: (progress: { done: number; total: number } | null) => void;

	setSelectedCountry: (country: string) => void;
	setIsLoading: (loading: boolean) => void;
	setTitleNewChat: (title: string) => void;
	setChatStarted: (started: boolean) => void;
	/** Queues `text` for the composer. Overwrites any draft not yet consumed —
	 *  the newest request is the one the user just asked for. */
	requestComposerDraft: (text: string) => void;
	/** Clears the queued draft once the composer has taken it, so remounting the
	 *  chat can never re-prefill a draft the user already dismissed. */
	consumeComposerDraft: () => void;

	sendMessage: (
		prompt: string,
		user: string,
		inputs: Record<string, any>,
		options?: {
			skipUserMessage?: boolean;
			startFromMessages?: IMessage[];
			systemPrefix?: string;
			/** Overrides the text shown in the user bubble while `prompt` is still sent as the query. */
			displayPrompt?: string;
			/** Stamped onto the assistant message so the UI can label which view it belongs to. */
			viewLabel?: string;
			/** Groups messages generated together in one multi-view batch send. */
			batchId?: string;
			/** Skip clearing uploaded files/images/reference image after this call (more calls follow in the same batch). */
			keepUploadsOnSuccess?: boolean;
		},
	) => Promise<{ assistantMessageId: string; success: boolean }>;
	/** Sends one prompt per view sequentially, keeping the same reference image + conversation, and groups the resulting images into one batch. */
	sendMultiViewBatch: (
		views: MultiViewEntry[],
		user: string,
		inputs: Record<string, any>,
	) => Promise<void>;
	clearMessages: () => void;

	fetchConversations: (
		user: string,
		selectedCountry?: string,
	) => Promise<void>;
	loadMessagesByConversationId: (
		conversationId: string,
		user: string,
		selectedCountry?: string,
	) => Promise<void>;
	/** Loads a conversation selected from the unified chat_sessions history sidebar — unlike loadMessagesByConversationId, the category/region come from the session doc itself rather than the currently-active category, so it also switches selectedCategory/selectedCountry to match. */
	loadChatSessionMessages: (
		chatSessionId: string,
		category: string,
		region: "SG" | null,
		difyConversationId: string,
		user: string,
	) => Promise<void>;
	deleteConversation: (
		conversationId: string,
		user: string,
		selectedCountry: string,
	) => Promise<void>;
}

export const useMessageStore = create<MessageStore>((set, get) => ({
	messages: [],
	conversations: [],
	currentConversationId: null,
	selectedCategory: "CHAT_KEY",
	setSelectedCategory: (category) => set({ selectedCategory: category }),
	selectedModel: DEFAULT_AI_MODEL,
	setSelectedModel: (model) => {
		rememberSelectedAIModelName(model.name);
		set({ selectedModel: model });
	},

	selectedCountry: "Singapore",
	isLoading: false,
	titleNewChat: "New chat",
	conversationsLoading: false,
	chatStarted: false,
	composerDraft: null,

	isRunningPairBatch: false,
	pairBatchProgress: null,
	setPairBatchProgress: (progress) =>
		set({
			pairBatchProgress: progress,
			isRunningPairBatch: progress !== null && progress.done < progress.total,
		}),

	setSelectedCountry: (country) => set({ selectedCountry: country }),

	setIsLoading: (loading) => set({ isLoading: loading }),

	setTitleNewChat: (title) => set({ titleNewChat: title }),

	setChatStarted: (started) => set({ chatStarted: started }),

	requestComposerDraft: (text) => set({ composerDraft: text }),

	consumeComposerDraft: () => set({ composerDraft: null }),

	clearMessages: () => set({ messages: [], currentConversationId: null }),
	// Fetch message with streaming support
	sendMessage: async (
		prompt: string,
		user: string,
		inputs: Record<string, any>,
		options?: {
			skipUserMessage?: boolean;
			startFromMessages?: IMessage[];
			systemPrefix?: string;
			displayPrompt?: string;
			viewLabel?: string;
			batchId?: string;
			keepUploadsOnSuccess?: boolean;
		},
	) => {
		const { selectedCategory } = get();
		const currentMessages = options?.startFromMessages ?? get().messages;
		const timestamp = new Date().toLocaleString();
		const files = useFileStore.getState().files;
		const images = useImageStore.getState().images;
		const imageGenParams =
			selectedCategory === "IMAGE_KEY"
				? useImageSettingsStore.getState().getPayload()
				: undefined;

		// Build the Dify-bound query: inject systemPrefix transparently without
		// showing it in the user bubble. The original prompt is kept for the UI.
		const difyQuery = options?.systemPrefix
			? `${options.systemPrefix}\n\n${prompt}`
			: prompt;

		let client;
		if ("country" in inputs) {
			client = createClientFromCategory(
				selectedCategory,
				difyQuery,
				inputs,
				user,
				inputs.country,
			);
		} else {
			client = createClientFromCategory(
				selectedCategory,
				difyQuery,
				inputs,
				user,
			);
		}

		// Chỉ tạo userMessage nếu không phải DESIGN_AGENT hoặc không phải message đầu tiên
		const shouldShowUserMessage =
			!options?.skipUserMessage &&
			(selectedCategory !== "DESIGN_AGENT" || currentMessages.length > 0);

		const userMessage: IMessage = {
			id: Date.now() + "_user",
			role: "user",
			content: options?.displayPrompt ?? prompt, // UI bubble text; the query sent to the backend is always `prompt`
			timestamp,
			...(files && files.length > 0
				? {
						files: files.map((file) => ({
							name: file.name,
							url: file.source_url,
						})),
					}
				: {}),
			...((() => {
				// Only main images go here; the reference image is already carried
				// separately via assistantMessage.generationParams.reference_image_url,
				// so it must not be merged in — downstream consumers (message-list,
				// chat-image-thumbnail-strip) read it from generationParams instead.
				const mainUrls = (images ?? []).map((file) => file.url).filter(Boolean);
				return mainUrls.length > 0 ? { images: mainUrls } : {};
			})()),
		};

		const assistantMessage: IMessage = {
			id: Date.now() + "_ai",
			role: "assistant",
			content: "",
			timestamp,
			isLoading: true,
			...(imageGenParams ? { generationParams: imageGenParams } : {}),
			...(options?.viewLabel ? { viewLabel: options.viewLabel } : {}),
			...(options?.batchId ? { batchId: options.batchId } : {}),
		};

		// Chỉ thêm userMessage vào messages nếu cần hiển thị
		const messagesToAdd = shouldShowUserMessage
			? [userMessage, assistantMessage]
			: [assistantMessage];

		set({
			messages: [...currentMessages, ...messagesToAdd],
			chatStarted: true,
		});

		try {
			await client.sendMessage({
				messages: [...currentMessages, assistantMessage],
			});
			if (!options?.keepUploadsOnSuccess) {
				useFileStore.getState().clearFiles();
				useImageStore.getState().clearImages();
				useImageSettingsStore.getState().clearReferenceImage();
				useImageSettingsStore.getState().clearReferenceImages();
			}
			return { assistantMessageId: assistantMessage.id, success: true };
		} catch (err) {
			useFileStore.getState().clearFiles();
			useImageStore.getState().clearImages();
			useImageSettingsStore.getState().clearReferenceImage();
			useImageSettingsStore.getState().clearReferenceImages();
			set((state) => {
				const updated = [...state.messages];
				const lastIndex = updated.length - 1;
				if (updated[lastIndex]?.role === "assistant") {
					updated[lastIndex] = {
						...updated[lastIndex],
						content:
							"Oops! Something went wrong on our side. Please retry.",
						isLoading: false,
						error: true,
					};
				}
				return { messages: updated };
			});
			return { assistantMessageId: assistantMessage.id, success: false };
		}
	},

	// Sends one prompt per view sequentially (the Dify stream writes into the
	// last message, so calls cannot run concurrently), reusing the same
	// reference image + conversation across the whole batch. Only the first
	// view shows a user bubble (a summary of all views); the rest are
	// generated silently and grouped via a shared batchId.
	sendMultiViewBatch: async (views, user, inputs) => {
		const validViews = views.filter((v) => v.prompt.trim());
		if (validViews.length === 0) return;

		const batchId = `batch_${Date.now()}`;
		const summary = `Create ${validViews.length} views: ${validViews
			.map((v, i) => v.label.trim() || `View ${i + 1}`)
			.join(", ")}`;
		// One prompt per view must produce exactly one image for that view,
		// regardless of the user's global "images per generation" setting.
		const perViewInputs = { ...inputs, Image_Count: 1 };

		for (let i = 0; i < validViews.length; i++) {
			const view = validViews[i];
			const isLast = i === validViews.length - 1;
			await get().sendMessage(view.prompt, user, perViewInputs, {
				skipUserMessage: i > 0,
				displayPrompt: i === 0 ? summary : undefined,
				viewLabel: view.label.trim() || `View ${i + 1}`,
				batchId,
				keepUploadsOnSuccess: !isLast,
			});
		}
	},

	// Fetch all user conversations for the current category.
	// Cancels any in-flight request for the same resource so a fast category
	// switch can never overwrite state with a response from the previous category.
	fetchConversations: async (user: string, selectedCountry?: string) => {
		// Cancel previous in-flight request
		_fetchConvsAbort?.abort();
		const controller = new AbortController();
		_fetchConvsAbort = controller;

		const { selectedCategory } = get();
		set({ conversationsLoading: true });

		try {
			const res = await fetch(
				`/api/chat?type=conversations&user=${encodeURIComponent(user)}&category=${selectedCategory}${
					selectedCountry ? `&country=${encodeURIComponent(selectedCountry)}` : ""
				}`,
				{ signal: controller.signal },
			);

			if (!res.ok) throw new Error("Failed to fetch conversations");

			const data = await res.json();

			// Guard: don't write if a newer request has already taken over
			if (!controller.signal.aborted) {
				set({
					conversations: Array.isArray(data?.data) ? data.data : [],
					conversationsLoading: false,
				});
			}
		} catch (err) {
			if ((err as Error).name === "AbortError") return; // superseded by newer request
			console.error("Error fetching conversations:", err);
			if (!controller.signal.aborted) {
				set({ conversationsLoading: false });
			}
		} finally {
			if (_fetchConvsAbort === controller) _fetchConvsAbort = null;
		}
	},

	// Load all messages in a conversation.
	loadMessagesByConversationId: async (
		conversationId: string,
		user: string,
		selectedCountry?: string,
	) => {
		// Cancel any previous in-flight message load
		_loadMsgsAbort?.abort();
		const controller = new AbortController();
		_loadMsgsAbort = controller;

		const { selectedCategory } = get();

		try {
			const res = await fetch(
				`/api/chat?type=messages&conversation_id=${encodeURIComponent(conversationId)}&user=${encodeURIComponent(user)}&category=${selectedCategory}${
					selectedCountry ? `&country=${encodeURIComponent(selectedCountry)}` : ""
				}`,
				{ signal: controller.signal },
			);
			if (!res.ok) throw new Error("Failed to load messages");
			const json = await res.json();

			// Guard before processing: a newer request may have started
			if (controller.signal.aborted) return;

			const formattedMessages = formatDifyMessagesResponse(json, selectedCategory);

			// Final guard: don't write state if superseded by a newer request
			if (controller.signal.aborted) return;

			set({
				messages: formattedMessages,
				currentConversationId: conversationId,
				chatStarted: true,
			});

			// Persist id, category, AND owner so a page refresh can restore the
			// exact module that was active AND reject stale entries written by a
			// different user who used the same tab before logging out.
			// Normalize the owner to lowercase so future comparisons are
			// case-insensitive regardless of how Azure AD returns the email.
			sessionStorage.setItem("conversation_id", conversationId);
			sessionStorage.setItem("conversation_category", selectedCategory);
			sessionStorage.setItem("conversation_user", user.trim().toLowerCase());
		} catch (err) {
			if ((err as Error).name === "AbortError") return; // superseded by newer request
			console.error("Error loading messages by conversation ID:", err);
		} finally {
			if (_loadMsgsAbort === controller) _loadMsgsAbort = null;
		}
	},

	// Load a conversation selected from the unified chat_sessions sidebar.
	// The category/region live on the session doc, not the currently-active
	// category, so this also switches selectedCategory/selectedCountry —
	// otherwise a reply typed after opening a history item from a different
	// module would go to the wrong Dify app.
	loadChatSessionMessages: async (
		chatSessionId: string,
		category: string,
		region: "SG" | null,
		difyConversationId: string,
		user: string,
	) => {
		_loadMsgsAbort?.abort();
		const controller = new AbortController();
		_loadMsgsAbort = controller;

		set({ selectedCategory: category });
		if (category === "COMPLIANCE_KEY") {
			set({ selectedCountry: region === "SG" ? "Singapore" : "Indonesia" });
		}

		try {
			const res = await fetch(
				`/api/chat-sessions/${encodeURIComponent(chatSessionId)}/messages`,
				{ signal: controller.signal },
			);
			if (!res.ok) throw new Error("Failed to load chat session messages");
			const json = await res.json();

			if (controller.signal.aborted) return;

			const formattedMessages = formatDifyMessagesResponse(json, category);

			if (controller.signal.aborted) return;

			set({
				messages: formattedMessages,
				currentConversationId: difyConversationId,
				chatStarted: true,
			});

			sessionStorage.setItem("conversation_id", difyConversationId);
			sessionStorage.setItem("conversation_category", category);
			sessionStorage.setItem("conversation_user", user.trim().toLowerCase());
		} catch (err) {
			if ((err as Error).name === "AbortError") return;
			console.error("Error loading chat session messages:", err);
		} finally {
			if (_loadMsgsAbort === controller) _loadMsgsAbort = null;
		}
	},

	// Delete a conversation and immediately refresh the history list so no
	// caller can forget the refresh or create a race condition by firing it
	// before the delete completes.
	deleteConversation: async (
		conversationId: string,
		user: string,
		selectedCountry: string,
	) => {
		const { selectedCategory } = get();

		try {
			const response = await fetch("/api/chat/", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					conversationId,
					user,
					category: selectedCategory,
					country: selectedCountry,
				}),
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(
					`Failed to delete conversation: ${error.message}`,
				);
			}

			// Refresh the sidebar list now that the server has confirmed deletion.
			// Pass country only for the module that uses it so other modules
			// don't send a spurious query param.
			const country =
				selectedCategory === "COMPLIANCE_KEY" ? selectedCountry : undefined;
			await get().fetchConversations(user, country);
		} catch (error) {
			console.error("Error deleting conversation:", error);
		}
	},
}));
