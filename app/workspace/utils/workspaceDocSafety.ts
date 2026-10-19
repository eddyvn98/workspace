import { safeDocImageUrl as docImageUrl } from './docImageAttributes';

/** Values supported by the document schema; never accepts resource-loading CSS. */
export function safeDocColor(value: string): boolean {
  const color = value.trim();
  if (/^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(color)) return true;
  if (/^(?:black|white|red|green|blue|yellow|orange|purple|gray|grey|transparent|inherit|currentcolor)$/i.test(color)) return true;
  const rgb = /^rgba?\(\s*([\d.]+)(%?)\s*,\s*([\d.]+)(%?)\s*,\s*([\d.]+)(%?)(?:\s*,\s*([\d.]+))?\s*\)$/i.exec(color);
  return Boolean(rgb && [1, 3, 5].every((i) => Number(rgb[i]) <= (rgb[i + 1] ? 100 : 255))
    && (rgb[7] === undefined || Number(rgb[7]) <= 1));
}

export function safeDocLength(value: string, max = 10000): boolean {
  const match = /^(\d+(?:\.\d+)?)(px|pt|em|rem|%)$/i.exec(value);
  return Boolean(match && Number(match[1]) > 0 && Number(match[1]) <= (match[2] === '%' ? 100 : max));
}

const TEXT_BLOCKS = new Set(['p', 'h1', 'h2', 'h3', 'li', 'blockquote']);
const TABLE_PARTS = new Set(['table', 'th', 'td', 'col']);

export function sanitizeDocStyle(value: string, tag: string): string {
  const kept: string[] = [];
  for (const declaration of value.split(';')) {
    const colon = declaration.indexOf(':');
    if (colon < 0) continue;
    const name = declaration.slice(0, colon).trim().toLowerCase();
    const raw = declaration.slice(colon + 1).trim();
    const text = name === 'font-family' ? raw : raw.toLowerCase();
    if (!text || text.length > 180 || /[\\<>@{}]|url\s*\(|var\s*\(|expression|\/\*/i.test(text)) continue;
    let valid = false;
    if (name === 'text-align' && (TEXT_BLOCKS.has(tag) || ['td', 'th'].includes(tag))) valid = /^(left|center|right|justify)$/.test(text);
    if (name === 'line-height' && (TEXT_BLOCKS.has(tag) || tag === 'span')) valid = /^(?:[1-3](?:\.\d{1,3})?|normal)$/.test(text);
    if (name === 'color' && ['span', 'mark', 'td', 'th'].includes(tag)) valid = safeDocColor(text);
    if (name === 'background-color' && ['span', 'mark', 'td', 'th'].includes(tag)) valid = safeDocColor(text);
    if (name === 'font-size' && ['span', 'td', 'th'].includes(tag)) valid = safeDocLength(text, 144);
    if (name === 'font-family' && tag === 'span') valid = /^[\p{L}\p{N}\s,'"-]+$/u.test(text);
    if (name === 'font-weight' && tag === 'span') valid = /^(?:normal|bold|[1-9]00)$/.test(text);
    if (name === 'font-style' && tag === 'span') valid = /^(normal|italic)$/.test(text);
    if (name === 'text-decoration' && tag === 'span') valid = /^(underline|line-through)( (underline|line-through))?$/.test(text);
    if (['width', 'min-width', 'max-width'].includes(name) && TABLE_PARTS.has(tag)) valid = safeDocLength(text);
    if (name === 'vertical-align' && ['td', 'th'].includes(tag)) valid = /^(top|middle|bottom)$/.test(text);
    if (valid) kept.push(`${name}: ${text}`);
  }
  return kept.join('; ');
}

export function safeDocImageUrl(value: string): boolean {
  return docImageUrl(value) !== null;
}
