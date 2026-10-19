import { attrValue, decodeText, nodeText, parseHtml, type HtmlNode } from '@/app/api/workspaces/[id]/agent/docHtmlParse';
import { workspaceDocExportBody } from './workspaceDocExportHtml';

const mdText = (value: string) => value.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/([\\`*_\[\]])/g, '\\$1');
const target = (value: string) => value.replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');

/** Readable Markdown with semantic lists, links, images and table data; JSON metadata supplies exact round-trip. */
export function workspaceDocToMarkdown(html: string, blocks: Record<string, { type?: unknown; data?: unknown }> = {}): string {
  const source = workspaceDocExportBody(html, blocks);
  const render = (node: HtmlNode, depth = 0): string => {
    const inner = () => node.children.map((child) => render(child, depth)).join('');
    switch (node.tag) {
      case '#text': return mdText(decodeText(node.text ?? ''));
      case 'br': return '  \n';
      case 'h1': case 'h2': case 'h3': return `\n\n${'#'.repeat(Number(node.tag[1]))} ${inner().trim()}\n\n`;
      case 'p': return `${inner().trim()}\n\n`;
      case 'strong': case 'b': return `**${inner()}**`;
      case 'em': case 'i': return `*${inner()}*`;
      case 's': case 'del': return `~~${inner()}~~`;
      case 'u': case 'mark': case 'sub': case 'sup': return `<${node.tag}>${inner()}</${node.tag}>`;
      case 'code': return `\`${nodeText(node).replace(/`/g, '\\`')}\``;
      case 'pre': {
        const text = nodeText(node), fence = '`'.repeat(Math.max(3, ...(text.match(/`+/g) ?? []).map((match) => match.length + 1)));
        const lang = node.children.find((child) => child.tag === 'code');
        return `\n\n${fence}${lang ? (attrValue(lang, 'class') ?? '').replace(/^language-/, '') : ''}\n${text}\n${fence}\n\n`;
      }
      case 'a': {
        const href = attrValue(node, 'href');
        return href ? `[${inner().trim()}](${target(href)})` : inner();
      }
      case 'img': {
        const src = attrValue(node, 'src');
        return src ? `![${mdText(attrValue(node, 'alt') ?? 'Image')}](${target(src)})` : '';
      }
      case 'figure': return `\n\n${inner().trim()}\n\n`;
      case 'figcaption': return `\n\n_${inner().trim()}_\n\n`;
      case 'blockquote': return `\n\n${inner().trim().split('\n').map((line) => `> ${line}`).join('\n')}\n\n`;
      case 'hr': return '\n\n---\n\n';
      case 'ul': case 'ol': {
        const start = Number(attrValue(node, 'start')) || 1;
        return '\n' + node.children.filter((child) => child.tag === 'li').map((child, index) => {
          const marker = attrValue(child, 'data-type') === 'taskItem' ? `- [${attrValue(child, 'data-checked') === 'true' ? 'x' : ' '}]` : node.tag === 'ol' ? `${start + index}.` : '-';
          const content = child.children.map((part) => render(part, depth + 1)).join('').trim().replace(/\n{3,}/g, '\n\n');
          return `${marker} ${content.replace(/\n/g, '\n' + ' '.repeat(marker.length + 1))}`;
        }).join('\n') + '\n\n';
      }
      case 'table': {
        // Markdown has no merged cells. Preserve semantic HTML for those tables.
        if (/\b(?:colspan|rowspan)="(?:[2-9]|\d\d)/.test(source.slice(node.start, node.end))) return `\n\n${source.slice(node.start, node.end)}\n\n`;
        const rows: HtmlNode[] = [];
        const visit = (part: HtmlNode) => { if (part.tag === 'tr') rows.push(part); else part.children.forEach(visit); };
        node.children.forEach(visit);
        const cells = rows.map((row) => row.children.filter((cell) => ['td', 'th'].includes(cell.tag)).map((cell) => render(cell).trim().replace(/\n+/g, '<br>').replace(/\|/g, '\\|')));
        const count = Math.max(0, ...cells.map((row) => row.length));
        if (!count) return '';
        const line = (row: string[]) => `| ${Array.from({ length: count }, (_, i) => row[i] ?? '').join(' | ')} |`;
        return `\n\n${line(cells[0])}\n${line(Array(count).fill('---'))}\n${cells.slice(1).map(line).join('\n')}\n\n`;
      }
      default: return inner();
    }
  };
  return parseHtml(source).map((node) => render(node)).join('').replace(/\n{3,}/g, '\n\n').trim();
}
