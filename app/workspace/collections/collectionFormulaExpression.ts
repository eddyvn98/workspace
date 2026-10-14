import type { CollectionBlockPayload, CollectionRecord } from "./model";

/** A bounded, arithmetic-only DSL. Field variables use {stable-field-id}.
 * No eval, function calls, member access, network, or arbitrary identifiers. */
const TOKEN = /\s*(\{[a-zA-Z0-9_-]{1,128}\}|\d+(?:\.\d+)?|\.\d+|[()+*/-])\s*/gy;
export function tokenizeCollectionExpression(expression: string): string[] | null {
  if (expression.length > 500 || !expression.trim()) return null;
  const result: string[] = [];
  let position = 0;
  while (position < expression.length) {
    TOKEN.lastIndex = position;
    const match = TOKEN.exec(expression);
    if (!match || match.index !== position || result.length >= 100) return null;
    result.push(match[1]); position = TOKEN.lastIndex;
  }
  return result;
}
export function expressionFieldIds(expression: string): string[] {
  return [...new Set((tokenizeCollectionExpression(expression) ?? []).filter(token =>
    token.startsWith("{")).map(token => token.slice(1, -1)))];
}
export function evaluateCollectionExpression(expression: string, data: CollectionBlockPayload,
  record: CollectionRecord): string {
  const tokens = tokenizeCollectionExpression(expression);
  if (!tokens) return "";
  let index = 0, depth = 0;
  const atom = (): number => {
    if (++depth > 20) throw new Error("Expression nesting limit");
    const token = tokens[index++];
    let result: number;
    if (token === "-") result = -atom();
    else if (token === "+") result = atom();
    else if (token === "(") {
      result = sum();
      if (tokens[index++] !== ")") throw new Error("Missing closing parenthesis");
    } else if (token?.startsWith("{")) {
      const fieldId = token.slice(1, -1);
      const field = data.fields.find(item => item.id === fieldId);
      const value = record.values[fieldId] ?? "";
      if (!field || !["number", "lookup", "rollup"].includes(field.type) ||
        !value.trim() || !Number.isFinite(Number(value))) throw new Error("Invalid field reference");
      result = Number(value);
    } else if (token && /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(token)) result = Number(token);
    else throw new Error("Invalid expression token");
    depth--;
    return result;
  };
  const product = (): number => {
    let result = atom();
    while (tokens[index] === "*" || tokens[index] === "/") {
      const operation = tokens[index++], right = atom();
      result = operation === "*" ? result * right : result / right;
    }
    return result;
  };
  const sum = (): number => {
    let result = product();
    while (tokens[index] === "+" || tokens[index] === "-") {
      const operation = tokens[index++], right = product();
      result = operation === "+" ? result + right : result - right;
    }
    return result;
  };
  try {
    const value = sum();
    return index === tokens.length && Number.isFinite(value) ? String(Number(value.toFixed(6))) : "";
  } catch { return ""; }
}
export function validCollectionExpression(expression: string, data: CollectionBlockPayload,
  selfId: string): boolean {
  const tokens = tokenizeCollectionExpression(expression);
  if (!tokens) return false;
  const ids = expressionFieldIds(expression);
  if (ids.length > 10 || ids.includes(selfId) || ids.some(id => !data.fields.some(field =>
    field.id === id && ["number", "lookup", "rollup"].includes(field.type)))) return false;
  const synthetic = { id: "formula-validation", values: Object.fromEntries(ids.map(id => [id, "1"])) };
  return evaluateCollectionExpression(expression, data, synthetic) !== "";
}
