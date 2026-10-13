// Converts the markdown an AI naturally writes into the HTML subset the doc
// editor stores: headings (h1-h3), lists, checklists, quotes, tables, images.
function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inline(value: string): string {
  return escapeText(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/~~([^~]+)~~/g, "<s>$1</s>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt: string, url: string) => `<img src="${safeUrl(url)}" alt="${alt}">`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, url: string) => `<a href="${safeUrl(url)}">${label}</a>`);
}

function tableHtml(rows: string[][]): string {
  const cell = (tag: string, value: string) => `<${tag}><p>${inline(value)}</p></${tag}>`;
  const [head, ...body] = rows;
  return `<table><tbody><tr>${head.map((value) => cell("th", value)).join("")}</tr>${body.map((row) => `<tr>${row.map((value) => cell("td", value)).join("")}</tr>`).join("")}</tbody></table>`;
}

const splitRow = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((part) => part.trim());

const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const HR_RE = /^([-*_])(?:\s*\1){2,}$/;
const FENCE_RE = /^```/;
const PARAGRAPH_STOP = /^(#{1,6}\s|[-*+]\s|\d+[.)]\s|>|\||```)/;

type ListItem = { indent: number; kind: "ul" | "ol" | "task"; number: number; checked: boolean; content: string };

function parseListItem(line: string): ListItem | null {
  const match = LIST_RE.exec(line.replace(/\t/g, "    "));
  if (!match || HR_RE.test(line.trim())) return null;
  const ordered = /^\d/.test(match[2]);
  const task = ordered ? null : /^\[([ xX])\]\s+(.*)$/.exec(match[3]);
  return {
    indent: match[1].length,
    kind: ordered ? "ol" : task ? "task" : "ul",
    number: ordered ? parseInt(match[2], 10) : 1,
    checked: task ? task[1] !== " " : false,
    content: task ? task[2] : match[3],
  };
}

function renderList(items: ListItem[], from: number, indent: number): [string, number] {
  const first = items[from];
  let index = from;
  let html = "";
  while (index < items.length && items[index].indent >= indent && items[index].kind === first.kind) {
    const item = items[index];
    index += 1;
    let nested = "";
    while (index < items.length && items[index].indent > item.indent) {
      const [childHtml, next] = renderList(items, index, items[index].indent);
      nested += childHtml;
      index = next;
    }
    const attrs = item.kind === "task" ? ` data-type="taskItem" data-checked="${item.checked}"` : "";
    html += `<li${attrs}><p>${inline(item.content)}</p>${nested}</li>`;
  }
  const open = first.kind === "task" ? '<ul data-type="taskList">' : first.kind === "ol" ? (first.number !== 1 ? `<ol start="${first.number}">` : "<ol>") : "<ul>";
  return [`${open}${html}</${first.kind === "ol" ? "ol" : "ul"}>`, index];
}

/** Joins paragraph lines: a hard break only after two trailing spaces or a backslash. */
function joinParagraph(lines: string[]): string {
  return lines.map((line, position) => {
    const hard = position < lines.length - 1 && (/ {2,}$/.test(line) || /\\$/.test(line));
    const content = line.trim().replace(/\\$/, "").trim();
    return `${inline(content)}${position < lines.length - 1 ? (hard ? "<br>" : " ") : ""}`;
  }).join("");
}

/** Keeps a markdown link target inside its attribute: no quotes or angle brackets, and no script-like schemes. */
function safeUrl(url: string): string {
  const cleaned = url.replace(/["'<>`]/g, (char) => encodeURIComponent(char));
  return /^\s*(javascript|data|vbscript):/i.test(cleaned) ? "#" : cleaned;
}

export function markdownToDocHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) { index += 1; continue; }
    if (FENCE_RE.test(trimmed)) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !FENCE_RE.test(lines[index].trim())) { code.push(lines[index]); index += 1; }
      index += 1;
      out.push(`<pre><code>${escapeText(code.join("\n"))}</code></pre>`); continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      const level = Math.min(3, heading[1].length);
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`); index += 1; continue;
    }
    if (/^\|.*\|$/.test(trimmed) && /^\|?\s*:?-{2,}/.test((lines[index + 1] ?? "").trim())) {
      const rows = [splitRow(trimmed)];
      index += 2;
      while (index < lines.length && /^\|.*\|$/.test(lines[index].trim())) { rows.push(splitRow(lines[index])); index += 1; }
      out.push(tableHtml(rows)); continue;
    }
    if (HR_RE.test(trimmed)) { out.push("<hr>"); index += 1; continue; }
    if (parseListItem(line)) {
      const items: ListItem[] = [];
      for (let item = parseListItem(lines[index] ?? ""); item; item = parseListItem(lines[index] ?? "")) { items.push(item); index += 1; }
      for (let position = 0; position < items.length;) {
        const [html, next] = renderList(items, position, items[position].indent);
        out.push(html);
        position = next;
      }
      continue;
    }
    if (trimmed.startsWith(">")) {
      const paragraphs: string[][] = [[]];
      while (index < lines.length && lines[index].trim().startsWith(">")) {
        const content = lines[index].trim().replace(/^>\s?/, "").trim();
        if (content) paragraphs[paragraphs.length - 1].push(content);
        else if (paragraphs[paragraphs.length - 1].length) paragraphs.push([]);
        index += 1;
      }
      const body = paragraphs.filter((part) => part.length).map((part) => `<p>${part.map(inline).join("<br>")}</p>`).join("");
      out.push(`<blockquote>${body}</blockquote>`); continue;
    }
    const image = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(trimmed);
    if (image) { out.push(`<img src="${image[2]}" alt="${escapeText(image[1])}">`); index += 1; continue; }
    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !PARAGRAPH_STOP.test(lines[index].trim()) && !HR_RE.test(lines[index].trim())) { paragraph.push(lines[index]); index += 1; }
    if (paragraph.length === 0) { paragraph.push(line); index += 1; }
    out.push(`<p>${joinParagraph(paragraph)}</p>`);
  }
  return out.join("");
}

export function looksLikeHtml(value: string): boolean {
  return /<\/?(p|h[1-4]|ul|ol|li|blockquote|table|div|img|strong|em|hr|pre)\b/i.test(value);
}

/** A long article needs a taller, wider doc block than the 360x420 default. */
export function docDefaultSize(html: string): [number, number] {
  if (html.length < 1500) return [360, 420];
  return [520, Math.min(1600, 420 + Math.round((html.length - 1500) / 3))];
}
