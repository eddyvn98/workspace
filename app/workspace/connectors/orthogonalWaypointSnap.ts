export interface OrthogonalPoint {
  x: number;
  y: number;
}

export type OrthogonalAnchorSide = "top" | "right" | "bottom" | "left";

/** Snap a segment's moving coordinate to another route vertex within range. */
export function snapOrthogonalSegmentDelta(
  points: OrthogonalPoint[],
  point: OrthogonalPoint,
  axis: "x" | "y",
  delta: number,
  threshold: number,
): number {
  const current = point[axis];
  const target = current + delta;
  let bestDelta = delta;
  let bestDistance = threshold;
  for (const candidate of points) {
    const coordinate = candidate[axis];
    if (Math.abs(coordinate - current) < 0.0001) continue;
    const distance = Math.abs(coordinate - target);
    if (distance <= bestDistance) {
      bestDistance = distance;
      bestDelta = coordinate - current;
    }
  }
  return bestDelta;
}

/** Shift one orthogonal segment, preserving the legacy wall-slide behavior. */
export function shiftOrthogonalSegment(
  points: OrthogonalPoint[],
  point: OrthogonalPoint,
  axis: "x" | "y",
  delta: number,
): OrthogonalPoint[] {
  if (points.length < 2) return points.map((item) => ({ ...item }));

  let bestDistance = Infinity;
  let segmentIndex = -1;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const segmentAxis = Math.abs(dx) >= Math.abs(dy) ? "y" : "x";
    if (segmentAxis !== axis || (dx === 0 && dy === 0)) continue;
    const lengthSq = dx * dx + dy * dy;
    const t = Math.max(0, Math.min(1, (
      (point.x - start.x) * dx + (point.y - start.y) * dy
    ) / lengthSq));
    const projected = { x: start.x + t * dx, y: start.y + t * dy };
    const distance = Math.hypot(point.x - projected.x, point.y - projected.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      segmentIndex = index;
    }
  }
  if (segmentIndex < 0) return points.map((item) => ({ ...item }));

  if (points.length === 2) {
    const start = points[0];
    const end = points[1];
    const moved = { ...point, [axis]: point[axis] + delta };
    return normalizeOrthogonalPoints(axis === "y"
      ? [start, { x: start.x, y: moved.y }, { x: end.x, y: moved.y }, end]
      : [start, { x: moved.x, y: start.y }, { x: moved.x, y: end.y }, end]);
  }

  const shifted = points.map((item) => ({ ...item }));
  const isFirst = segmentIndex === 0;
  const isLast = segmentIndex === points.length - 2;
  if (isFirst) {
    const start = points[0];
    const moved = shifted[1];
    moved[axis] += delta;
    const bridge = axis === "y"
      ? { x: start.x, y: moved.y }
      : { x: moved.x, y: start.y };
    shifted.splice(1, 0, bridge);
  } else if (isLast) {
    const end = points[points.length - 1];
    const moved = shifted[shifted.length - 2];
    moved[axis] += delta;
    const bridge = axis === "y"
      ? { x: end.x, y: moved.y }
      : { x: moved.x, y: end.y };
    shifted.splice(shifted.length - 1, 0, bridge);
  } else {
    shifted[segmentIndex][axis] += delta;
    shifted[segmentIndex + 1][axis] += delta;
  }
  return normalizeOrthogonalPoints(shifted);
}

/** Move any dragged route segments that cut through blocks to their nearest clear edge. */
export function keepOrthogonalRouteOutsideBlocks(
  points: OrthogonalPoint[],
  obstacles: Array<Pick<DOMRect, "left" | "right" | "top" | "bottom">>,
  clearance = 8,
): OrthogonalPoint[] {
  const adjusted = points.map((point) => ({ ...point }));
  for (let pass = 0; pass < 2; pass += 1) {
    let changed = false;
    for (let index = 0; index < adjusted.length - 1; index += 1) {
      const start = adjusted[index];
      const end = adjusted[index + 1];
      if (start.x === end.x) {
        const minY = Math.min(start.y, end.y);
        const maxY = Math.max(start.y, end.y);
        for (const rect of obstacles) {
          if (minY >= rect.bottom || maxY <= rect.top || start.x <= rect.left || start.x >= rect.right) continue;
          const safeX = Math.abs(start.x - (rect.left - clearance)) <= Math.abs(start.x - (rect.right + clearance))
            ? rect.left - clearance
            : rect.right + clearance;
          start.x = safeX;
          end.x = safeX;
          changed = true;
        }
      } else if (start.y === end.y) {
        const minX = Math.min(start.x, end.x);
        const maxX = Math.max(start.x, end.x);
        for (const rect of obstacles) {
          if (minX >= rect.right || maxX <= rect.left || start.y <= rect.top || start.y >= rect.bottom) continue;
          const safeY = Math.abs(start.y - (rect.top - clearance)) <= Math.abs(start.y - (rect.bottom + clearance))
            ? rect.top - clearance
            : rect.bottom + clearance;
          start.y = safeY;
          end.y = safeY;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return normalizeOrthogonalPoints(adjusted);
}

function normalizeOrthogonalPoints(points: OrthogonalPoint[]): OrthogonalPoint[] {
  if (points.length < 2) return points.map((point) => ({ ...point }));
  const normalized: OrthogonalPoint[] = [{ ...points[0] }];
  for (const target of points.slice(1)) {
    const previous = normalized[normalized.length - 1];
    if (previous.x === target.x && previous.y === target.y) continue;
    if (previous.x !== target.x && previous.y !== target.y) {
      const beforePrevious = normalized[normalized.length - 2];
      const previousIsVertical = beforePrevious && beforePrevious.x === previous.x;
      normalized.push(previousIsVertical
        ? { x: previous.x, y: target.y }
        : { x: target.x, y: previous.y });
    }
    normalized.push({ ...target });
    while (normalized.length >= 3) {
      const end = normalized.length - 1;
      const a = normalized[end - 2];
      const b = normalized[end - 1];
      const c = normalized[end];
      if ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)) {
        normalized.splice(end - 1, 1);
      } else {
        break;
      }
    }
  }
  return normalized;
}

/**
 * Keep the two endpoint leads perpendicular to their blocks after a manual
 * waypoint/segment drag. A free waypoint can otherwise move the first point
 * sideways and make the route run parallel to the block edge before turning
 * inward. The endpoint itself stays fixed; only the first/last interior point
 * is projected back onto the selected anchor's normal line.
 */
export function constrainOrthogonalEndpointLeads(
  points: OrthogonalPoint[],
  fromSide?: OrthogonalAnchorSide,
  toSide?: OrthogonalAnchorSide,
  fromAnchor?: OrthogonalPoint,
  toAnchor?: OrthogonalPoint,
): OrthogonalPoint[] {
  const normalized = normalizeOrthogonalPoints(points);
  if (
    normalized.length === 1
    && fromSide
    && toSide
    && fromAnchor && toAnchor
  ) {
    const waypoint = normalized[0];
    if (isOutwardEndpointLead(fromAnchor, waypoint, fromSide) && isOutwardEndpointLead(toAnchor, waypoint, toSide)) {
      return normalized;
    }

    const leadDistance = 8;
    const fromLead = offsetFromAnchor(fromAnchor, fromSide, leadDistance);
    const toLead = offsetFromAnchor(toAnchor, toSide, leadDistance);
    const fromNormalAxis = fromSide === "top" || fromSide === "bottom" ? "y" : "x";
    const toNormalAxis = toSide === "top" || toSide === "bottom" ? "y" : "x";
    if (fromNormalAxis === toNormalAxis && fromNormalAxis === "y") {
      let trunkX = waypoint.x;
      if (Math.abs(trunkX - fromLead.x) < leadDistance || Math.abs(trunkX - toLead.x) < leadDistance) {
        trunkX = (fromLead.x + toLead.x) / 2;
      }
      if (Math.abs(trunkX - fromLead.x) < 0.001) trunkX += leadDistance;
      return normalizeOrthogonalPoints([
        fromLead,
        { x: trunkX, y: fromLead.y },
        { x: trunkX, y: toLead.y },
        toLead,
      ]);
    }
    if (fromNormalAxis === toNormalAxis) {
      let trunkY = waypoint.y;
      if (Math.abs(trunkY - fromLead.y) < leadDistance || Math.abs(trunkY - toLead.y) < leadDistance) {
        trunkY = (fromLead.y + toLead.y) / 2;
      }
      if (Math.abs(trunkY - fromLead.y) < 0.001) trunkY += leadDistance;
      return normalizeOrthogonalPoints([
        fromLead,
        { x: fromLead.x, y: trunkY },
        { x: toLead.x, y: trunkY },
        toLead,
      ]);
    }
    const corner = fromNormalAxis === "y"
      ? { x: toLead.x, y: fromLead.y }
      : { x: fromLead.x, y: toLead.y };
    return normalizeOrthogonalPoints([fromLead, corner, toLead]);
  }
  if (normalized.length >= 2 && fromAnchor && toAnchor) {
    const routed = normalizeOrthogonalPoints([fromAnchor, ...normalized, toAnchor]);
    const firstLead = routed[1];
    const lastLead = routed[routed.length - 2];
    const minimumLead = 8;

    if (fromSide) {
      if (fromSide === "top" || fromSide === "bottom") {
        firstLead.x = fromAnchor.x;
        const direction = fromSide === "top" ? -1 : 1;
        if ((firstLead.y - fromAnchor.y) * direction <= 0) firstLead.y = fromAnchor.y + direction * minimumLead;
      } else {
        firstLead.y = fromAnchor.y;
        const direction = fromSide === "left" ? -1 : 1;
        if ((firstLead.x - fromAnchor.x) * direction <= 0) firstLead.x = fromAnchor.x + direction * minimumLead;
      }
    }
    if (toSide) {
      if (toSide === "top" || toSide === "bottom") {
        lastLead.x = toAnchor.x;
        const direction = toSide === "top" ? -1 : 1;
        if ((lastLead.y - toAnchor.y) * direction <= 0) lastLead.y = toAnchor.y + direction * minimumLead;
      } else {
        lastLead.y = toAnchor.y;
        const direction = toSide === "left" ? -1 : 1;
        if ((lastLead.x - toAnchor.x) * direction <= 0) lastLead.x = toAnchor.x + direction * minimumLead;
      }
    }
    return normalizeOrthogonalPoints(routed).slice(1, -1);
  }
  if (normalized.length < 2) return normalized;
  const constrained = normalized.map((point) => ({ ...point }));
  const start = constrained[0];
  const end = constrained[constrained.length - 1];
  const minimumLead = 8;

  if (fromSide && constrained.length > 2) {
    const first = constrained[1];
    if (fromSide === "top" || fromSide === "bottom") {
      first.x = start.x;
      const direction = fromSide === "top" ? -1 : 1;
      if ((first.y - start.y) * direction <= 0) first.y = start.y + direction * minimumLead;
    } else {
      first.y = start.y;
      const direction = fromSide === "left" ? -1 : 1;
      if ((first.x - start.x) * direction <= 0) first.x = start.x + direction * minimumLead;
    }
  }

  if (toSide && constrained.length > 2) {
    const last = constrained[constrained.length - 2];
    if (toSide === "top" || toSide === "bottom") {
      last.x = end.x;
      const direction = toSide === "top" ? -1 : 1;
      if ((last.y - end.y) * direction <= 0) last.y = end.y + direction * minimumLead;
    } else {
      last.y = end.y;
      const direction = toSide === "left" ? -1 : 1;
      if ((last.x - end.x) * direction <= 0) last.x = end.x + direction * minimumLead;
    }
  }

  return normalizeOrthogonalPoints(constrained);
}

function offsetFromAnchor(anchor: OrthogonalPoint, side: OrthogonalAnchorSide, distance: number): OrthogonalPoint {
  if (side === "top") return { x: anchor.x, y: anchor.y - distance };
  if (side === "bottom") return { x: anchor.x, y: anchor.y + distance };
  if (side === "left") return { x: anchor.x - distance, y: anchor.y };
  return { x: anchor.x + distance, y: anchor.y };
}

function isOutwardEndpointLead(anchor: OrthogonalPoint, point: OrthogonalPoint, side: OrthogonalAnchorSide): boolean {
  if (side === "top") return Math.abs(point.x - anchor.x) < 0.001 && point.y <= anchor.y - 8;
  if (side === "bottom") return Math.abs(point.x - anchor.x) < 0.001 && point.y >= anchor.y + 8;
  if (side === "left") return Math.abs(point.y - anchor.y) < 0.001 && point.x <= anchor.x - 8;
  return Math.abs(point.y - anchor.y) < 0.001 && point.x >= anchor.x + 8;
}
