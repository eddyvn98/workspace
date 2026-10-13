import { IMessage } from "@/interface/IMessage";
import { useImageStore } from "@/stores/useImageStore";
import { useImageSettingsStore } from "@/stores/useImageSettingsStore";
import { useMessageStore } from "@/stores/useMessageStore";
import { ILLMClient } from "../types";
import { useFileStore } from "@/stores/useFileStore";
import { splitMessageFilesByOwner } from "@/utils/message.utils";
import { useVideoFileStore } from "@/stores/useVideoFileStore";
import { useVideoSettingsStore } from "@/stores/useVideoSettingsStore";
import { VIDEO_NODE_PROGRESS } from "@/types/video-generation.types";
import { useProjectKnowledgeStore } from "@/stores/useProjectKnowledgeStore";
import { getModelMaxInputImages, type ImageModelId } from "@/types/image-generation.types";
import { useSkillLibraryStore } from "@/stores/useSkillLibraryStore";
import { buildSelectedSkillsInput } from "@/types/skill-library.types";
import { isTrackedChatSessionCategory } from "@/lib/chat-sessions/categories";
import { upsertChatSessionInCache } from "@/lib/chat-sessions/queryClient";

// Fire-and-forget upsert into chat_sessions — never awaited on the
// user-facing send path. A network failure here must never surface to the
// user or affect the chat stream, hence the swallowed catch. On success, the
// route hands back the upserted doc so the sidebar's React Query cache can
// be patched directly instead of refetching the whole list for one message.
function recordChatSession(params: {
	category: string;
	countryInput: unknown;
	difyConversationId: string;
	title?: string;
}): void {
	if (!isTrackedChatSessionCategory(params.category)) return;

	const region =
		params.category === "COMPLIANCE_KEY" &&
		String(params.countryInput ?? "").toLowerCase() === "singapore"
			? "SG"
			: undefined;

	void fetch("/api/chat-sessions", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			category: params.category,
			region,
			difyConversationId: params.difyConversationId,
			title: params.title,
		}),
		keepalive: true,
	})
		.then((res) => (res.ok ? res.json() : null))
		.then((doc) => {
			if (!doc) return;
			upsertChatSessionInCache({
				id: doc.id,
				title: doc.title,
				category: doc.category,
				region: doc.region,
				updatedAt: doc.updatedAt,
				pinned: doc.pinned,
				difyConversationId: doc.difyConversationId,
			});
		})
		.catch(() => {});
}

// Returns true when an unknown value is a VideoGenerationResult shape.
function isVideoResultObject(p: unknown): boolean {
	return (
		p !== null &&
		typeof p === "object" &&
		"status" in (p as object) &&
		["success", "error", "partial"].includes(
			(p as Record<string, unknown>).status as string,
		)
	);
}

/**
 * Extracts a VideoGenerationResult JSON string from `raw`, which may contain
 * surrounding text, markdown code fences, or other non-JSON content.
 * Returns the clean JSON string on success, or null if no valid result found.
 */
function extractVideoResultJson(raw: string): string | null {
	if (!raw) return null;

	// 1. Direct parse (fast path — most common case)
	try {
		const trimmed = raw.trim();
		const p = JSON.parse(trimmed);
		if (isVideoResultObject(p)) return trimmed;
	} catch {}

	// 2. Strip markdown code fence and retry
	const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
	if (fence) {
		try {
			const p = JSON.parse(fence[1].trim());
			if (isVideoResultObject(p)) return fence[1].trim();
		} catch {}
	}

	// 3. Brace-match: find each top-level JSON object in mixed text
	let start = -1;
	let depth = 0;
	let inStr = false;
	let escaped = false;

	for (let i = 0; i < raw.length; i++) {
		const ch = raw[i];
		if (escaped) { escaped = false; continue; }
		if (inStr) {
			if (ch === "\\") escaped = true;
			else if (ch === '"') inStr = false;
			continue;
		}
		if (ch === '"') { inStr = true; continue; }
		if (ch === "{") {
			if (depth === 0) start = i;
			depth++;
		} else if (ch === "}") {
			depth--;
			if (depth === 0 && start !== -1) {
				try {
					const candidate = raw.slice(start, i + 1);
					const p = JSON.parse(candidate);
					if (isVideoResultObject(p)) return candidate;
				} catch {}
				start = -1;
			}
		}
	}

	return null;
}

export function createDifyClient(
	category: string,
	prompt: string,
	inputs: Record<string, any>,
	user: string,
): ILLMClient {
	return {
		sendMessage: async ({ messages: _messages }: { messages: IMessage[] }) => {
			const images = useImageStore.getState().images;
			const files = useFileStore.getState().files;
			const isVideoCategory = category === "VIDEO_GEN_EDIT_KEY";

			const storedCategory =
				sessionStorage.getItem("conversation_category");
			const storedConversationId =
				storedCategory === category
					? sessionStorage.getItem("conversation_id")
					: null;

			// VIDEO_EDIT must always start a fresh Dify session. Files are uploaded
			// outside any conversation context, so attaching a stale conversation_id
			// causes Dify to reject the newly uploaded file — it was never bound to
			// that prior conversation during upload.
			const isVideoEdit = isVideoCategory && inputs.task_type === "VIDEO_EDIT";

			// Whether this send starts a brand-new Dify conversation — used only
			// to decide if the chat_sessions upsert below should carry a title.
			// isVideoEdit always starts fresh regardless of storedConversationId.
			const isNewChatSession = !storedConversationId || isVideoEdit;

			const isSlashMindmap = /^\/mi(?:nd|d)map\b/i.test(prompt.trim());
			const finalPrompt = isSlashMindmap
				? `${prompt.trim().replace(/^\/mi(?:nd|d)map\s*/i, "")}\n\n[SYSTEM INSTRUCTION] Hãy tạo sơ đồ tư duy bằng cách sử dụng một khối mã (code block) markdown với ngôn ngữ là 'mindmap'. Nội dung bên trong khối mã PHẢI là một danh sách phân cấp thụt lề sử dụng dấu gạch ngang (-). Ví dụ:\n\`\`\`mindmap\n- Chủ đề gốc\n  - Nhánh con 1\n    - Chi tiết 1\n  - Nhánh con 2\n\`\`\`\nChỉ xuất ra danh sách phân cấp trong khối mã \`\`\`mindmap\`\`\`. Không sử dụng định dạng phức tạp khác. TUYỆT ĐỐI KHÔNG sử dụng công cụ tạo file tải về hoặc xuất file, hãy xuất kết quả trực tiếp dưới dạng văn bản trong ô chat.`
				: prompt;

			// Each active skill already carries the scope ("public" | "user") it was
			// selected under (see useSkillLibraryStore.toggleSkillActive), so tab
			// switches after selection can't reclassify it.
			// Dify's Start node types `selected_skills` as a JSON object, so the
			// selection array is wrapped here — at the request boundary — instead
			// of changing the store/UI shape.
			const activeSkills = useSkillLibraryStore.getState().activeSkills;
			const inputsWithSkills = {
				...inputs,
				selected_skills: buildSelectedSkillsInput(activeSkills),
			};

			let requestBody: Record<string, any> = {
				inputs: inputsWithSkills,
				query: finalPrompt,
				response_mode: "streaming",
				user,
			};

			// ── File attachment per category ──────────────────────────────
			if (category === "IMAGE_KEY") {
				const uploadedImages = images
					.filter((img) => img.status === "done" && img.url)
					.map((img) => ({
						type: "image",
						transfer_method: "remote_url",
						url: img.url,
						upload_file_id: "",
					}));

				// Multiple reference images (referenceImages) take priority and are all
				// sent together as one group alongside the main images — this never
				// multiplies combinations, it's still one request per send.
				const refState = useImageSettingsStore.getState();
				const manualReferenceUrls = refState.referenceImages
					.filter((img) => img.status === "done" && img.url)
					.map((img) => img.url);
				const referenceImageUrls =
					manualReferenceUrls.length > 0
						? manualReferenceUrls
						: refState.referenceImageUrl
							? [refState.referenceImageUrl]
							: [];
				const referenceImageEntries = referenceImageUrls.map((url) => ({
					type: "image",
					transfer_method: "remote_url",
					url,
					upload_file_id: "",
				}));

				const imageInputs = [...uploadedImages, ...referenceImageEntries];
				const model = (inputs.model ?? refState.imageModel) as ImageModelId;
				const maxImageInputs = getModelMaxInputImages(model);
				if (imageInputs.length > maxImageInputs) {
					throw new Error(
						`${model} accepts at most ${maxImageInputs} total input images; received ${imageInputs.length}.`,
					);
				}

				requestBody.files = imageInputs;
			}

			if (category === "CHAT_KEY" || category === "DESIGN_AGENT") {
				const uploadedFiles = files
					.filter((file) => file.status === "done" && file.id)
					.map((file) => ({
						type: file.type.startsWith("image/") ? "image" : "document",
						transfer_method: "local_file",
						url: "",
						upload_file_id: file.id as string,
					}));

				const uploadedImages = images
					.filter((img) => img.status === "done" && img.url)
					.map((img) => ({
						type: "image",
						transfer_method: "remote_url",
						url: img.url,
						upload_file_id: "",
					}));

				const knowledgeImageFiles = useProjectKnowledgeStore.getState().pendingImageFiles;
				useProjectKnowledgeStore.getState().clearPendingImageFiles();

				requestBody.files = [...uploadedFiles, ...uploadedImages, ...knowledgeImageFiles];
			}

			// Video: files are already uploaded to Dify via /api/video/files,
			if (isVideoCategory) {
				const { uploadedFiles, audioFile } = useVideoFileStore.getState();

				const difyFiles: Array<{
					type: string;
					transfer_method: string;
					upload_file_id: string;
					url: string;
				}> = [];

				uploadedFiles
					.filter((f) => f.status === "done" && f.uploadFileId)
					.forEach((f) => {
						difyFiles.push({
							type: f.fileType,
							transfer_method: "local_file",
							upload_file_id: f.uploadFileId!,
							url: "", // Required by Dify schema even when using local_file transfer
						});
					});

				if (audioFile?.status === "done" && audioFile.uploadFileId) {
					difyFiles.push({
						type: "audio",
						transfer_method: "local_file",
						upload_file_id: audioFile.uploadFileId!,
						url: "",
					});
				}

				if (process.env.NODE_ENV === "development") {
					console.group("[difyAdapter] VIDEO outbound payload");
					console.log("task_type      :", inputs.task_type);
					console.log("is_video_edit  :", isVideoEdit);
					console.log("conversation_id:", isVideoEdit ? "(cleared — fresh)" : storedConversationId ?? "(none)");
					console.log("user           :", user);
					console.log("upload_file_ids:", difyFiles.map((f) => f.upload_file_id));
					console.log("files[]        :", JSON.stringify(difyFiles, null, 2));
					console.log(
						"store raw files:",
						uploadedFiles.map((f) => ({
							name: f.name,
							fileType: f.fileType,
							status: f.status,
							uploadFileId: f.uploadFileId,
						})),
					);
					console.groupEnd();
				}

				if (isVideoEdit) {
					requestBody = {
						files: difyFiles,
						inputs: inputsWithSkills,
						query: finalPrompt,
						response_mode: "streaming",
						conversation_id: "",
						user,
					};
				} else {
					requestBody.files = difyFiles;
				}
			}
			// ─────────────────────────────────────────────────────────────

			// For all non-VIDEO_EDIT flows, attach the stored conversation_id when available.
			if (storedConversationId && !isVideoEdit) {
				requestBody.conversation_id = storedConversationId;
			}

			const res = await fetch("/api/chat/messages", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-category": category,
				},
				body: JSON.stringify(requestBody),
				keepalive: true,
			});

			if (!res.ok) {
				const errorText = await res.text();
				throw new Error(
					`API request failed: ${res.status} - ${errorText}`,
				);
			}

			if (!res.body) throw new Error("No response body received");

			// ── SSE stream reader ─────────────────────────────────────────
			const reader = res.body.getReader();
			const decoder = new TextDecoder("utf-8");

			let sseBuffer = "";
			let fullRawResponse = "";
			let hasInitialContent = false;

			const updateStore = (isFinal = false) => {
				useMessageStore.setState((state) => {
					const updated = [...state.messages];
					const lastIndex = updated.length - 1;
					const lastMsg = updated[lastIndex];

					if (!lastMsg || lastMsg.role !== "assistant")
						return { messages: updated };

					const thinkRegex =
						/^<think>([\s\S]*?)(?:<\/think>([\s\S]*))?$/;
					const match = fullRawResponse.match(thinkRegex);

					let thought = "";
					let finalContent = "";
					let isThinkingFinished = false;

					if (match) {
						thought = match[1] || "";
						finalContent = match[2] || "";
						isThinkingFinished = match[2] !== undefined || isFinal;
					} else {
						if (fullRawResponse.startsWith("<think>")) {
							thought = fullRawResponse.replace(/^<think>/, "");
							isThinkingFinished = false;
						} else {
							finalContent = fullRawResponse;
							isThinkingFinished = true;
						}
					}

					updated[lastIndex] = {
						...lastMsg,
						content: finalContent,
						thought,
						isThinkingFinished,
						isLoading: !isFinal,
					};

					return { messages: updated };
				});
			};

			try {
				let pendingUpdate = false;
				const flushInterval = setInterval(() => {
					if (pendingUpdate) {
						updateStore(false);
						pendingUpdate = false;
					}
				}, 30);

				while (true) {
					const { value, done } = await reader.read();
					if (done) break;

					const chunk = decoder.decode(value, { stream: true });
					sseBuffer += chunk;

					const lines = sseBuffer.split("\n");
					sseBuffer = lines.pop() || "";

					for (const rawLine of lines) {
						const line = rawLine.trim();
						if (!line.startsWith("data:")) continue;

						const payload = line.slice(5).trim();
						if (!payload || payload === "[DONE]") continue;

						try {
							const parsed = JSON.parse(payload);

							// Persist conversation ID and attach message_files
							if (
								parsed.event === "message_end" ||
								parsed.event === "workflow_finished"
							) {
								if (parsed.conversation_id) {
									sessionStorage.setItem(
										"conversation_id",
										parsed.conversation_id,
									);
									sessionStorage.setItem(
										"conversation_category",
										category,
									);
									// Keep the owner in sync so the page-refresh
									sessionStorage.setItem(
										"conversation_user",
										user.trim().toLowerCase(),
									);
									useMessageStore.setState({
										currentConversationId:
											parsed.conversation_id,
									});

									recordChatSession({
										category,
										countryInput: inputs.country,
										difyConversationId:
											parsed.conversation_id,
										title: isNewChatSession
											? prompt.trim().slice(0, 120)
											: undefined,
									});
								}

								// For video workflows the JSON result may arrive via
								// workflow_finished outputs instead of text_chunk events.
								if (
									isVideoCategory &&
									parsed.event === "workflow_finished" &&
									parsed.data?.outputs &&
									!fullRawResponse
								) {
									const outputs = parsed.data.outputs as Record<string, unknown>;
									for (const val of Object.values(outputs)) {
										let candidate: unknown = val;
										if (typeof val === "string") {
											try { candidate = JSON.parse(val); } catch { candidate = null; }
										}
										if (isVideoResultObject(candidate)) {
											fullRawResponse = JSON.stringify(candidate);
											break;
										}
									}
								}

								if (
									Array.isArray(parsed.message_files) &&
									parsed.message_files.length > 0
								) {
									const {
										userImages,
										userFiles,
										aiImages,
										aiFiles,
									} = splitMessageFilesByOwner(
										parsed.message_files,
									);

									useMessageStore.setState((state) => {
										const updated = [...state.messages];
										const lastIndex = updated.length - 1;

										if (
											updated[lastIndex]?.role ===
											"assistant"
										) {
											updated[lastIndex] = {
												...updated[lastIndex],
												...(aiImages.length
													? { images: aiImages }
													: {}),
												...(aiFiles.length
													? { files: aiFiles }
													: {}),
											};
										}

										const userIdx = lastIndex - 1;
										if (
											userIdx >= 0 &&
											updated[userIdx]?.role === "user" &&
											(userImages.length ||
												userFiles.length)
										) {
											updated[userIdx] = {
												...updated[userIdx],
												...(userImages.length
													? {
															images: [
																...(updated[
																	userIdx
																].images ?? []),
																...userImages,
															],
														}
													: {}),
												...(userFiles.length
													? {
															files: [
																...(updated[
																	userIdx
																].files ?? []),
																...userFiles,
															],
														}
													: {}),
											};
										}

										return { messages: updated };
									});
								}
							}

							// SSE-level error event — surface as a user-friendly message
							if (parsed.event === "error") {
								console.error("[difyAdapter] SSE error event:", parsed);
								const sseErrorMsg = isVideoCategory
									? "The video generation service encountered an error. Please try again."
									: "Something went wrong. Please try again.";
								useMessageStore.setState((state) => {
									const updated = [...state.messages];
									const lastIndex = updated.length - 1;
									if (updated[lastIndex]?.role === "assistant") {
										updated[lastIndex] = {
											...updated[lastIndex],
											content: sseErrorMsg,
											isLoading: false,
											error: true,
										};
									}
									return { messages: updated };
								});
								if (isVideoCategory) {
									useVideoSettingsStore.getState().setProgress(null);
								}
								break;
							}

							// Track node progress for video generation
							if (
								isVideoCategory &&
								parsed.event === "node_started" &&
								parsed.data?.title
							) {
								const progress =
									VIDEO_NODE_PROGRESS[
										parsed.data.title as string
									];
								if (progress) {
									useVideoSettingsStore
										.getState()
										.setProgress(progress);
								}
							}

							const isTextEvent =
								parsed.event === "message" ||
								parsed.event === "agent_message";

							const isWorkflowChunk =
								parsed.event === "text_chunk" &&
								parsed.data?.text;

							const delta = isTextEvent
								? (parsed.answer ??
									parsed.text ??
									parsed.message ??
									"")
								: isWorkflowChunk
									? parsed.data.text
									: null;

							if (delta) {
								fullRawResponse += delta;

								// For video, suppress streaming text renders — content is JSON
								// and should only be set once completely received.
								if (!isVideoCategory) {
									if (!hasInitialContent) {
										hasInitialContent = true;
										updateStore(false);
									} else {
										pendingUpdate = true;
									}
								}
							}
						} catch (err) {
							console.warn(
								"Stream chunk not full JSON yet:",
								payload,
							);
						}
					}
				}

				clearInterval(flushInterval);

				// Extract video result from fullRawResponse (handles mixed text,
				// markdown fences, and plain JSON) then normalise to clean JSON so
				// message.content is always a parseable string for the UI.
				if (isVideoCategory && fullRawResponse) {
					const jsonStr = extractVideoResultJson(fullRawResponse);
					if (jsonStr) {
						try {
							const result = JSON.parse(jsonStr);
							useVideoSettingsStore
								.getState()
								.handleGenerationResult(result);
							fullRawResponse = jsonStr;
						} catch {}
					}
				}

				updateStore(true);
			} catch (err) {
				// A bare TypeError out of reader.read() means the underlying
				// connection was cut before the stream's final event arrived —
				// distinct from a JSON/SSE parse issue, which is caught above
				// per-line and never reaches here.
				const isNetworkTermination = err instanceof TypeError;
				console.error(
					isNetworkTermination
						? `Chat stream terminated before receiving a completion event (${hasInitialContent ? "partial" : "no"} content received).`
						: "Stream processing failed:",
					err,
				);
				throw err;
			} finally {
				try {
					reader.releaseLock();
				} catch {}
			}
		},
	};
}
