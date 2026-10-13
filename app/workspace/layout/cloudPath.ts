/**
 * Generates an SVG path data string for a scalloped rectangle (Cloud shape).
 * Scallops arc outward along each edge and at the 4 rounded corners of the bounding box.
 *
 * @param w Width of the shape
 * @param h Height of the shape
 * @param pad Inset padding from bounding box
 */
export function generateCloudRectPath(w: number, h: number, pad = 0): string {
  const minDim = Math.min(w, h);
  // Corner radius proportional to dimensions, clamped reasonably
  const rCorner = Math.max(2.5, Math.min(12, Math.round(minDim * 0.12)));
  const padX = pad + rCorner;
  const padY = pad + rCorner;

  const innerW = Math.max(4, w - 2 * padX);
  const innerH = Math.max(4, h - 2 * padY);

  // Adaptive scallop size between 10px and 26px
  const targetStep = Math.min(26, Math.max(10, Math.min(innerW, innerH) / 3));
  const nx = Math.max(1, Math.round(innerW / targetStep));
  const ny = Math.max(1, Math.round(innerH / targetStep));

  const stepX = innerW / nx;
  const stepY = innerH / ny;

  const rx = stepX * 0.58;
  const ry = stepY * 0.58;

  let d = `M ${(pad + rCorner).toFixed(2)},${pad.toFixed(2)}`;

  // Top edge: Left to Right (bulges UP / outward)
  for (let i = 0; i < nx; i++) {
    const xEnd = pad + rCorner + (i + 1) * stepX;
    d += ` A ${rx.toFixed(2)},${rx.toFixed(2)} 0 0,1 ${xEnd.toFixed(2)},${pad.toFixed(2)}`;
  }

  // Top-Right corner puff (bulges UP-RIGHT / outward)
  d += ` A ${rCorner.toFixed(2)},${rCorner.toFixed(2)} 0 0,1 ${(w - pad).toFixed(2)},${(pad + rCorner).toFixed(2)}`;

  // Right edge: Top to Bottom (bulges RIGHT / outward)
  for (let i = 0; i < ny; i++) {
    const yEnd = pad + rCorner + (i + 1) * stepY;
    d += ` A ${ry.toFixed(2)},${ry.toFixed(2)} 0 0,1 ${(w - pad).toFixed(2)},${yEnd.toFixed(2)}`;
  }

  // Bottom-Right corner puff (bulges DOWN-RIGHT / outward)
  d += ` A ${rCorner.toFixed(2)},${rCorner.toFixed(2)} 0 0,1 ${(w - pad - rCorner).toFixed(2)},${(h - pad).toFixed(2)}`;

  // Bottom edge: Right to Left (bulges DOWN / outward)
  for (let i = nx - 1; i >= 0; i--) {
    const xEnd = pad + rCorner + i * stepX;
    d += ` A ${rx.toFixed(2)},${rx.toFixed(2)} 0 0,1 ${xEnd.toFixed(2)},${(h - pad).toFixed(2)}`;
  }

  // Bottom-Left corner puff (bulges DOWN-LEFT / outward)
  d += ` A ${rCorner.toFixed(2)},${rCorner.toFixed(2)} 0 0,1 ${pad.toFixed(2)},${(h - pad - rCorner).toFixed(2)}`;

  // Left edge: Bottom to Top (bulges LEFT / outward)
  for (let i = ny - 1; i >= 0; i--) {
    const yEnd = pad + rCorner + i * stepY;
    d += ` A ${ry.toFixed(2)},${ry.toFixed(2)} 0 0,1 ${pad.toFixed(2)},${yEnd.toFixed(2)}`;
  }

  // Top-Left corner puff (bulges UP-LEFT / outward)
  d += ` A ${rCorner.toFixed(2)},${rCorner.toFixed(2)} 0 0,1 ${(pad + rCorner).toFixed(2)},${pad.toFixed(2)}`;

  d += " Z";
  return d;
}
