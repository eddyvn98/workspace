"use client";
import { emptySlideScene, normalizeSlideScene, type SlideScene } from "../types/slideScene";

/** Best-effort import. Rich HTML is preserved separately for lossless fallback. */
export function legacyHtmlToScene(html: string, ratio: "16:9" | "4:3" = "16:9"): SlideScene {
  const base = emptySlideScene(ratio);
  if (!html.trim() || typeof DOMParser === "undefined") return base;
  const document = new DOMParser().parseFromString(html, "text/html");
  const objects: SlideScene["objects"] = [];
  let y = 70;
  const width = base.width;
  const maxY = base.height - 35;
  const nodes = Array.from(document.body.querySelectorAll("h1,h2,h3,p,li,img,blockquote"));
  for (const node of nodes) {
    if (objects.length >= 60 || y >= maxY) break;
    if (node.closest("li") && node.tagName !== "LI") continue;
    if (node.closest("blockquote") && node.tagName !== "BLOCKQUOTE") continue;
    if (node.closest("table")) continue; // Table source is retained as HTML backup.
    const tag = node.tagName.toLowerCase();
    if (tag === "img") {
      const src = node.getAttribute("src") || "";
      if (!/^(https?:\/\/|\/(?!\/))/i.test(src)) continue;
      const height = Math.min(310, maxY - y);
      objects.push({id:crypto.randomUUID(),kind:"image",src,x:92,y,w:width-184,h:height,rotation:0});
      y += height+24;
      continue;
    }
    const text = (node.textContent || "").replace(/\s+/g," ").trim();
    if (!text || (node.querySelector("img") && !text)) continue;
    const heading = tag.startsWith("h");
    const size = tag === "h1" ? 62 : tag === "h2" ? 48 : tag === "h3" ? 36 : 28;
    const lines = Math.max(1,Math.ceil(text.length/(heading?36:68)));
    const height = Math.min(maxY-y,Math.max(58,lines*size*1.25));
    if (height < 20) break;
    objects.push({id:crypto.randomUUID(),kind:"text",x:92,y,w:width-184,h:height,rotation:0,
      text:tag==="li" ? "• "+text : text,fontSize:size,fontWeight:heading?"bold":"normal",color:"#0f172a",fontFamily:"Arial"});
    y += height+18;
  }
  return normalizeSlideScene({...base,objects},ratio) ?? base;
}
