import React from "react";
import { normalizeBlockLink } from "./link";

const URL_PATTERN = /(https?:\/\/[^\s<]+|www\.[^\s<]+|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s<]*)?)/gi;

function splitLinkSuffix(value: string) {
  const match = value.match(/[.,!?;:]+$/);
  const suffix = match?.[0] ?? "";
  return { value: suffix ? value.slice(0, -suffix.length) : value, suffix };
}

function renderLinks(text: string, keyGen: { key: number }): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  URL_PATTERN.lastIndex = 0;

  while ((match = URL_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const link = splitLinkSuffix(match[0]);
    const href = normalizeBlockLink(link.value);
    if (!href) {
      nodes.push(match[0]);
    } else {
      nodes.push(
        <a
          key={`link-${keyGen.key++}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => event.stopPropagation()}
          style={{ textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: "2px" }}
        >
          {link.value}
        </a>,
      );
      if (link.suffix) nodes.push(link.suffix);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function renderInline(
  text: string,
  keyGen: { key: number }
): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*|\*(.+?)\*|\+\+(.+?)\+\+|~~(.+?)~~/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(...renderLinks(text.slice(lastIndex, match.index), keyGen));
    }
    if (match[1] !== undefined) {
      nodes.push(<strong key={keyGen.key++}>{renderLinks(match[1], keyGen)}</strong>);
    } else if (match[2] !== undefined) {
      nodes.push(<em key={keyGen.key++}>{renderLinks(match[2], keyGen)}</em>);
    } else if (match[3] !== undefined) {
      nodes.push(<u key={keyGen.key++}>{renderLinks(match[3], keyGen)}</u>);
    } else if (match[4] !== undefined) {
      nodes.push(<del key={keyGen.key++}>{renderLinks(match[4], keyGen)}</del>);
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(...renderLinks(text.slice(lastIndex), keyGen));
  }

  return nodes;
}

/** Splits `**bold**` / `*italic*` / `++underline++` / `~~strikethrough~~` markdown
 *  and block-level lists (`- `, `1. `) and quotes (`> `) into styled spans/elements
 *  for a non-editing preview. Deliberately minimal — no nesting, no other marks.
 *  Shared by TextBlock.tsx and TableBlock.tsx / TableCell.tsx. */
export function renderMarkdownPreview(markdown: string): React.ReactNode[] {
  const lines = markdown.split("\n");
  const keyGen = { key: 0 };

  if (
    lines.length === 1 &&
    !lines[0].startsWith("- ") &&
    !/^\d+\.\s/.test(lines[0]) &&
    !lines[0].startsWith("> ")
  ) {
    return renderInline(markdown, keyGen);
  }

  const nodes: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const bulletMatch = /^-\s+(.*)$/.exec(line);
    const numberMatch = /^(\d+)\.\s+(.*)$/.exec(line);
    const quoteMatch = /^>\s?(.*)$/.exec(line);

    if (bulletMatch) {
      nodes.push(
        <div key={keyGen.key++} style={{ paddingLeft: "4px" }}>
          <span style={{ userSelect: "none", marginRight: "6px" }}>•</span>
          {renderInline(bulletMatch[1], keyGen)}
        </div>
      );
    } else if (numberMatch) {
      nodes.push(
        <div key={keyGen.key++} style={{ paddingLeft: "4px" }}>
          <span style={{ userSelect: "none", marginRight: "6px" }}>
            {numberMatch[1]}.
          </span>
          {renderInline(numberMatch[2], keyGen)}
        </div>
      );
    } else if (quoteMatch) {
      nodes.push(
        <blockquote
          key={keyGen.key++}
          style={{
            borderLeft: "3px solid #94a3b8",
            paddingLeft: "8px",
            margin: "2px 0",
            fontStyle: "italic",
            opacity: 0.9,
          }}
        >
          {renderInline(quoteMatch[1], keyGen)}
        </blockquote>
      );
    } else {
      nodes.push(
        <div key={keyGen.key++}>
          {line.length > 0 ? renderInline(line, keyGen) : <br />}
        </div>
      );
    }
  }

  return nodes;
}

export default renderMarkdownPreview;
