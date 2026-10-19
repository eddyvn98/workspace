// Minimal HTML parser for the doc editor's own output (and the sanitized HTML
// the agent writes). It keeps character offsets so edits can splice the stored
// string and leave every untouched byte (lineIds, embedded tables) intact.
export const VOID_TAGS = new Set(["br", "img", "hr", "col", "input"]);
const TAG_RE = /<(?:"[^"]*"|'[^']*'|[^'">])*>/g;

export interface HtmlNode {
  tag: string; // "#text" for text nodes
  attrs: string;
  start: number;
  end: number;
  innerStart: number;
  innerEnd: number;
  children: HtmlNode[];
  text?: string;
}

export function decodeText(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&#(?:x([\da-f]+)|(\d+));/gi, (_, hex, decimal) => {
      const code = Number.parseInt(hex ?? decimal, hex ? 16 : 10);
      return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '\ufffd';
    })
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
}

export function encodeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function attrValue(node: HtmlNode, name: string): string | undefined {
  const match = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(node.attrs);
  return match ? decodeText(match[1] ?? match[2] ?? "") : undefined;
}

export function parseHtml(html: string): HtmlNode[] {
  const root: HtmlNode = { tag: "#root", attrs: "", start: 0, end: html.length, innerStart: 0, innerEnd: html.length, children: [] };
  const stack: HtmlNode[] = [root];
  let last = 0;
  const flushText = (to: number) => {
    if (to > last) stack[stack.length - 1].children.push({ tag: "#text", attrs: "", start: last, end: to, innerStart: last, innerEnd: to, children: [], text: html.slice(last, to) });
  };
  for (const match of html.matchAll(TAG_RE)) {
    const name = /^<\/?\s*([a-zA-Z][\w-]*)/.exec(match[0])?.[1]?.toLowerCase();
    if (!name) continue;
    const at = match.index ?? 0;
    flushText(at);
    last = at + match[0].length;
    if (match[0].startsWith("</")) {
      let open = stack.length - 1;
      while (open > 0 && stack[open].tag !== name) open -= 1;
      if (open === 0) continue;
      while (stack.length - 1 > open) {
        const dangling = stack.pop()!;
        dangling.innerEnd = at; dangling.end = at;
      }
      const node = stack.pop()!;
      node.innerEnd = at; node.end = last;
      continue;
    }
    const node: HtmlNode = {
      tag: name, attrs: match[0].replace(/^<\s*[\w-]+/, "").replace(/\/?>$/, ""),
      start: at, end: last, innerStart: last, innerEnd: last, children: [],
    };
    stack[stack.length - 1].children.push(node);
    if (!VOID_TAGS.has(name) && !match[0].endsWith("/>")) stack.push(node);
  }
  flushText(html.length);
  while (stack.length > 1) {
    const dangling = stack.pop()!;
    dangling.innerEnd = html.length; dangling.end = html.length;
  }
  return root.children;
}

export function walkNodes(nodes: HtmlNode[], visit: (node: HtmlNode, parent: HtmlNode | null) => boolean | void, parent: HtmlNode | null = null): boolean {
  for (const node of nodes) {
    if (visit(node, parent) === true) return true;
    if (walkNodes(node.children, visit, node)) return true;
  }
  return false;
}

/** Plain text of a node (no markdown), used to match headings. */
export function nodeText(node: HtmlNode): string {
  if (node.tag === "#text") return decodeText(node.text ?? "");
  if (node.tag === "br") return " ";
  return node.children.map(nodeText).join("");
}
