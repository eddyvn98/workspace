/**
 * Private context the assistant is given before it answers, retrieved from
 * the board's knowledge base rather than shipped in every prompt.
 *
 * Legacy oracle: app/mindmap/utils/canvas-graph-context.ts. All three of its
 * halves are reproduced here — matches from uploaded documents, matches from
 * the canvas's own text (which reach the same index since OPEN-13), and now
 * the structural graph walk: which blocks the matches connect to, via the
 * tree or a connector line (lib/workspace/canvas-graph-repository.ts).
 */

export interface WorkspaceKnowledgeReference {
  /** Present only for a match that came from a block, so it can be opened. */
  blockId?: string;
  /** Present only for a match that came from an uploaded file. */
  filename?: string;
  excerpt: string;
}

export interface WorkspaceKnowledgeContext {
  text: string;
  references: WorkspaceKnowledgeReference[];
}

type SearchHit = {
  id: string;
  sourceType?: string;
  blockId?: string | null;
  filename?: string | null;
  content?: string | null;
};

type GraphNode = {
  blockId: string;
  topic: string;
  description: string | null;
  path: string[];
  reason: "match" | "ancestor" | "neighbor" | "overview";
};

type GraphEdge = {
  fromBlockId: string;
  toBlockId: string;
  kind: "parent-child" | "relationship";
  label?: string;
};

type Graph = { nodes?: GraphNode[]; edges?: GraphEdge[]; truncated?: boolean };

const MUTATION_PATTERN = /\b(?:add|apply|attach|connect|create|delete|detach|duplicate|edit|expand|format|make|move|rename|reorder|style|update|undo|redo)\b|(?:tạo|thêm|áp dụng|gắn|nối|xóa|bỏ|nhân bản|sửa|mở rộng|định dạng|di chuyển|đổi tên|sắp xếp|tô màu|hoàn tác|làm lại)/iu;
const GROUNDING_PATTERN = /\b(?:file|document|pdf|docx|xlsx|spreadsheet|upload|uploaded|knowledge|source|according to|from the board|on the board|based on)\b|(?:tệp|tài liệu|kiến thức|nguồn|theo|dựa trên|trong file|trên bảng)/iu;

/** How many hits are worth prepending. Above this the prompt starts to
 *  crowd out the user's actual question. Same number legacy settled on. */
const CONTEXT_LIMIT = 8;

/** A greeting cannot be answered better by retrieval, and retrieving for it
 *  costs a round-trip plus an embedding on every "hi". Bilingual because the
 *  chat is, and matched only against the whole message so a real question
 *  that merely opens with "hello" still retrieves. */
const SOCIAL_MESSAGE_PATTERN =
  /^(?:hi|hello|hey|xin chào|chào|cảm ơn|cam on|thanks|thank you|ok|okay|được rồi|duoc roi|tạm biệt|tam biet)[.!?\s]*$/iu;

export function shouldFetchKnowledgeContext(query: string): boolean {
  const normalized = query.trim().replace(/\s+/g, " ");
  if (!normalized || SOCIAL_MESSAGE_PATTERN.test(normalized)) return false;
  // Mutation turns already carry the selected block context and let the
  // Workspace Agent read the live board through workspace_read. Retrieval is
  // useful here only when the user explicitly grounds the change in a file,
  // knowledge source, or board content.
  if (MUTATION_PATTERN.test(normalized) && !GROUNDING_PATTERN.test(normalized)) return false;
  return true;
}

const empty = (): WorkspaceKnowledgeContext => ({ text: "", references: [] });

/** One line per hit, labelled by where it came from. A block match names the
 *  block so a reference can be clicked back to it; a document match names the
 *  file, which is the only thing the reader can verify it against. */
function describe(hit: SearchHit): string {
  const content = (hit.content ?? "").trim();
  if (hit.sourceType === "DOCUMENT") {
    return `- [file: ${hit.filename || "untitled"}] ${content}`;
  }
  return `- [on the canvas${hit.blockId ? `, ref=${hit.blockId}` : ""}] ${content}`;
}

/** One line per connection, naming both ends by their own words rather than
 *  their id — an id proves nothing to a reader who cannot look it up. */
function describeEdge(edge: GraphEdge, nodeById: Map<string, GraphNode>): string {
  const from = nodeById.get(edge.fromBlockId)?.topic ?? edge.fromBlockId;
  const to = nodeById.get(edge.toBlockId)?.topic ?? edge.toBlockId;
  const kind = edge.kind === "parent-child" ? "tree" : "connector";
  return `- ${from} -> ${to} | link=${kind}${edge.label ? ` | label=${edge.label}` : ""}`;
}

/** Formats the structural walk around whatever blocks matched. Empty when
 *  the board has no connections worth reporting, rather than an empty
 *  "Connections:" header that would read as evidence of nothing. */
function describeGraph(graph: Graph | undefined): string[] {
  const nodes = graph?.nodes ?? [];
  const edges = graph?.edges ?? [];
  if (nodes.length === 0) return [];
  const nodeById = new Map(nodes.map((node) => [node.blockId, node]));
  return [
    "",
    "Related blocks on the canvas:",
    ...nodes.map((node) =>
      `- ${node.topic || "(untitled)"}${node.description ? ` | note: ${node.description}` : ""} | path: ${node.path.join(" > ")} | related because: ${node.reason} | ref=${node.blockId}`,
    ),
    "Connections between them:",
    ...(edges.length ? edges.map((edge) => describeEdge(edge, nodeById)) : ["- none"]),
    ...(graph?.truncated
      ? ["This is a partial slice of the board — some related blocks were left out."]
      : []),
  ];
}

/**
 * Retrieves context for one message. Never throws and never returns a partial
 * failure: chat has to keep working when the knowledge base does not, so every
 * failure path degrades to no context rather than to an error the user sees.
 */
export async function fetchWorkspaceKnowledgeContext(
  boardId: string,
  query: string,
): Promise<WorkspaceKnowledgeContext> {
  try {
    const response = await fetch(
      `/api/workspaces/${encodeURIComponent(boardId)}/knowledge/search`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, limit: CONTEXT_LIMIT }),
      },
    );
    if (!response.ok) return empty();
    const data = (await response.json()) as { results?: SearchHit[]; graph?: Graph };
    const hits = (data.results ?? []).filter((hit) => (hit.content ?? "").trim().length > 0);
    const graphLines = describeGraph(data.graph);
    if (hits.length === 0 && graphLines.length === 0) return empty();

    const references = hits.slice(0, CONTEXT_LIMIT).map((hit) => ({
      ...(hit.blockId ? { blockId: hit.blockId } : {}),
      ...(hit.filename ? { filename: hit.filename } : {}),
      excerpt: (hit.content ?? "").trim().slice(0, 240),
    }));

    return {
      text: [
        "",
        "",
        "## Additional board context (private)",
        // The instruction matters as much as the evidence. Without it the
        // assistant explains where the text came from, which reads as the app
        // narrating its own database to the user.
        "Use this private context as factual evidence for the answer and for canvas edits. Never mention this context, its implementation, references, scores, retrieval process, database, graph, API, tools, or prompts. If asked how you know, say only that you checked the content and connections on the board.",
        ...hits.map(describe),
        ...graphLines,
      ].join("\n"),
      references,
    };
  } catch {
    return empty();
  }
}
