import type { TrendSeries } from "../model";
import { channelLabel, trendStopsAt, trendTextAlternative } from "../model";

export interface TrendChartProps {
  series: TrendSeries;
  width?: number;
  height?: number;
  title?: string;
}

/**
 * Longitudinal trend chart with `core_version` boundary marks (TDD §9.3).
 *
 * When the measurement method changes, the chart draws a dashed boundary and
 * stops if continuing would read a change in the software as a change in the
 * voice. The written alternative is rendered in the figure caption, so the chart
 * is never the only source of the trend.
 */
export function TrendChart({
  series,
  width = 640,
  height = 200,
  title = "Trend",
}: TrendChartProps) {
  const margin = { left: 46, right: 14, top: 16, bottom: 30 };
  const plot = {
    x: margin.left,
    y: margin.top,
    w: width - margin.left - margin.right,
    h: height - margin.top - margin.bottom,
  };
  const alt = trendTextAlternative(series);
  const points = series.points;
  const values = points.map((p) => p.value).filter(Number.isFinite);

  const content = () => {
    if (points.length < 2) {
      return (
        <text className="sonorant-trend__empty" x={plot.x + 4} y={plot.y + 18}>
          {alt.summary}
        </text>
      );
    }
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const t0 = points[0]?.t_ms ?? 0;
    const t1 = points[points.length - 1]?.t_ms ?? 1;
    const spanT = t1 - t0 || 1;
    const toX = (t: number) => plot.x + ((t - t0) / spanT) * plot.w;
    const toY = (v: number) => plot.y + plot.h - ((v - min) / span) * plot.h;
    const path = points
      .map((p, i) => `${i === 0 ? "M" : "L"}${toX(p.t_ms).toFixed(1)} ${toY(p.value).toFixed(1)}`)
      .join(" ");
    const stop = trendStopsAt(series);
    const stopT = stop ? series.segments[stop.index]?.points[0]?.t_ms ?? null : null;

    return (
      <>
        <path className="sonorant-trend__trace" d={path} />
        {series.boundaries.map((boundary, i) => (
          <g key={i} className="sonorant-trend__boundary">
            <line x1={toX(boundary.t_ms)} y1={plot.y} x2={toX(boundary.t_ms)} y2={plot.y + plot.h} />
            <text x={toX(boundary.t_ms) + 4} y={plot.y + 12}>
              Method changed
            </text>
          </g>
        ))}
        {stopT != null && (
          <text className="sonorant-trend__stopped" x={plot.x} y={plot.y + plot.h - 6}>
            Chart stops here
          </text>
        )}
        <text className="sonorant-trend__axis" x={plot.x} y={plot.y + plot.h + 20}>
          {channelLabel(series.channel)}
        </text>
        <text className="sonorant-trend__axis" x={4} y={plot.y + 10}>
          {max.toFixed(1)}
        </text>
        <text className="sonorant-trend__axis" x={4} y={plot.y + plot.h}>
          {min.toFixed(1)}
        </text>
      </>
    );
  };

  return (
    <figure className="sonorant-trend">
      <svg
        className="sonorant-trend__svg"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="img"
        aria-label={`${title}. ${alt.summary}${alt.boundaryNote ? ` ${alt.boundaryNote}` : ""}${alt.stoppedNote ? ` ${alt.stoppedNote}` : ""}`}
      >
        <title>{title}</title>
        <rect className="sonorant-trend__frame" x={plot.x} y={plot.y} width={plot.w} height={plot.h} />
        {content()}
      </svg>
      <figcaption className="sonorant-trend__caption">
        {alt.summary}
        {alt.boundaryNote ? ` ${alt.boundaryNote}` : ""}
        {alt.stoppedNote ? ` ${alt.stoppedNote}` : ""}
      </figcaption>
    </figure>
  );
}
