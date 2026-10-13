/**
 * Marker attribute for panels that own their own text selection and
 * clipboard behaviour — chat, outline, comments, version history, search.
 *
 * A panel carrying this attribute is exempt from the canvas keyboard
 * shortcuts in useWorkspaceKeyboardShortcuts.ts, so selecting a chat
 * message and pressing Ctrl+C copies the text instead of the selected
 * blocks, and Ctrl+X / Delete does not destroy canvas content.
 *
 * Legacy counterpart: `data-mm-keyboard-scope` in app/mindmap.
 */
export const WORKSPACE_KEYBOARD_SCOPE_ATTR = "data-workspace-keyboard-scope";

export const WORKSPACE_KEYBOARD_SCOPE_SELECTOR = `[${WORKSPACE_KEYBOARD_SCOPE_ATTR}]`;

/** Spread onto a panel's root element: `{...workspaceKeyboardScope("chat")}`. */
export function workspaceKeyboardScope(name: string): Record<string, string> {
  return { [WORKSPACE_KEYBOARD_SCOPE_ATTR]: name };
}

/**
 * True when a keystroke belongs to one of those panels rather than to the
 * canvas.
 *
 * Checks the event target AND the live selection's own ancestor chain:
 * selecting plain text with no focused input leaves the event target as
 * document.body, which has no ancestor to match, so a text-only selection
 * inside a panel would otherwise fall through to the canvas shortcuts — and
 * Ctrl+X / Delete would destroy blocks instead of acting on the text.
 * Ported from legacy's guard in app/mindmap/hooks/usePageKeyboard.ts.
 */
export function isInsideWorkspaceKeyboardScope(target: HTMLElement | null): boolean {
  if (target?.closest?.(WORKSPACE_KEYBOARD_SCOPE_SELECTOR)) return true;

  const selection = typeof window !== "undefined" ? window.getSelection() : null;
  const selectionNode = selection && !selection.isCollapsed ? selection.anchorNode : null;
  const selectionElement =
    selectionNode instanceof Element ? selectionNode : selectionNode?.parentElement ?? null;
  return Boolean(selectionElement?.closest(WORKSPACE_KEYBOARD_SCOPE_SELECTOR));
}
