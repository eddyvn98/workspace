/**
 * lib/dify-caption.ts
 *
 * Narrow helper: caption an image via the existing Dify chat backend so it
 * can be persisted into the mindmap knowledge base like a document. This is
 * NOT a new vision API integration — it reuses the same CHAT_KEY Dify app
 * already used by app/api/chat/messages/route.ts and app/api/chat/files/route.ts,
 * just called directly (server-to-server) since those routes require a real
 * browser session token that a server route can't forge.
 *
 * Two Dify calls, mirroring the existing client flow:
 *   1. POST {base}/files/upload  -> upload_file_id
 *   2. POST {base}/chat-messages -> caption text (files: [{ type: "image", ... }])
 */

import { resolveCategoryProvider } from "@/app/config/categoryProviderResolver";
import { recordDifyBlockingResponse } from "@/lib/ai-usage/server/usage-recorder";

const CAPTION_PROMPT =
  "Describe this image in detail, including any visible text, for search-indexing purposes.";

function resolveAgentBaseUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_AGENT_API_URL;
  if (!url) return null;
  return url.replace(/\/$/, "").replace(/\/chat-messages$/, "");
}

async function uploadImageToDify(
  buffer: Buffer,
  mimeType: string,
  filename: string,
  apiKey: string,
  baseUrl: string,
  user: string,
): Promise<string> {
  const form = new FormData();
  const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
  form.append("file", blob, filename);
  form.append("user", user);

  const res = await fetch(`${baseUrl}/files/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  const body = await res.text();
  if (!res.ok) {
    throw new Error(`Dify file upload failed (${res.status}): ${body.slice(0, 500)}`);
  }
  const data = JSON.parse(body) as { id?: string };
  if (!data.id) {
    throw new Error("Dify file upload response missing id");
  }
  return data.id;
}

async function requestCaption(
  uploadFileId: string,
  apiKey: string,
  baseUrl: string,
  user: string,
): Promise<string> {
  const res = await fetch(`${baseUrl}/chat-messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: {},
      query: CAPTION_PROMPT,
      response_mode: "blocking",
      user,
      files: [
        {
          type: "image",
          transfer_method: "local_file",
          url: "",
          upload_file_id: uploadFileId,
        },
      ],
    }),
  });

  const body = await res.text();
  if (!res.ok) {
    throw new Error(`Dify chat-messages failed (${res.status}): ${body.slice(0, 500)}`);
  }
  const data = JSON.parse(body) as { answer?: string };
  recordDifyBlockingResponse(
    { email: user, category: "CHAT_KEY", feature: "knowledge-image-caption", difyUrl: `${baseUrl}/chat-messages` },
    data,
  );
  return (data.answer ?? "").trim();
}

/**
 * Captions an image buffer via Dify and returns the caption text.
 * Throws on any failure — callers should catch and treat it as a soft
 * failure (skip persisting, don't block the caller's main flow).
 */
/**
 * Dedicated image-caption workflow (docs/dify/dify-image-caption-workflow.yml).
 * Used when WORKSPACE_IMAGE_CAPTION_KEY is set: CHAT_KEY may point at an agent
 * app that demands its own required inputs, which a bare caption call cannot
 * supply, while this workflow only needs the image.
 */
async function captionViaWorkflow(
  buffer: Buffer,
  mimeType: string,
  filename: string,
  user: string,
  apiKey: string,
  baseUrl: string,
): Promise<string> {
  const uploadFileId = await uploadImageToDify(buffer, mimeType, filename, apiKey, baseUrl, user);
  const res = await fetch(`${baseUrl}/workflows/run`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      inputs: { image: { type: "image", transfer_method: "local_file", upload_file_id: uploadFileId } },
      response_mode: "blocking",
      user,
    }),
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`Dify workflow run failed (${res.status}): ${body.slice(0, 500)}`);
  }
  const data = JSON.parse(body) as { data?: { outputs?: { caption?: string } } };
  // The run completed and consumed usage whatever the caption turns out to be.
  // This path returns before the CHAT_KEY path, so a caption is recorded once.
  recordDifyBlockingResponse(
    { email: user, category: "WORKSPACE_IMAGE_CAPTION_KEY", feature: "knowledge-image-caption", difyUrl: `${baseUrl}/workflows/run` },
    data,
  );
  const caption = (data.data?.outputs?.caption ?? "").trim();
  if (!caption) {
    throw new Error("Dify returned an empty caption");
  }
  return caption;
}

export async function captionImageViaDify(
  buffer: Buffer,
  mimeType: string,
  filename: string,
  user: string,
): Promise<string> {
  const baseUrl = resolveAgentBaseUrl();
  if (!baseUrl) {
    throw new Error("NEXT_PUBLIC_AGENT_API_URL is not configured");
  }
  const workflowKey = process.env.WORKSPACE_IMAGE_CAPTION_KEY;
  if (workflowKey) {
    return captionViaWorkflow(buffer, mimeType, filename, user, workflowKey, baseUrl);
  }

  const { apiKey } = resolveCategoryProvider("CHAT_KEY");
  if (!apiKey) {
    throw new Error("CHAT_KEY is not configured");
  }

  const uploadFileId = await uploadImageToDify(buffer, mimeType, filename, apiKey, baseUrl, user);
  const caption = await requestCaption(uploadFileId, apiKey, baseUrl, user);
  if (!caption) {
    throw new Error("Dify returned an empty caption");
  }
  return caption;
}
