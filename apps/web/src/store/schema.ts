// Local storage schema (TDD §7.1). Mirrored into IndexedDB object stores; the SQL
// in the TDD is the reference shape for the fields.
//
// Semantics carried from TDD §7.1, §13:
//   - An uncalibrated session stores `calibration_id = null` and writes NO `spl`
//     metric rows. Absence is the "NULL, not zero" rule: a value is never faked.
//   - Every stored record carries the `core_version` that produced it, and a
//     `measure_version` row exists for that version (TDD §9).

import { meanFormantConfidence } from "../pad/pad-model.ts";

export const SCHEMA_VERSION = 1;

export const STORES = [
  "session",
  "utterance",
  "metric_series",
  "calibration",
  "measure_version",
];

/** Metric channels (TDD §7.1). `spl` is written only when calibrated. */
export const METRIC_CHANNELS = ["f0", "scale", "hnr", "cpp", "spl"];

/**
 * `stability` (TDD §7.1) — **definition proposed, needs confirmation.** The
 * resonance *steadiness* over a short window: the rolling standard deviation of
 * `scale_semitones`, in semitones. Lower is steadier. It is the companion to
 * `scale` in a trend: `scale` shows where the resonance is, `stability` shows
 * whether it is holding.
 */
export const STABILITY_CHANNEL = "stability";
/** Frames in the rolling window (≈ a tenth of a second at the default hop). */
export const STABILITY_WINDOW = 10;

/** How often a `metric_series` point is kept — downsampled for trend charts. */
export const SERIES_SAMPLE_MS = 100;

export function sessionRow({
  id,
  startedAt,
  endedAt = null,
  deviceClass,
  calibrationId = null,
  appVersion,
  coreVersion,
  abiVersion,
}) {
  return {
    id,
    started_at: startedAt,
    ended_at: endedAt,
    device_class: deviceClass,
    calibration_id: calibrationId,
    app_version: appVersion,
    core_version: coreVersion,
    abi_version: abiVersion,
    schema_version: SCHEMA_VERSION,
  };
}

export function utteranceRow({
  id,
  sessionId,
  kind,
  phonemeSet = null,
  durationMs,
  metricsJson,
  createdAt,
}) {
  return {
    id,
    session_id: sessionId,
    kind,
    phoneme_set: phonemeSet,
    duration_ms: durationMs,
    metrics_json: metricsJson,
    created_at: createdAt,
  };
}

export function calibrationRow({
  id,
  deviceClass,
  micModel = null,
  sensitivityDbfsAt94db,
  method,
  measuredAt,
}) {
  return {
    id,
    device_class: deviceClass,
    mic_model: micModel,
    sensitivity_dbfs_at_94db: sensitivityDbfsAt94db,
    method,
    measured_at: measuredAt,
  };
}

export function measureVersionRow({ coreVersion, introducedAt, notes = null }) {
  return { core_version: coreVersion, introduced_at: introducedAt, notes };
}

/** The value+confidence for one channel at one frame, or null when unmeasurable. */
function channelSample(channel, frame, calibrated) {
  switch (channel) {
    case "f0":
      return frame.f0_hz > 0
        ? { value: frame.f0_hz, confidence: frame.f0_confidence }
        : null;
    case "scale":
      return frame.formants?.some((f) => f.hz > 0)
        ? { value: frame.scale_semitones, confidence: meanFormantConfidence(frame) }
        : null;
    case "hnr":
      return Number.isFinite(frame.hnr_db)
        ? { value: frame.hnr_db, confidence: frame.f0_confidence }
        : null;
    case "cpp":
      return Number.isFinite(frame.cpp_db)
        ? { value: frame.cpp_db, confidence: frame.f0_confidence }
        : null;
    case "spl":
      return calibrated && Number.isFinite(frame.spl_db)
        ? { value: frame.spl_db, confidence: 1 }
        : null;
    default:
      return null;
  }
}

/**
 * Rows for the `metric_series` store, one sequence per channel, downsampled.
 * SPL rows are omitted entirely when uncalibrated (never zeroed).
 */
export function metricSeriesRows({
  utteranceId,
  frames,
  calibrated = false,
  sampleMs = SERIES_SAMPLE_MS,
}) {
  const rows = [];
  for (const channel of METRIC_CHANNELS) {
    if (channel === "spl" && !calibrated) continue;
    let nextAt = -Infinity;
    for (const frame of frames) {
      if (frame.t_ms < nextAt) continue;
      const sample = channelSample(channel, frame, calibrated);
      if (!sample) continue;
      rows.push({
        utterance_id: utteranceId,
        channel,
        t_ms: Math.round(frame.t_ms),
        value: sample.value,
        confidence: sample.confidence,
      });
      nextAt = frame.t_ms + sampleMs;
    }
  }
  rows.push(...stabilityRows({ utteranceId, frames, sampleMs }));
  return rows;
}

/**
 * The `stability` series: the rolling standard deviation of `scale_semitones`
 * over `window` frames, downsampled like the other channels. Only frames with a
 * measurable formant scale contribute.
 */
export function stabilityRows({
  utteranceId,
  frames,
  sampleMs = SERIES_SAMPLE_MS,
  window = STABILITY_WINDOW,
}: {
  utteranceId: string;
  frames: Array<{ t_ms: number; scale_semitones: number; formants?: Array<{ hz: number }> }>;
  sampleMs?: number;
  window?: number;
}) {
  const rows: Array<{
    utterance_id: string;
    channel: string;
    t_ms: number;
    value: number;
    confidence: number;
  }> = [];
  const values: number[] = [];
  let nextAt = -Infinity;

  for (const frame of frames) {
    if (frame.formants?.some((f) => f.hz > 0)) values.push(frame.scale_semitones);
    if (values.length > window) values.shift();
    if (values.length < window || frame.t_ms < nextAt) continue;

    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
    rows.push({
      utterance_id: utteranceId,
      channel: STABILITY_CHANNEL,
      t_ms: Math.round(frame.t_ms),
      value: Math.sqrt(variance),
      confidence: meanFormantConfidence(frame),
    });
    nextAt = frame.t_ms + sampleMs;
  }
  return rows;
}
