// Longitudinal trends (S5.4). Pure: series building, `core_version` boundaries,
// distribution, and the text alternative. The chart itself is trend-view.js.

import { confidenceBand } from "../pad/pad-model.ts";

export const TREND_COPY = {
  heading: "Trend",
  boundaryLabel: "Measurement method changed here",
  boundaryBody:
    "The app changed how it measures on this date. Points before and after are not directly comparable.",
  stopped: "The chart stops here because continuing would be misleading.",
  empty: "Not enough sessions yet to show a trend.",
};

export const CHANNEL_LABELS = {
  f0: "Pitch (Hz)",
  scale: "Resonance (semitones)",
  hnr: "HNR (dB)",
  cpp: "CPP",
  spl: "Sound level (dB SPL)",
  stability: "Resonance stability (semitones)",
};

export function channelLabel(channel) {
  return CHANNEL_LABELS[channel] ?? channel;
}

/**
 * Build a trend series from metric points, each carrying the `core_version` that
 * produced it. Points are split into segments at every version change; the change
 * is a boundary the UI must mark.
 *
 * @param {{ channel: string, points: Array<{t_ms:number, value:number, confidence:number, coreVersion:string}> }} input
 */
export function buildTrendSeries({ channel, points }) {
  const sorted = [...points].sort((a, b) => a.t_ms - b.t_ms);
  const segments = [];
  const boundaries = [];

  for (const point of sorted) {
    const current = segments[segments.length - 1];
    if (!current || current.coreVersion !== point.coreVersion) {
      if (current) {
        boundaries.push({
          index: segments.length,
          t_ms: point.t_ms,
          fromVersion: current.coreVersion,
          toVersion: point.coreVersion,
        });
      }
      segments.push({ coreVersion: point.coreVersion, points: [] });
    }
    segments[segments.length - 1].points.push(point);
  }

  return { channel, points: sorted, segments, boundaries };
}

/** `"up" | "down" | "steady"`, ignoring tiny wobble relative to the span. */
export function trendDirection(values) {
  if (values.length < 2) return "steady";
  const first = values[0];
  const last = values[values.length - 1];
  const span = Math.max(...values) - Math.min(...values);
  const threshold = Math.max(1e-6, span * 0.1);
  const delta = last - first;
  if (delta > threshold) return "up";
  if (delta < -threshold) return "down";
  return "steady";
}

/** Distribution of a segment's values (the "distribution shift" view). */
export function segmentDistribution(points) {
  const values = points.map((p) => p.value).filter(Number.isFinite).sort((a, b) => a - b);
  if (values.length === 0) return null;
  const at = (p) => values[Math.min(values.length - 1, Math.round((values.length - 1) * p))];
  return { p05: at(0.05), p50: at(0.5), p95: at(0.95), min: values[0], max: values[values.length - 1] };
}

/**
 * The trend stops at a boundary when there are not enough points after it to show
 * a trend — continuing would show a change in the software as a change in the voice.
 */
export function trendStopsAt(series) {
  return series.boundaries.find((b) => (series.segments[b.index]?.points.length ?? 0) < 2) ?? null;
}

/**
 * The accessible equivalent of the chart: direction and range with confidence, and
 * the boundary note when a `core_version` change is present.
 */
export function trendTextAlternative(series) {
  const values = series.points.map((p) => p.value).filter(Number.isFinite);
  if (values.length < 2) {
    return { summary: TREND_COPY.empty, boundaryNote: null, stoppedNote: null };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const direction = trendDirection(values);
  const confidences = series.points.map((p) => p.confidence).filter(Number.isFinite);
  const mean = confidences.length
    ? confidences.reduce((sum, c) => sum + c, 0) / confidences.length
    : Number.NaN;

  const summary = `${channelLabel(series.channel)} trend is ${direction}, ranging ${min.toFixed(1)} to ${max.toFixed(1)} (confidence: ${confidenceBand(mean)}).`;
  const boundaryNote = series.boundaries.length ? TREND_COPY.boundaryBody : null;
  const stoppedNote = trendStopsAt(series) ? TREND_COPY.stopped : null;

  return { summary, boundaryNote, stoppedNote };
}

/**
 * Convert stored sessions/utterances/series into trend points for one channel,
 * tagging each with the `core_version` of the session that produced it.
 * No historical audio is re-analysed here.
 */
export function trendPoints(
  sessions: Array<{ id: string; core_version: string; started_at: number }>,
  utterances: Array<{ id: string; session_id: string }>,
  seriesRows: Array<{
    utterance_id: string;
    channel: string;
    t_ms: number;
    value: number;
    confidence: number;
  }>,
  channel: string,
) {
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const sessionByUtterance = new Map(utterances.map((u) => [u.id, u.session_id]));
  return seriesRows
    .filter((row) => row.channel === channel)
    .map((row) => {
      const session = sessionById.get(sessionByUtterance.get(row.utterance_id));
      return {
        // Wall-clock: the stored t_ms is measured from the session's own start.
        t_ms: (session?.started_at ?? 0) + row.t_ms,
        value: row.value,
        confidence: row.confidence,
        coreVersion: session?.core_version ?? "unknown",
      };
    });
}
