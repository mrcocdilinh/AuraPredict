export function chartTimeLabel(value: number, includeDate = false) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    ...(includeDate ? { month: "short", day: "2-digit" } : {}),
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value * 1000));
}

export function chartAxisLabel(value: number, rangeSeconds: number) {
  if (rangeSeconds >= 2 * 24 * 60 * 60) {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      month: "short",
      day: "2-digit"
    }).format(new Date(value * 1000));
  }
  return chartTimeLabel(value);
}

export function clampChartValue(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function formatChartPercent(value: number) {
  const rounded = Math.abs(value - Math.round(value)) < 0.05 ? Math.round(value) : Number(value.toFixed(1));
  return `${rounded}%`;
}

export function smoothPathFromPoints(points: Array<{ x: number; y: number }>) {
  const cleanedPoints = points.reduce<Array<{ x: number; y: number }>>((acc, point) => {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return acc;
    const nextPoint = { x: point.x, y: point.y };
    const lastPoint = acc[acc.length - 1];
    if (lastPoint && Math.abs(lastPoint.x - nextPoint.x) < 0.05) {
      lastPoint.y = nextPoint.y;
      return acc;
    }
    acc.push(nextPoint);
    return acc;
  }, []);

  if (cleanedPoints.length === 0) return "";
  if (cleanedPoints.length === 1) return `M${cleanedPoints[0].x},${cleanedPoints[0].y}`;

  const coord = (value: number) => Number(value.toFixed(3));
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  let path = `M${coord(cleanedPoints[0].x)},${coord(cleanedPoints[0].y)}`;

  for (let index = 0; index < cleanedPoints.length - 1; index += 1) {
    const p0 = cleanedPoints[Math.max(0, index - 1)];
    const p1 = cleanedPoints[index];
    const p2 = cleanedPoints[index + 1];
    const p3 = cleanedPoints[Math.min(cleanedPoints.length - 1, index + 2)];
    const dx = p2.x - p1.x;
    if (dx <= 0.05) {
      path += ` L${coord(p2.x)},${coord(p2.y)}`;
      continue;
    }

    const smoothing = 0.32;
    const previousSlope = (p2.y - p0.y) / Math.max(0.1, p2.x - p0.x);
    const nextSlope = (p3.y - p1.y) / Math.max(0.1, p3.x - p1.x);
    const minY = Math.min(p1.y, p2.y);
    const maxY = Math.max(p1.y, p2.y);
    const cp1x = p1.x + dx * smoothing;
    const cp2x = p2.x - dx * smoothing;
    const cp1y = clamp(p1.y + previousSlope * dx * smoothing, minY, maxY);
    const cp2y = clamp(p2.y - nextSlope * dx * smoothing, minY, maxY);
    path += ` C${coord(cp1x)},${coord(cp1y)} ${coord(cp2x)},${coord(cp2y)} ${coord(p2.x)},${coord(p2.y)}`;
  }

  return path;
}
