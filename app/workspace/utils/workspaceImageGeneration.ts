import type { ImagePayloadInputs } from "@/types/image-generation.types";
import { buildImageDifyInputs } from "@/lib/image-dify-inputs";

type DifyImageFile = { type?: string; mime_type?: string; belongs_to?: string; url?: string };

function addImageFileUrls(value: unknown, urls: Set<string>) {
	if (!Array.isArray(value)) return;
	for (const item of value as DifyImageFile[]) {
		if (
			item?.belongs_to === "assistant" &&
			(item.type === "image" || item.mime_type?.startsWith("image/")) &&
			typeof item.url === "string" &&
			item.url
		) urls.add(item.url);
	}
}

function collectOutputImages(value: unknown, urls: Set<string>) {
	if (typeof value === "string") {
		try {
			collectOutputImages(JSON.parse(value), urls);
		} catch {
			const markdown = /!\[[^\]]*\]\((https?:\/\/[^)]+)\)/g;
			for (const match of value.matchAll(markdown)) urls.add(match[1]);
			const imageUrl = /https?:\/\/[^\s"'<>]+\.(?:png|jpe?g|webp|gif)(?:\?[^\s"'<>]*)?/gi;
			for (const match of value.matchAll(imageUrl)) urls.add(match[0]);
		}
		return;
	}
	if (Array.isArray(value)) {
		value.forEach((item) => collectOutputImages(item, urls));
		return;
	}
	if (!value || typeof value !== "object") return;
	const record = value as Record<string, unknown>;
	if (typeof record.url === "string" && (record.type === "image" || record.mime_type === "image" || /\.(?:png|jpe?g|webp|gif)(?:\?|$)/i.test(record.url))) {
		urls.add(record.url);
	}
	Object.values(record).forEach((item) => collectOutputImages(item, urls));
}

/** Streams the Image Generator response and returns assistant-owned result images. */
export async function readGeneratedImageUrls(
	response: Response,
	onProgress: (message: string) => void,
): Promise<string[]> {
	if (!response.ok) {
		const text = await response.text();
		throw new Error(text || `Image generation failed (${response.status}).`);
	}
	if (!response.body) throw new Error("Dify did not return a response stream.");

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	const urls = new Set<string>();
	let buffer = "";
	let answer = "";
	const processEvent = (eventText: string) => {
		const raw = eventText.split("\n").find((line) => line.startsWith("data:"))?.slice(5).trim();
		if (!raw || raw === "[DONE]") return;
		let event: Record<string, unknown>;
		try { event = JSON.parse(raw) as Record<string, unknown>; }
		catch { return; }
		if (event.event === "error") {
			const data = event.data as Record<string, unknown> | undefined;
			throw new Error(typeof data?.message === "string" ? data.message : "Dify reported an image generation error.");
		}
		if (typeof event.answer === "string") answer += event.answer;
		addImageFileUrls(event.message_files, urls);
		if (event.event === "workflow_finished") collectOutputImages((event.data as Record<string, unknown> | undefined)?.outputs, urls);
		if (event.event === "node_started" || event.event === "message") onProgress("Generating images…");
	};

	while (true) {
		const { done, value } = await reader.read();
		buffer += decoder.decode(value, { stream: !done });
		const events = buffer.split("\n\n");
		buffer = events.pop() ?? "";
		for (const event of events) processEvent(event);
		if (done) break;
	}
	if (buffer.trim()) processEvent(buffer);
	collectOutputImages(answer, urls);
	return [...urls];
}

export async function uploadReferenceToDify(file: File): Promise<string> {
	const form = new FormData();
	form.append("file", file);
	const response = await fetch("/api/chat/files", {
		method: "POST",
		headers: { "x-category": "IMAGE_KEY" },
		body: form,
	});
	const payload = await response.json().catch(() => ({}));
	if (!response.ok || typeof payload.id !== "string") {
		throw new Error(typeof payload.error === "string" ? payload.error : "Could not upload the reference image to Dify.");
	}
	return payload.id;
}

export function makeImageGenerationRequest(prompt: string, inputs: ImagePayloadInputs, uploadIds: string[]) {
	return {
		inputs: buildImageDifyInputs(inputs),
		query: prompt,
		response_mode: "streaming",
		files: uploadIds.map((id) => ({ type: "image", transfer_method: "local_file", url: "", upload_file_id: id })),
	};
}

export async function fetchGeneratedImage(url: string): Promise<File> {
	const response = await fetch(`/api/proxy/file?url=${encodeURIComponent(url)}`, { cache: "no-store" });
	if (!response.ok) throw new Error(`Could not download the generated image (${response.status}).`);
	const blob = await response.blob();
	if (!blob.type.startsWith("image/")) throw new Error("The Dify result is not an image file.");
	const extension = blob.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
	return new File([blob], `workspace-ai-${Date.now()}.${extension}`, { type: blob.type });
}
