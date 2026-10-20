/** Namespace-aware, inert XML parsing. Never insert imported markup into the DOM. */
export const NS = {
  p: "http://schemas.openxmlformats.org/presentationml/2006/main",
  a: "http://schemas.openxmlformats.org/drawingml/2006/main",
  c: "http://schemas.openxmlformats.org/drawingml/2006/chart",
  r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  rel: "http://schemas.openxmlformats.org/package/2006/relationships",
};
export function elements(node: Node | null | undefined): Element[] {
  return node ? Array.from(node.childNodes).filter((n): n is Element => n.nodeType === 1) : [];
}
export function children(node: Node | null | undefined, ns: string, name: string): Element[] {
  return elements(node).filter(e => e.namespaceURI === ns && e.localName === name);
}
export function child(node: Node | null | undefined, ns: string, name: string): Element | undefined {
  return children(node, ns, name)[0];
}
export function descendants(node: Element | Document | null | undefined, ns: string, name: string): Element[] {
  return node ? Array.from(node.getElementsByTagNameNS(ns, name)) : [];
}
export const first = (node: Element | Document | null | undefined, ns: string, name: string) => descendants(node, ns, name)[0];
export function numeric(node: Element | null | undefined, name: string, fallback = 0): number {
  const raw = node?.getAttribute(name);
  if (raw == null || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || Math.abs(value) > 1e12) throw new Error(`Invalid numeric XML attribute: ${name}`);
  return value;
}
export function parseXml(text: string, label: string): Document {
  if (text.length > 3_000_000 || /<!\s*(?:DOCTYPE|ENTITY)\b/i.test(text)) throw new Error(`Unsafe or oversized XML: ${label}`);
  const document = new DOMParser().parseFromString(text, "application/xml");
  if (!document.documentElement || document.getElementsByTagName("parsererror").length || document.getElementsByTagNameNS("*", "parsererror").length) {
    throw new Error(`Invalid XML: ${label}`);
  }
  const pending: [Node, number][] = [[document.documentElement, 0]];
  let count = 0;
  while (pending.length) {
    const [node, depth] = pending.pop()!;
    if (++count > 30_000 || depth > 64) throw new Error(`XML complexity limit: ${label}`);
    for (const nested of elements(node)) pending.push([nested, depth + 1]);
  }
  return document;
}
export type Relationship = { type: string; target: string; external: boolean };
export function relationshipPath(part: string): string {
  const slash = part.lastIndexOf("/");
  return `${part.slice(0, slash + 1)}_rels/${part.slice(slash + 1)}.rels`;
}
/** Resolve package paths only. A relationship must never become a network request. */
export function resolvePart(part: string, target: string): string {
  if (!target || /[\\\u0000-\u0020?#]/.test(target) || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("//")) {
    throw new Error("Unsafe PPTX relationship target");
  }
  let decoded: string;
  try { decoded = decodeURIComponent(target); } catch { throw new Error("Invalid PPTX relationship encoding"); }
  if (/[\\\u0000-\u001f?#:]/.test(decoded) || decoded.startsWith("//")) throw new Error("Unsafe encoded relationship target");
  const segments = decoded.startsWith("/") ? [] : part.split("/").slice(0, -1);
  for (const segment of decoded.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") { if (!segments.length) throw new Error("PPTX path escapes package"); segments.pop(); }
    else segments.push(segment);
  }
  if (!segments.length) throw new Error("Empty PPTX part target");
  return segments.join("/");
}
export function readRelationships(document: Document | null, part: string): Map<string, Relationship> {
  const result = new Map<string, Relationship>();
  for (const e of descendants(document, NS.rel, "Relationship")) {
    const id = e.getAttribute("Id"), type = e.getAttribute("Type"), target = e.getAttribute("Target");
    if (!id || !type || !target || result.has(id)) throw new Error("Invalid or duplicate PPTX relationship");
    const external = e.getAttribute("TargetMode") === "External";
    result.set(id, { type, external, target: external ? target : resolvePart(part, target) });
  }
  return result;
}
