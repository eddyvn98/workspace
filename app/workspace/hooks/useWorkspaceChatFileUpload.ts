"use client";

import { useCallback, useState } from "react";
import type { WorkspaceAttachedFile } from "../types/chat";
import { fileAttachmentUnderBoard } from "../utils/workspaceDocumentFiling";

/**
 * @param boardId The board an attachment should also be filed under. Omitted
 *   for a chat with no board open, in which case the file is used once for
 *   this message and not remembered.
 */
export function useWorkspaceChatFileUpload(
  boardId?: string,
  uploadEndpoint = "/api/chat/files",
  uploadHeaders?: Record<string, string>,
) {
  const [attachedFiles, setAttachedFiles] = useState<WorkspaceAttachedFile[]>([]);

  const uploadFile = useCallback(async (file: File) => {
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const isImage = file.type.startsWith("image/");
    const previewUrl = isImage ? URL.createObjectURL(file) : undefined;

    const newFile: WorkspaceAttachedFile = {
      tempId,
      name: file.name,
      size: file.size,
      type: file.type,
      status: "uploading",
      previewUrl,
    };

    setAttachedFiles((prev) => [...prev, newFile]);

    try {
      const formData = new FormData();
      formData.append("file", file);
      if (boardId) formData.append("workspace_id", boardId);

      const res = await fetch(uploadEndpoint, {
        method: "POST",
        headers: uploadHeaders,
        body: formData,
      });

      if (!res.ok) {
        throw new Error(`Upload failed (${res.status})`);
      }

      const data = await res.json();
      const serverId: string | undefined = data.id;

      if (!serverId) {
        throw new Error("Upload failed: No server ID returned");
      }

      // Do not expose the attachment as ready until the Workspace knowledge
      // copy has finished. The Dify upload and the board index are separate
      // stores; racing them lets the next message search an index that does
      // not contain the file yet. A knowledge-index failure is deliberately
      // non-fatal: the Dify attachment remains usable for this message.
      const knowledgeStored = await fileAttachmentUnderBoard(boardId, file);

      setAttachedFiles((prev) =>
        prev.map((f) =>
          f.tempId === tempId
            ? {
                ...f,
                id: serverId,
                status: "done",
                url: data.source_url || data.url,
                knowledgeStored,
              }
            : f
        )
      );

      if (boardId && !knowledgeStored) {
        console.warn("[workspace chat] file uploaded to Dify but was not indexed in the board knowledge base");
      }
    } catch (err) {
      console.error("[workspace chat] file upload error:", err);
      setAttachedFiles((prev) =>
        prev.map((f) => (f.tempId === tempId ? { ...f, status: "error" } : f))
      );
    }
  }, [boardId, uploadEndpoint, uploadHeaders]);

  const removeFile = useCallback((key: string) => {
    setAttachedFiles((prev) => {
      const target = prev.find((f) => f.id === key || f.tempId === key);
      if (target?.previewUrl) {
        try {
          URL.revokeObjectURL(target.previewUrl);
        } catch {}
      }
      return prev.filter((f) => f.id !== key && f.tempId !== key);
    });
  }, []);

  const clearFiles = useCallback(() => {
    setAttachedFiles((prev) => {
      prev.forEach((f) => {
        if (f.previewUrl) {
          try {
            URL.revokeObjectURL(f.previewUrl);
          } catch {}
        }
      });
      return [];
    });
  }, []);

  return {
    attachedFiles,
    setAttachedFiles,
    uploadFile,
    removeFile,
    clearFiles,
  };
}
