/**
 * Tiny dependency-free trend line. Values are plotted left→right over a fixed
 * [min,max] range (default 1-5 to match star ratings). Nulls are skipped.
 */
export function Sparkline({
  values,
  width = 140,
  height = 36,
  min = 1,
  max = 5,
  className = "text-brand-600",
}: {
  values: (number | null)[];
  width?: number;
  height?: number;
  min?: number;
  max?: number;
  className?: string;
}) {
  const pad = 3;
  const n = values.length;
  const pts = values
    .map((v, i) => ({ v, i }))
    .filter((p): p is { v: number; i: number } => p.v != null);
  if (pts.length === 0) return null;

  const xFor = (i: number) =>
    n <= 1 ? width / 2 : pad + (i / (n - 1)) * (width - 2 * pad);
  const yFor = (v: number) => {
    const t = (v - min) / (max - min || 1);
    return height - pad - t * (height - 2 * pad);
  };

  const line = pts
    .map((p) => `${xFor(p.i).toFixed(1)},${yFor(p.v).toFixed(1)}`)
    .join(" ");
  const last = pts[pts.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
    >
      {pts.length > 1 && (
        <polyline
          points={line}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      <circle cx={xFor(last.i)} cy={yFor(last.v)} r={2.6} fill="currentColor" />
    </svg>
  );
}
