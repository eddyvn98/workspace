"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { ExternalLink, Link as LinkIcon, Play } from "lucide-react";
import { registerBlockRenderer, type BlockRendererProps } from "./registry";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { applyBackgroundOpacity } from "../utils/colorOpacity";
import { isEmbedAllowed } from "../utils/embedAllowlist";

function deriveHostname(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Fetches this url's Open Graph preview once and writes it into block data
 *  (see types/block.ts's `link` payload) so it's cached, not re-fetched on
 *  every render/reload. Fire-and-forget: a missing preview is not an error,
 *  just a poster with no image. */
function requestPreviewFetch(boardId: string | null, url: string, onChange: (patch: object) => void) {
  if (!boardId) return;
  fetch(`/api/workspaces/${boardId}/link-preview?url=${encodeURIComponent(url)}`)
    .then((res) => (res.ok ? res.json() : null))
    .then((body: { preview?: { title?: string; imageUrl?: string; description?: string } } | null) => {
      if (!body?.preview) return;
      onChange({
        previewImageUrl: body.preview.imageUrl,
        previewDescription: body.preview.description,
      });
    })
    .catch(() => {});
}

export const LinkBlock: React.FC<BlockRendererProps<"link">> = ({ block, isSelected, onChange }) => {
  const boardId = useWorkspaceStore((s) => s.boardId);
  const { url = "", title = "", faviconUrl, previewImageUrl } = block.data ?? {};
  const displayTitle = title || (url ? deriveHostname(url) ?? url : "") || "Untitled Link";
  // Same "click to preview" lifecycle as FileBlock.tsx's iframe — a live embed
  // is a full document, not a cheap thumbnail; several auto-loaded ones is a
  // real way to hit ERR_INSUFFICIENT_RESOURCES.
  const [activated, setActivated] = useState(false);
  const embedAllowed = Boolean(url) && isEmbedAllowed(url);
  const backgroundColor = applyBackgroundOpacity(
    block.style?.backgroundColor ?? "#ffffff",
    block.style?.backgroundOpacity ?? 1
  );
  const borderColor = block.style?.borderColor ?? (isSelected ? "#2563eb" : "#cbd5e1");

  useEffect(() => {
    if (url && !previewImageUrl) requestPreviewFetch(boardId, url, onChange);
    // Deliberately excludes onChange: it's a fresh closure every render (see
    // BlockRendererProps), and including it would refetch on every keystroke
    // elsewhere in the app, not just when this block's own url/preview changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, boardId, previewImageUrl]);

  const handlePosterClick = () => {
    if (embedAllowed) {
      setActivated(true);
    } else if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        borderRadius: "6px",
        backgroundColor,
        border: `${isSelected ? "2px" : "1px"} solid ${borderColor}`,
        boxShadow: isSelected
          ? "0 0 0 1px #2563eb, 0 4px 6px -1px rgba(0, 0, 0, 0.1)"
          : "0 1px 3px 0 rgba(0, 0, 0, 0.1)",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {!url && (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#94a3b8",
            fontSize: "13px",
            fontStyle: "italic",
          }}
        >
          No URL specified
        </div>
      )}

      {url && embedAllowed && activated && (
        // Approved-origin embed only (embedAllowlist.ts). allow-same-origin is
        // safe to include here even though the general-purpose LinkBlock used
        // to omit it: the framed origin (e.g. youtube.com) is never the same
        // as ours regardless, so this can't grant access to our own storage —
        // it only restores the framed page's OWN origin identity, which some
        // players (YouTube's included) need to initialize video playback
        // instead of rendering a black box.
        <iframe
          src={url}
          title={displayTitle}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"
          style={{ width: "100%", height: "100%", border: "none", pointerEvents: isSelected ? "auto" : "none" }}
        />
      )}

      {url && !(embedAllowed && activated) && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={handlePosterClick}
          style={{
            width: "100%",
            height: "100%",
            border: "none",
            padding: 0,
            cursor: "pointer",
            position: "relative",
            backgroundColor: "#0f172a",
            backgroundImage: previewImageUrl ? `url(${previewImageUrl})` : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          {!previewImageUrl && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {faviconUrl ? (
                <Image src={faviconUrl} alt="" width={32} height={32} unoptimized style={{ width: "32px", height: "32px", borderRadius: "4px" }} />
              ) : (
                <LinkIcon size={28} color="#94a3b8" />
              )}
            </div>
          )}
          {embedAllowed && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(15, 23, 42, 0.25)",
              }}
            >
              <span
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "50%",
                  backgroundColor: "rgba(255, 255, 255, 0.9)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Play size={18} color="#0f172a" fill="#0f172a" style={{ marginLeft: "2px" }} />
              </span>
            </div>
          )}
        </button>
      )}

      {url && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "6px 8px",
            background: "linear-gradient(to top, rgba(15,23,42,0.75), rgba(15,23,42,0))",
            pointerEvents: "none",
          }}
        >
          <span
            style={{
              fontSize: "12px",
              fontWeight: 500,
              color: "#ffffff",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: 1,
              textShadow: "0 1px 2px rgba(0,0,0,0.6)",
            }}
            title={url}
          >
            {displayTitle}
          </span>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onPointerDown={(e) => e.stopPropagation()}
            title="Open in new tab"
            style={{ flexShrink: 0, display: "flex", pointerEvents: "auto" }}
          >
            <ExternalLink size={13} color="#ffffff" />
          </a>
        </div>
      )}

      {isSelected && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            padding: "6px 8px",
            backgroundColor: "rgba(255, 255, 255, 0.95)",
            borderBottom: "1px solid #e2e8f0",
          }}
        >
          <input
            type="text"
            placeholder="Link Title (optional)"
            value={title}
            onChange={(e) => onChange({ title: e.target.value })}
            style={{
              width: "100%",
              padding: "2px 6px",
              fontSize: "11px",
              borderRadius: "4px",
              border: "1px solid #cbd5e1",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          <input
            type="text"
            placeholder="URL (https://...)"
            value={url}
            onChange={(e) => {
              const nextUrl = e.target.value;
              const hostname = deriveHostname(nextUrl);
              onChange({
                url: nextUrl,
                faviconUrl: hostname ? `https://www.google.com/s2/favicons?domain=${hostname}&sz=32` : undefined,
                previewImageUrl: undefined,
                previewDescription: undefined,
              });
              setActivated(false);
            }}
            style={{
              width: "100%",
              padding: "2px 6px",
              fontSize: "11px",
              borderRadius: "4px",
              border: "1px solid #cbd5e1",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>
      )}
    </div>
  );
};

registerBlockRenderer("link", LinkBlock);
