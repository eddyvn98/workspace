export interface GridRoutePoint {
  x: number;
  y: number;
}

export interface GridObstacle {
  left: number;
  top: number;
  width: number;
  height: number;
}

type QueueItem = { index: number; direction: number; cost: number; key: string };
/** Legacy parity: obstacle padding used by the dense-route grid fallback. */
const GRID_CLEARANCE = 4;

const DIRECTIONS = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;

function bounds(obstacle: GridObstacle, clearance: number) {
  return {
    left: obstacle.left - clearance,
    right: obstacle.left + obstacle.width + clearance,
    top: obstacle.top - clearance,
    bottom: obstacle.top + obstacle.height + clearance,
  };
}

function blocked(point: GridRoutePoint, obstacles: GridObstacle[], clearance: number) {
  return obstacles.some((obstacle) => {
    const box = bounds(obstacle, clearance);
    return point.x > box.left && point.x < box.right && point.y > box.top && point.y < box.bottom;
  });
}

export function isGridRouteClear(points: GridRoutePoint[], obstacles: GridObstacle[], clearance = 0) {
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    if (a.x !== b.x && a.y !== b.y) return false;
    for (const obstacle of obstacles) {
      const box = bounds(obstacle, clearance);
      const hit = a.x === b.x
        ? a.x > box.left && a.x < box.right && Math.max(a.y, b.y) > box.top && Math.min(a.y, b.y) < box.bottom
        : a.y > box.top && a.y < box.bottom && Math.max(a.x, b.x) > box.left && Math.min(a.x, b.x) < box.right;
      if (hit) return false;
    }
  }
  return true;
}

function uniqueSorted(values: number[]) {
  return [...new Set(values)].sort((a, b) => a - b);
}

function push(queue: QueueItem[], item: QueueItem) {
  queue.push(item);
  let index = queue.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (queue[parent].cost <= queue[index].cost) break;
    [queue[parent], queue[index]] = [queue[index], queue[parent]];
    index = parent;
  }
}

function pop(queue: QueueItem[]) {
  const first = queue[0];
  const last = queue.pop();
  if (queue.length && last) {
    queue[0] = last;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (left < queue.length && queue[left].cost < queue[smallest].cost) smallest = left;
      if (right < queue.length && queue[right].cost < queue[smallest].cost) smallest = right;
      if (smallest === index) break;
      [queue[index], queue[smallest]] = [queue[smallest], queue[index]];
      index = smallest;
    }
  }
  return first;
}

function at(index: number, width: number, xs: number[], ys: number[]) {
  return { x: xs[index % width], y: ys[Math.floor(index / width)] };
}

/** Finds a shortest deterministic route through obstacle-boundary corridors. */
export function findGridOrthogonalRoute(
  start: GridRoutePoint,
  end: GridRoutePoint,
  obstacles: GridObstacle[],
  clearance = GRID_CLEARANCE,
): GridRoutePoint[] | null {
  if (start.x === end.x && start.y === end.y) return [start];
  const xs = uniqueSorted([start.x, end.x, ...obstacles.flatMap((obstacle) => {
    const box = bounds(obstacle, clearance);
    return [box.left, box.right];
  })]);
  const ys = uniqueSorted([start.y, end.y, ...obstacles.flatMap((obstacle) => {
    const box = bounds(obstacle, clearance);
    return [box.top, box.bottom];
  })]);
  const width = xs.length;
  const height = ys.length;
  const startIndex = ys.indexOf(start.y) * width + xs.indexOf(start.x);
  const endIndex = ys.indexOf(end.y) * width + xs.indexOf(end.x);
  const blockedCells = Array.from({ length: width * height }, (_, index) => blocked(at(index, width, xs, ys), obstacles, clearance));
  if (startIndex < 0 || endIndex < 0 || blockedCells[startIndex] || blockedCells[endIndex]) return null;

  const queue: QueueItem[] = [];
  const distances = new Map<string, number>();
  const previous = new Map<string, string>();
  const startKey = `${startIndex}:4`;
  distances.set(startKey, 0);
  push(queue, { index: startIndex, direction: 4, cost: 0, key: startKey });

  while (queue.length) {
    const current = pop(queue)!;
    if (current.cost !== distances.get(current.key)) continue;
    if (current.index === endIndex) {
      const route: GridRoutePoint[] = [];
      let key: string | undefined = current.key;
      while (key) {
        const index = Number(key.slice(0, key.indexOf(":")));
        route.push(at(index, width, xs, ys));
        key = previous.get(key);
      }
      return route.reverse();
    }
    const row = Math.floor(current.index / width);
    const column = current.index % width;
    for (let direction = 0; direction < DIRECTIONS.length; direction += 1) {
      const nextColumn = column + DIRECTIONS[direction][0];
      const nextRow = row + DIRECTIONS[direction][1];
      if (nextColumn < 0 || nextColumn >= width || nextRow < 0 || nextRow >= height) continue;
      const nextIndex = nextRow * width + nextColumn;
      if (blockedCells[nextIndex]) continue;
      const from = at(current.index, width, xs, ys);
      const to = at(nextIndex, width, xs, ys);
      if (!isGridRouteClear([from, to], obstacles, clearance)) continue;
      const turnCost = current.direction !== 4 && current.direction !== direction ? 8 : 0;
      const nextCost = current.cost + Math.abs(to.x - from.x) + Math.abs(to.y - from.y) + turnCost;
      const nextKey = `${nextIndex}:${direction}`;
      if (nextCost >= (distances.get(nextKey) ?? Number.POSITIVE_INFINITY)) continue;
      distances.set(nextKey, nextCost);
      previous.set(nextKey, current.key);
      push(queue, { index: nextIndex, direction, cost: nextCost, key: nextKey });
    }
  }
  return null;
}
