type Point = { x: number; y: number };
type Command = "M" | "L" | "Q" | "C";
type Segment = { command: Command; from: Point; to: Point; controls?: Point[] };

const TOKEN = /[A-Za-z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi;

function point(x: number, y: number): Point { return { x, y }; }
function distance(a: Point, b: Point) { return Math.hypot(a.x - b.x, a.y - b.y); }
function interpolate(a: Point, b: Point, t: number) { return point(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t); }
function round(value: number) { return Math.round(value * 1000) / 1000; }
function format(p: Point) { return `${round(p.x)} ${round(p.y)}`; }

function parsePath(path: string): Segment[] | null {
  const tokens = path.match(TOKEN) ?? [];
  const segments: Segment[] = [];
  let cursor = 0;
  let current = point(0, 0);
  while (cursor < tokens.length) {
    const rawCommand = tokens[cursor++].toUpperCase();
    const command = rawCommand as Command;
    const arity = command === "M" || command === "L" ? 2 : command === "Q" ? 4 : command === "C" ? 6 : rawCommand === "H" || rawCommand === "V" ? 1 : 0;
    if (!arity) return null;
    const values = tokens.slice(cursor, cursor + arity).map(Number);
    cursor += arity;
    if (values.length !== arity || values.some((value) => !Number.isFinite(value))) return null;
    if (command === "M" || command === "L") {
      const to = point(values[0], values[1]);
      segments.push({ command, from: current, to });
      current = to;
    } else if (rawCommand === "H" || rawCommand === "V") {
      const to = rawCommand === "H" ? point(values[0], current.y) : point(current.x, values[0]);
      segments.push({ command: "L", from: current, to });
      current = to;
    } else if (command === "Q") {
      const to = point(values[2], values[3]);
      segments.push({ command, from: current, to, controls: [point(values[0], values[1])] });
      current = to;
    } else {
      const to = point(values[4], values[5]);
      segments.push({ command, from: current, to, controls: [point(values[0], values[1]), point(values[2], values[3])] });
      current = to;
    }
  }
  return segments;
}

function serialize(segments: Segment[]) {
  return segments.map((segment) => {
    if (segment.command === "M" || segment.command === "L") return `${segment.command} ${format(segment.to)}`;
    return `${segment.command} ${segment.controls!.map(format).join(" ")} ${format(segment.to)}`;
  }).join(" ");
}

function split(segment: Segment, t: number) {
  if (segment.command === "L") {
    const splitPoint = interpolate(segment.from, segment.to, t);
    return { point: splitPoint, left: { ...segment, to: splitPoint }, right: { ...segment, from: splitPoint } };
  }
  if (segment.command === "Q") {
    const control = segment.controls![0];
    const first = interpolate(segment.from, control, t);
    const second = interpolate(control, segment.to, t);
    const splitPoint = interpolate(first, second, t);
    return { point: splitPoint, left: { ...segment, to: splitPoint, controls: [first] }, right: { ...segment, from: splitPoint, controls: [second] } };
  }
  const [firstControl, secondControl] = segment.controls!;
  const first = interpolate(segment.from, firstControl, t);
  const second = interpolate(firstControl, secondControl, t);
  const third = interpolate(secondControl, segment.to, t);
  const leftControl = interpolate(first, second, t);
  const rightControl = interpolate(second, third, t);
  const splitPoint = interpolate(leftControl, rightControl, t);
  return {
    point: splitPoint,
    left: { ...segment, to: splitPoint, controls: [first, leftControl] },
    right: { ...segment, from: splitPoint, controls: [rightControl, third] },
  };
}

function cut(segment: Segment, tip: Point, depth: number, fromStart: boolean) {
  if (segment.command === "M" || distance(segment.from, segment.to) < 0.001) return null;
  if (fromStart ? distance(segment.to, tip) < depth : distance(segment.from, tip) < depth) return null;
  let low = 0;
  let high = 1;
  for (let index = 0; index < 40; index += 1) {
    const candidate = split(segment, (low + high) / 2).point;
    if (fromStart ? distance(candidate, tip) < depth : distance(candidate, tip) > depth) low = (low + high) / 2;
    else high = (low + high) / 2;
  }
  const result = split(segment, (low + high) / 2);
  return { base: result.point, replacement: fromStart ? result.right : result.left };
}

export interface TrimmedArrowPath {
  path: string;
  tip: Point;
  base: Point;
  angle: number;
}

export function trimConnectorPathForArrow(path: string, depth: number, endpoint: "start" | "end"): TrimmedArrowPath | null {
  const segments = parsePath(path);
  if (!segments || segments.length < 2 || depth <= 0) return null;
  const tip = endpoint === "start" ? segments[0].to : segments[segments.length - 1].to;
  const indexes = endpoint === "start" ? [...segments.keys()] : [...segments.keys()].reverse();
  for (const index of indexes) {
    const result = cut(segments[index], tip, depth, endpoint === "start");
    if (!result) continue;
    if (endpoint === "start") {
      result.replacement.from = result.base;
      segments.splice(0, index + 1, { command: "M", from: result.base, to: result.base }, result.replacement);
    } else {
      result.replacement.to = result.base;
      segments.splice(index, segments.length - index, result.replacement);
    }
    return {
      path: serialize(segments),
      tip,
      base: result.base,
      angle: Math.atan2(tip.y - result.base.y, tip.x - result.base.x),
    };
  }
  return null;
}

export function getWorkspaceArrowDepth(strokeWidth: number) { return Math.max(5, strokeWidth * 1.5) * 2; }
