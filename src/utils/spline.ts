export type Point = { x: number, y: number };

export function generateToneCurveLUT(
  master: Point[], red: Point[], green: Point[], blue: Point[]
): Uint8Array {
  const lut = new Uint8Array(256 * 4);
  const mCurve = buildMonotonicCubicSpline(master);
  const rCurve = buildMonotonicCubicSpline(red);
  const gCurve = buildMonotonicCubicSpline(green);
  const bCurve = buildMonotonicCubicSpline(blue);

  for (let i = 0; i < 256; i++) {
    const x = i / 255;
    lut[i * 4 + 0] = Math.max(0, Math.min(255, Math.round(rCurve(x) * 255)));
    lut[i * 4 + 1] = Math.max(0, Math.min(255, Math.round(gCurve(x) * 255)));
    lut[i * 4 + 2] = Math.max(0, Math.min(255, Math.round(bCurve(x) * 255)));
    lut[i * 4 + 3] = Math.max(0, Math.min(255, Math.round(mCurve(x) * 255)));
  }
  return lut;
}

export function buildMonotonicCubicSpline(points: Point[]): (x: number) => number {
  const pts = [...points].sort((a, b) => a.x - b.x);
  if (pts.length === 0) return (x) => x;
  if (pts.length === 1) return () => pts[0].y;

  const n = pts.length;
  const dx = [], dy = [], m = [];

  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1].x - pts[i].x);
    dy.push(pts[i + 1].y - pts[i].y);
    m.push(dx[i] === 0 ? 0 : dy[i] / dx[i]);
  }

  const c = [m[0]];
  for (let i = 0; i < n - 2; i++) {
    if (m[i] * m[i + 1] <= 0) { c.push(0); } 
    else {
      const common = dx[i] + dx[i + 1];
      c.push(3 * common / ((common + dx[i + 1]) / m[i] + (common + dx[i]) / m[i + 1]));
    }
  }
  c.push(m[m.length - 1]);

  return (x: number) => {
    if (x <= pts[0].x) return pts[0].y;
    if (x >= pts[n - 1].x) return pts[n - 1].y;

    let i = 0;
    while (i < n - 1 && x > pts[i + 1].x) i++;

    const h = dx[i];
    const t = (x - pts[i].x) / h;
    const t2 = t * t;
    const t3 = t2 * t;

    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;

    return h00 * pts[i].y + h10 * h * c[i] + h01 * pts[i + 1].y + h11 * h * c[i + 1];
  };
}
