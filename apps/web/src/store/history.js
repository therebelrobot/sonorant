// History and A/B comparison (S5.3). Pure record-building and view models; the
// IndexedDB read/write lives in indexed-db.js.

import { confidenceBand } from "../pad/pad-model.js";
import {
  SCHEMA_VERSION,
  measureVersionRow,
  metricSeriesRows,
  sessionRow,
  utteranceRow,
} from "./schema.js";
import { buildAnalysisSummary } from "./summary.js";

export const HISTORY_COPY = {
  heading: "History",
  empty: "No sessions yet. Your practice will appear here.",
  loadError: {
    heading: "History could not be loaded",
    body: "The local store could not be read. Your data is still on this device. Try reloading.",
    action: "Reload",
  },
};

/** Phase-6 S3.2 copy. Self-referential by default; normative comparison is off. */
export const COMPARE_COPY = {
  heading: "Compare",
  earlier: "Earlier",
  now: "Now",
  noAudio: "This session has no recording, so only the measurements can be compared.",
  lowConfidence: "One of these results is not reliable enough to compare.",
  normative: "Comparing against other people is off. This compares you with you.",
};

/** Phase-6 S2.3: below threshold when mean formant confidence < 0.6. */
export const RELIABLE_FORMANT_CONFIDENCE = 0.6;

export function summaryReliable(summary) {
  return (summary?.confidence?.mean_formant ?? 0) >= RELIABLE_FORMANT_CONFIDENCE;
}

/** Rows for one completed session/utterance, ready to persist. */
export function buildSessionRecords({
  sessionId,
  utteranceId,
  startedAt,
  endedAt,
  deviceClass,
  calibrationId = null,
  appVersion,
  coreVersion,
  abiVersion,
  kind,
  frames,
  calibrated = false,
}) {
  const summary = buildAnalysisSummary(frames, { coreVersion, calibrated });
  const durationMs = frames.length ? Math.round(frames[frames.length - 1].t_ms) : 0;

  return {
    schemaVersion: SCHEMA_VERSION,
    session: sessionRow({
      id: sessionId,
      startedAt,
      endedAt,
      deviceClass,
      calibrationId,
      appVersion,
      coreVersion,
      abiVersion,
    }),
    utterance: utteranceRow({
      id: utteranceId,
      sessionId,
      kind,
      durationMs,
      metricsJson: JSON.stringify(summary),
      createdAt: endedAt,
    }),
    metricSeries: metricSeriesRows({ utteranceId, frames, calibrated }),
    measureVersion: measureVersionRow({ coreVersion, introducedAt: endedAt }),
  };
}

/** Dates via `Intl`, never a fixed `MM/DD/YYYY` (phase 6 S3.1). */
export function formatDate(ms, { locale = "en-US", timeZone = "UTC" } = {}) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(ms));
}

function parseSummary(metricsJson) {
  try {
    return JSON.parse(metricsJson);
  } catch {
    return null;
  }
}

/** A short list row summary that includes confidence (phase 6 S3.1). */
export function historyRowSummary(entry) {
  const seconds = (entry.durationMs / 1000).toFixed(1);
  const band = entry.confidence == null ? "unknown" : confidenceBand(entry.confidence);
  return `${entry.kind} · ${seconds} s · confidence: ${band}`;
}

/** Sessions newest-first, each with its kind, total duration, and confidence. */
export function toHistoryViewModel(sessions, utterances) {
  const bySession = new Map();
  for (const utterance of utterances) {
    const list = bySession.get(utterance.session_id) ?? [];
    list.push(utterance);
    bySession.set(utterance.session_id, list);
  }

  return sessions
    .map((session) => {
      const rows = bySession.get(session.id) ?? [];
      const summaries = rows.map((u) => parseSummary(u.metrics_json)).filter(Boolean);
      const latest = summaries[0] ?? null;
      return {
        id: session.id,
        startedAt: session.started_at,
        kind: rows[0]?.kind ?? "session",
        durationMs: rows.reduce((sum, u) => sum + (u.duration_ms ?? 0), 0),
        confidence: latest?.confidence?.mean_formant ?? null,
        coreVersion: session.core_version,
      };
    })
    .sort((a, b) => b.startedAt - a.startedAt);
}

/**
 * The A/B view model. `earlier` and `now` are `{ summary, hasAudio }`.
 * Self-referential by default; a comparison is never shown as fact when a side is
 * missing audio or is not reliable enough.
 */
export function toComparisonViewModel(earlier, now) {
  const caveats = [];
  if (!earlier?.hasAudio || !now?.hasAudio) caveats.push(COMPARE_COPY.noAudio);
  if (!summaryReliable(earlier?.summary) || !summaryReliable(now?.summary)) {
    caveats.push(COMPARE_COPY.lowConfidence);
  }

  const line = (label, summary) => {
    const f0 = summary?.f0?.median;
    const scale = summary?.scale_semitones?.median;
    const confidence = confidenceBand(summary?.confidence?.mean_formant ?? 0);
    const parts = [];
    if (Number.isFinite(f0)) parts.push(`${Math.round(f0)} Hz`);
    if (Number.isFinite(scale)) parts.push(`${scale.toFixed(1)} semitones vs baseline`);
    return `${label}: ${parts.join(", ") || "no measurements"} (confidence: ${confidence}).`;
  };

  return {
    heading: COMPARE_COPY.heading,
    labels: { earlier: COMPARE_COPY.earlier, now: COMPARE_COPY.now },
    lines: [line(COMPARE_COPY.earlier, earlier?.summary), line(COMPARE_COPY.now, now?.summary)],
    caveats,
    normativeNote: COMPARE_COPY.normative,
  };
}
