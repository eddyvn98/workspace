export function WorkspaceDocRichEditorStyles() {
  return <style>{`
    .workspace-doc-rich-editor { background: #fff; }
    .workspace-doc-rich-editor .ProseMirror { outline: none; min-height: 160px; font-size: 14px; line-height: 1.6; color: #1e293b; background: #fff; color-scheme: light; overflow-wrap: anywhere; }
    .workspace-doc-rich-editor .ProseMirror p { margin: 0.45em 0; }
    .workspace-doc-rich-editor .ProseMirror > :first-child { margin-top: 0; }
    .workspace-doc-rich-editor .ProseMirror li > p { margin: 0.15em 0; }
    .workspace-doc-rich-editor h1 { font-size: 20px; font-weight: 700; margin: 0.6em 0 0.2em; }
    .workspace-doc-rich-editor h2 { font-size: 17px; font-weight: 700; margin: 0.6em 0 0.2em; }
    .workspace-doc-rich-editor h3 { font-size: 15px; font-weight: 700; margin: 0.6em 0 0.2em; }
    .workspace-doc-rich-editor ul[data-type="taskList"] { list-style: none; padding-left: 0; }
    .workspace-doc-rich-editor ul[data-type="taskList"] > li { display: flex; align-items: flex-start; gap: 0.5em; }
    .workspace-doc-rich-editor ul[data-type="taskList"] > li > label { display: flex; flex: 0 0 auto; padding-top: 0.3em; }
    .workspace-doc-rich-editor ul[data-type="taskList"] > li > label input { margin: 0; width: 1em; height: 1em; }
    .workspace-doc-rich-editor ul[data-type="taskList"] > li > div { flex: 1; min-width: 0; }
    .workspace-doc-rich-editor ul[data-type="taskList"] > li > div > p:first-child { margin-top: 0; }
    .workspace-doc-rich-editor .is-empty::before { content: attr(data-placeholder); color: #94a3b8; float: left; height: 0; pointer-events: none; }
    .workspace-doc-rich-editor .is-empty:not(.is-empty-current)::before { visibility: hidden; }
    .workspace-doc-rich-editor .is-empty:not(.is-empty-current):hover::before { visibility: visible; }
    .workspace-doc-rich-editor ul:not([data-type="taskList"]) { list-style: disc; padding-left: 1.75em; }
    .workspace-doc-rich-editor ol { list-style: decimal; padding-left: 1.75em; }
    .workspace-doc-rich-editor li { margin: 0.15em 0; }
    .workspace-doc-rich-editor blockquote { border-left: 3px solid #94a3b8; padding-left: 12px; margin: 0.6em 0; font-style: italic; color: #475569; }
    .workspace-doc-rich-editor a { color: #2563eb; }
    .workspace-doc-rich-editor code { background: #f1f5f9; border-radius: 4px; padding: 0.1em 0.35em; font-size: 0.9em; font-family: ui-monospace, monospace; }
    .workspace-doc-rich-editor pre { margin: 0.8em 0; padding: 14px 16px; border-radius: 8px; background: #0f172a; color: #e2e8f0; overflow-x: auto; white-space: pre-wrap; tab-size: 2; }
    .workspace-doc-rich-editor pre code { background: transparent; color: inherit; padding: 0; border-radius: 0; line-height: 1.5; }
    .workspace-doc-rich-editor hr { margin: 1.2em 0; border: 0; border-top: 1px solid #cbd5e1; }
    .workspace-doc-rich-editor mark { border-radius: 2px; padding: 0.05em 0; }
    .workspace-doc-rich-editor .workspace-doc-search-hit { background: #fef08a; color: #1e293b; }
    .workspace-doc-rich-editor .workspace-doc-search-active { background: #fdba74; outline: 1px solid #c2410c; }
    .workspace-doc-rich-editor table { border-collapse: collapse; margin: 0.6em 0; width: 100%; table-layout: fixed; }
    .workspace-doc-rich-editor th, .workspace-doc-rich-editor td { border: 1px solid #e2e8f0; padding: 6px 8px; vertical-align: top; position: relative; }
    .workspace-doc-rich-editor th { background: #f8fafc; font-weight: 600; text-align: left; }
    .workspace-doc-rich-editor .selectedCell { background: #eff6ff; }
    .workspace-doc-rich-editor .column-resize-handle { position: absolute; top: 0; right: -2px; bottom: -2px; width: 4px; background: #60a5fa; pointer-events: none; }
    .workspace-doc-rich-editor .resize-cursor { cursor: col-resize; }
    .workspace-doc-table-shell { margin: 14px 0; min-width: 0; }
    .workspace-doc-table-embed { display: block; width: 100%; }
    .workspace-doc-table-missing { margin: 12px 0; border: 1px dashed #fca5a5; border-radius: 10px; padding: 12px; color: #b91c1c; font-size: 12px; }
    .workspace-doc-table-scroll { min-width: 0; height: 300px; max-height: 48vh; overflow: auto; }
  `}</style>;
}
