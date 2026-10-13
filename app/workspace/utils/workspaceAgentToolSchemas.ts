/**
 * app/workspace/utils/workspaceAgentToolSchemas.ts
 *
 * JSON-Schema `tools[]` translation of the prose action vocabulary in
 * workspaceChatActionSchemaInstruction.ts, for native function-calling
 * (DeepSeek/OpenAI-compatible `tools` param) instead of asking the model to
 * hand-write a ```workspace-actions block. Every tool name/shape here must
 * stay in lockstep with what workspaceChatLegacyActions.ts /
 * workspaceChatExtendedActions.ts actually accept — this is the schema half,
 * the appliers are the reality half; a mismatch here reproduces the exact
 * "looks fine, does less" bug class already found in the prose version.
 */

const TARGET_SCHEMA = {
  type: "object",
  description:
    "Which block(s) this applies to. Omit only for create_map/undo/redo.",
  properties: {
    mode: { type: "string", enum: ["selected", "id", "topic"] },
    id: { type: "string", description: "Exact block id from the private canvas context — never invent one." },
    topic: { type: "string", description: "Exact block text or ancestor path separated by >." },
  },
  required: ["mode"],
} as const;

const STYLE_SCHEMA = {
  type: "object",
  description: "Every field the toolbar's own style menu can set. Omit a field to leave it unchanged.",
  properties: {
    backgroundColor: { type: "string" },
    backgroundOpacity: { type: "number", minimum: 0, maximum: 100 },
    borderColor: { type: "string" },
    borderWidth: { type: "number", enum: [1, 1.5, 2, 3] },
    borderDash: { type: "string", enum: ["solid", "dashed", "dotted"] },
    textColor: { type: "string" },
    shapeKind: {
      type: "string",
      enum: ["rectangle", "rounded", "rounded_rect", "box", "ellipse", "oval", "circle", "diamond", "triangle", "hexagon", "star", "pill", "parallelogram"],
    },
    flipH: { type: "boolean" },
    flipV: { type: "boolean" },
  },
} as const;

const NODE_DRAFT_SCHEMA = {
  type: "object",
  properties: {
    topic: { type: "string" },
    description: { type: "string" },
    icon: { type: "string", description: "A single emoji." },
    image: { type: "string", description: "Image URL." },
    style: STYLE_SCHEMA,
    table: {
      type: "object",
      description: "Set this to make the new block a TABLE instead of a text block — the only way to create a brand-new table (there is no standalone create_table tool; existing table_* tools only edit a table that already exists).",
      properties: {
        rows: { type: "integer", minimum: 1, maximum: 20 },
        cols: { type: "integer", minimum: 1, maximum: 20 },
        cells: { type: "array", items: { type: "array", items: { type: "string" } }, description: "cells[row][col] text, row-major, matching rows x cols." },
      },
      required: ["rows", "cols", "cells"],
    },
    children: { type: "array", items: { type: "object" }, description: "Nested child drafts, same shape." },
  },
  required: ["topic"],
} as const;

const DIAGRAM_NODE_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string", description: "Stable semantic key used only by the edges; do not use a canvas UUID." },
    label: { type: "string" },
    role: { type: "string", enum: ["terminator", "process", "decision", "data", "storage", "preparation"] },
    description: { type: "string" },
    laneId: { type: "string", description: "Swimlane id for create_swimlane." },
  },
  required: ["id", "label"],
} as const;

const DIAGRAM_EDGE_SCHEMA = {
  type: "object",
  properties: {
    from: { type: "string", description: "Semantic node id from nodes[].id." },
    to: { type: "string", description: "Semantic node id from nodes[].id." },
    label: { type: "string", description: "Branch/relationship label, e.g. Yes or No." },
  },
  required: ["from", "to"],
} as const;

const FLOWCHART_EXTENSION_EDGE_SCHEMA = {
  type: "object",
  properties: {
    from: { type: "string", description: "Existing block id/exact label from the canvas, or a new nodes[].id." },
    to: { type: "string", description: "Existing block id/exact label from the canvas, or a new nodes[].id." },
    label: { type: "string", description: "Branch/relationship label, e.g. Yes or No." },
  },
  required: ["from", "to"],
} as const;

function fn(name: string, description: string, properties: Record<string, unknown>, required: string[]) {
  return {
    type: "function" as const,
    function: {
      name,
      description,
      parameters: { type: "object", properties, required },
    },
  };
}

export function getWorkspaceAgentToolSchemas() {
  return [
    fn("rename_topic", "Rename/retext one existing block. Include description too if that block already has one.", {
      target: TARGET_SCHEMA,
      nodes: { type: "array", items: { type: "object", properties: { topic: { type: "string" }, description: { type: "string" } }, required: ["topic"] } },
    }, ["target", "nodes"]),

    fn("update_description", "Change only the description of an existing block, title unchanged.", {
      target: TARGET_SCHEMA,
      nodes: { type: "array", items: { type: "object", properties: { description: { type: "string" } }, required: ["description"] } },
    }, ["target", "nodes"]),

    fn("update_style", "Change visual style fields on one or more blocks. target.mode=selected applies to every currently-selected block at once.", {
      target: TARGET_SCHEMA,
      style: STYLE_SCHEMA,
    }, ["target", "style"]),

    fn("move_node", "Detach a block from its tree parent.", { target: TARGET_SCHEMA }, ["target"]),

    fn("attach_to_parent", "Attach one or more EXISTING blocks as children of a different EXISTING block (merge a branch/map into another node). Moves the block(s) and their whole subtree; does not create anything new.", {
      target: { ...TARGET_SCHEMA, description: "The existing block(s) to move. allowMultiple applies when mode=selected." },
      newParent: TARGET_SCHEMA,
    }, ["target", "newParent"]),

    fn("add_child", "Add new block(s) as children under an existing block.", {
      target: TARGET_SCHEMA,
      nodes: { type: "array", items: NODE_DRAFT_SCHEMA },
    }, ["target", "nodes"]),

    fn("add_sibling", "Add new block(s) as siblings after an existing block.", {
      target: TARGET_SCHEMA,
      nodes: { type: "array", items: NODE_DRAFT_SCHEMA },
    }, ["target", "nodes"]),

    fn("delete_node", "Delete the target block and its whole subtree.", { target: TARGET_SCHEMA }, ["target"]),

    fn("duplicate_node", "Duplicate the target block (and its subtree) under the same map.", { target: TARGET_SCHEMA }, ["target"]),

    fn("duplicate_map", "Copy the target block and its entire subtree into a new independent freestanding map. Keep the original branch unchanged; never delete, detach, or move the source.", { target: TARGET_SCHEMA }, ["target"]),

    fn("update_image", "Set/replace the image on an existing block.", {
      target: TARGET_SCHEMA,
      nodes: { type: "array", items: { type: "object", properties: { image: { type: "string" } }, required: ["image"] } },
    }, ["target", "nodes"]),

    fn("update_icon", "Set/replace the emoji icon on an existing block.", {
      target: TARGET_SCHEMA,
      nodes: { type: "array", items: { type: "object", properties: { icon: { type: "string" } }, required: ["icon"] } },
    }, ["target", "nodes"]),

    fn("connect_nodes", "Create a square/orthogonal connector between free-form blocks. Structured maps, flowcharts, and swimlanes use their own routing.", {
      from: TARGET_SCHEMA,
      to: TARGET_SCHEMA,
      connectionStyle: { type: "string", enum: ["orthogonal"] },
      arrowEnd: { type: "boolean", description: "Add an arrowhead without changing the orthogonal route." },
      lineLabel: { type: "string" },
      label: { type: "string", description: "Alias for lineLabel; use the exact user-requested connector label." },
      lineColor: { type: "string" },
      lineWidth: { type: "number" },
    }, ["from", "to"]),

    fn("update_relationship", "Edit fields on an existing connector between two blocks.", {
      from: TARGET_SCHEMA,
      to: TARGET_SCHEMA,
      relationshipPatch: {
        type: "object",
        properties: {
          lineLabel: { type: "string" },
          lineColor: { type: "string" },
          lineWidth: { type: "number" },
          lineDash: { type: "string", enum: ["solid", "dashed", "dotted"] },
          arrowStart: { type: "string", enum: ["none", "arrow"] },
          arrowEnd: { type: "string", enum: ["none", "arrow"] },
        },
      },
    }, ["from", "to", "relationshipPatch"]),

    fn("create_map", "Create one structured tree map from scratch. Use this for hierarchy, mindmap, org chart, catalog/outline, timeline, or fishbone intent. Put the complete parent/child structure in one nested nodes[] tree. Flowcharts/process graphs and swimlanes are separate diagram types and must use create_flowchart or create_swimlane. Only the hierarchy family accepts connectionStyle; other map families use fixed routing.", {
      nodes: { type: "array", items: NODE_DRAFT_SCHEMA },
      layoutType: { type: "string", enum: ["hierarchy", "treeview", "timeline", "fishbone", "logical-right", "logical-left", "mindmap", "mindmap-vertical", "org-chart", "catalog", "outline", "vertical-timeline"], description: "Structured map family named as in the editor: hierarchy, treeview, timeline, fishbone. Hierarchy takes growthMode (one-side|both-side) and layoutDirection (right|left|down|up); a mindmap is hierarchy both-side and an org chart is hierarchy down. catalog and outline are older names for treeview. Omit for hierarchy." },
      layoutDirection: { type: "string", enum: ["right", "left", "down", "up"] },
      growthMode: { type: "string", enum: ["one-side", "both-side"] },
      connectionStyle: { type: "string", enum: ["straight", "orthogonal", "curved", "straight_arrow"], description: "Hierarchy-only connector choice; ignored for other structured map families." },
      connectorPaletteId: { type: "string", enum: ["default", "pastel", "minimal", "monochrome", "vibrant"] },
      layoutAngle: { type: "number", minimum: -180, maximum: 180 },
      timelineBranchMode: { type: "string", enum: ["auto", "one-side", "one-side-reverse", "alternate"] },
      timelineDescendantStyle: { type: "string", enum: ["tree", "hierarchy"] },
      catalogDescendantStyle: { type: "string", enum: ["tree", "hierarchy"] },
    }, ["nodes"]),

    fn("create_flowchart", "Create a polished freestanding flowchart from semantic nodes and edges. Use this for any process flow, decision flow, login flow, workflow, or request that says flowchart. Treat the user's arrows as the source of truth: every named step is a node and every condition written on an arrow (for example 'OTP đúng' or 'OTP sai') is an edge label, not an extra node, unless the user explicitly says it is a step or asks a question that must branch. Do not invent decision nodes from condition labels. The engine chooses standard shapes from role, lays out ranks with safe spacing, uses orthogonal connectors with arrows, and labels decision branches. Do not provide pixel coordinates or call create_map/connect_nodes for the same diagram.", {
    direction: { type: "string", enum: ["down", "right"], description: "Primary flow direction; defaults to down." },
    nodes: { type: "array", items: DIAGRAM_NODE_SCHEMA, description: "Only actual steps/shapes named by the user. Do not turn an edge condition such as OTP đúng/OTP sai/Có/Không into a node unless it is explicitly requested as a step." },
    edges: { type: "array", items: DIAGRAM_EDGE_SCHEMA, description: "Semantic relationships referencing nodes[].id. Put branch conditions in edge.label; preserve the exact condition text." },
    graphJson: { type: "string", description: "Optional transport fallback: JSON string containing {nodes,edges} when the tool host cannot preserve nested arrays." },
    }, ["nodes", "edges"]),

    fn("extend_flowchart", "Extend ONE existing flowchart as a graph transaction. Use this when the user asks to add steps, branches, retries, loops, or continue an existing flowchart. The engine resolves existing nodes by exact canvas id or label, creates only genuinely new nodes, adds only missing edges, and re-layouts the complete flowchart with orthogonal routing. Do not use add_child/connect_nodes or create a second map for this operation.", {
      target: { ...TARGET_SCHEMA, description: "Existing block in the flowchart to extend; use an exact id from workspace context or a unique exact label." },
      direction: { type: "string", enum: ["down", "right"], description: "Primary flow direction; defaults to the existing flowchart direction." },
      nodes: { type: "array", items: DIAGRAM_NODE_SCHEMA, description: "Only new semantic nodes. Existing nodes may be referenced by id or exact label in edges and should not be repeated unless their label is unchanged." },
      edges: { type: "array", items: FLOWCHART_EXTENSION_EDGE_SCHEMA, description: "New relationships. from/to may reference existing canvas ids/exact labels or nodes[].id. Existing edges are preserved automatically." },
      graphJson: { type: "string", description: "Optional transport fallback: JSON string containing {nodes,edges}." },
    }, ["target", "nodes", "edges"]),

    fn("repair_connector", "Repair any existing selectable connector in a flowchart, swimlane, or free connector. Use reroute_only to preserve block positions, or reposition_and_reroute when a free-form flowchart may move blocks to make the selected connector clearer. Swimlane lane geometry is preserved. The engine chooses orthogonal anchors and waypoints; never provide pixel coordinates.", {
      connectorId: { type: "string", description: "Exact connector id when available." },
      from: { ...TARGET_SCHEMA, description: "Exact source block id or unique block label." },
      to: { ...TARGET_SCHEMA, description: "Exact destination block id or unique block label." },
      label: { type: "string", description: "Optional exact connector label when multiple connectors share the same endpoints." },
      strategy: { type: "string", enum: ["reroute_only", "reposition_and_reroute"], description: "Whether to keep block positions or re-layout the flowchart map." },
      direction: { type: "string", enum: ["down", "right"], description: "Optional flow direction for the re-layout." },
      constraints: {
        type: "object",
        properties: {
          preferredSide: { type: "string", enum: ["top", "right", "bottom", "left"] },
          keepMainlineAligned: { type: "boolean" },
          avoidCrossings: { type: "boolean" },
          maxBends: { type: "integer", minimum: 1, maximum: 8 },
          clearLabels: { type: "boolean" },
        },
      },
    }, ["strategy"]),

    fn("create_swimlane", "Create a polished swimlane diagram from semantic lanes, nodes, and edges. The engine creates the real lane grid/table, places each step in its lane, and wires steps with selectable orthogonal connectors. Do not emulate lanes with a flat create_map tree or raw coordinates.", {
      orientation: { type: "string", enum: ["horizontal", "vertical"], description: "horizontal means lanes are rows; vertical means lanes are columns." },
      lanes: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" } }, required: ["id", "label"] } },
      nodes: { type: "array", items: DIAGRAM_NODE_SCHEMA },
      edges: { type: "array", items: DIAGRAM_EDGE_SCHEMA },
      graphJson: { type: "string", description: "Optional transport fallback: JSON string containing {lanes,nodes,edges} when the tool host cannot preserve nested arrays." },
    }, ["lanes", "nodes", "edges"]),

    fn("update_table_cell", "Set the text of one cell in an existing table block.", {
      target: { ...TARGET_SCHEMA, description: "Must resolve to the table block itself." },
      row: { type: "integer", description: "0-based row index." },
      column: { type: "integer", description: "0-based column index." },
      value: { type: "string" },
    }, ["target", "row", "column", "value"]),

    fn("update_table_cells", "Update multiple existing table cells in one atomic operation. All coordinates are validated before any cell is changed.", {
      target: { ...TARGET_SCHEMA, description: "Must resolve to the table block itself." },
      cells: {
        type: "array",
        minItems: 1,
        maxItems: 400,
        items: {
          type: "object",
          properties: {
            row: { type: "integer", minimum: 0 },
            column: { type: "integer", minimum: 0 },
            value: { type: "string" },
          },
          required: ["row", "column", "value"],
        },
      },
    }, ["target", "cells"]),

    fn("insert_table_row", "Insert a new blank row into an existing table block.", {
      target: { ...TARGET_SCHEMA, description: "Must resolve to the table block itself." },
      row: { type: "integer", description: "0-based index to insert before; omit to append at the end." },
    }, ["target"]),

    fn("insert_table_column", "Insert a new blank column into an existing table block.", {
      target: { ...TARGET_SCHEMA, description: "Must resolve to the table block itself." },
      column: { type: "integer", description: "0-based index to insert before; omit to append at the end." },
    }, ["target"]),

    fn("delete_table_row", "Delete one row from an existing table block.", {
      target: { ...TARGET_SCHEMA, description: "Must resolve to the table block itself." },
      row: { type: "integer", description: "0-based index; omit to delete the last row." },
    }, ["target"]),

    fn("delete_table_column", "Delete one column from an existing table block.", {
      target: { ...TARGET_SCHEMA, description: "Must resolve to the table block itself." },
      column: { type: "integer", description: "0-based index; omit to delete the last column." },
    }, ["target"]),

    fn("create_shape", "Draw a new standalone shape (rectangle, circle, sticky note, etc.) on the canvas — not a text block. Always set \"text\" when the shape represents a named thing (a room, a step, an entity) — an uncaptioned shape is indistinguishable on canvas from every other shape of the same color/kind.", {
      shapeType: { type: "string", enum: ["rounded_rect", "rectangle", "rounded", "pill", "underline", "circle", "oval", "diamond", "triangle", "hexagon", "parallelogram", "star", "speech_bubble", "cylinder", "cloud_rect", "sticky_note", "sticky", "text"] },
      text: { type: "string", description: "Label displayed on the shape. Set this whenever the shape names a specific thing." },
      x: { type: "number" }, y: { type: "number" }, width: { type: "number" }, height: { type: "number" }, rotation: { type: "number" },
      bgColor: { type: "string" }, bgOpacity: { type: "number", minimum: 0, maximum: 100 }, borderColor: { type: "string" }, textColor: { type: "string" },
      borderWidth: { type: "number", enum: [1, 1.5, 2, 3] }, borderDash: { type: "string", enum: ["solid", "dashed", "dotted"] },
    }, ["shapeType"]),

    fn("update_shape", "Change an existing standalone shape's kind, geometry, style, or label.", {
      shapeId: { type: "string", description: "Exact shape block id from the private canvas context — never invent one." },
      shapeType: { type: "string", description: "Same enum as create_shape." },
      text: { type: "string", description: "Replaces the shape's displayed label." },
      x: { type: "number" }, y: { type: "number" }, width: { type: "number" }, height: { type: "number" }, rotation: { type: "number" },
      bgColor: { type: "string" }, bgOpacity: { type: "number", minimum: 0, maximum: 100 }, borderColor: { type: "string" }, textColor: { type: "string" },
      borderWidth: { type: "number", enum: [1, 1.5, 2, 3] }, borderDash: { type: "string", enum: ["solid", "dashed", "dotted"] },
    }, ["shapeId"]),

    fn("delete_shape", "Delete an existing standalone shape.", {
      shapeId: { type: "string", description: "Exact shape block id from the private canvas context." },
    }, ["shapeId"]),

    fn("duplicate_shape", "Duplicate an existing standalone shape, offset from the original.", {
      shapeId: { type: "string", description: "Exact shape block id from the private canvas context." },
      offsetX: { type: "number" }, offsetY: { type: "number" },
    }, ["shapeId"]),

    fn("create_freehand", "Draw a new freehand stroke/line on the canvas from a list of points — not a shape or text block.", {
      points: { type: "array", items: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, required: ["x", "y"] }, description: "Canvas coordinates in drawing order." },
      tool: { type: "string", enum: ["pen", "highlighter", "square", "circle", "arrow_line", "text"] },
      color: { type: "string" }, width: { type: "number" }, opacity: { type: "number", minimum: 0, maximum: 100 },
    }, ["points"]),

    fn("update_freehand", "Change an existing freehand stroke's points or style.", {
      strokeId: { type: "string", description: "Exact stroke block id from the private canvas context — never invent one." },
      points: { type: "array", items: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, required: ["x", "y"] } },
      tool: { type: "string", enum: ["pen", "highlighter", "square", "circle", "arrow_line", "text"] },
      color: { type: "string" }, width: { type: "number" }, opacity: { type: "number", minimum: 0, maximum: 100 },
    }, ["strokeId"]),

    fn("delete_freehand", "Delete an existing freehand stroke.", {
      strokeId: { type: "string", description: "Exact stroke block id from the private canvas context." },
    }, ["strokeId"]),

    fn("duplicate_freehand", "Duplicate an existing freehand stroke, offset from the original.", {
      strokeId: { type: "string", description: "Exact stroke block id from the private canvas context." },
      offsetX: { type: "number" }, offsetY: { type: "number" },
    }, ["strokeId"]),

    fn("update_map_style", "Change one map's layout type and detailed options — connector style is Hierarchy-only; every other family uses fixed routing. Affects every block that shares that map's root, never other maps on the board (each map keeps its own independent layout). target must resolve to a block inside the map you mean; if the board has more than one map and nothing disambiguates which one, do not guess. Proactively suggest this when content clearly fits a non-default layout.", {
      target: { ...TARGET_SCHEMA, description: "Any block belonging to the map whose layout should change (root or descendant) — target.mode=selected uses the current selection." },
      layoutType: { type: "string", enum: ["hierarchy", "treeview", "timeline", "fishbone", "flowchart", "swimlane", "logical-right", "logical-left", "mindmap", "mindmap-vertical", "catalog", "outline", "org-chart", "vertical-timeline"] },
      layoutDirection: { type: "string", enum: ["right", "left", "down", "up"] },
      growthMode: { type: "string", enum: ["one-side", "both-side"] },
      connectionStyle: { type: "string", enum: ["straight", "orthogonal", "curved", "straight_arrow"] },
      connectorPaletteId: { type: "string", enum: ["default", "pastel", "minimal", "monochrome", "vibrant"] },
      timelineBranchMode: { type: "string", enum: ["auto", "one-side", "one-side-reverse", "alternate"] },
      timelineDescendantStyle: { type: "string", enum: ["tree", "hierarchy"] },
      catalogDescendantStyle: { type: "string", enum: ["tree", "hierarchy"] },
    }, ["target"]),

    fn("undo", "Undo the last change. Never combined with other tool calls in the same turn.", {}, []),
    fn("redo", "Redo the last undone change. Never combined with other tool calls in the same turn.", {}, []),

    fn(
      "search_knowledge_base",
      "Search this board's knowledge base — uploaded documents AND the canvas's own block text/descriptions — for facts to answer the user's question or to inform a canvas edit. Call this whenever the user asks something that private board content might answer, before saying you don't know. Not needed for requests that only reference blocks already described in the current selection context.",
      { query: { type: "string", description: "What to search for, in the board's own language." } },
      ["query"],
    ),
  ];
}
