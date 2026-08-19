// Signature maker, pure logic. Tested in test/helpers.test.mjs.

/* Find the tight bounding box of non-transparent pixels in an RGBA buffer.
   Returns null when the canvas is empty. */
export function trimBounds(data, width, height, alphaThreshold = 8) {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > alphaThreshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/* Midpoint smoothing: returns [ctrlX, ctrlY, midX, midY] segments for a
   quadratic-curve pass through the sampled pointer points. */
export function smoothSegments(points) {
  const segs = [];
  for (let i = 1; i < points.length - 1; i++) {
    const mx = (points[i].x + points[i + 1].x) / 2;
    const my = (points[i].y + points[i + 1].y) / 2;
    segs.push([points[i].x, points[i].y, mx, my]);
  }
  return segs;
}
