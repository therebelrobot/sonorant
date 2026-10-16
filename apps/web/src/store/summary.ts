// AnalysisSummary — the per-utterance aggregate stored in `utterance.metrics_json`.
//
// **DRAFT.** This implements the proposed structure in
// docs/rrf/05-technical-architecture.md §3.4, which is explicitly marked
// "NEEDS CONFIRMATION". It is not yet a confirmed contract (phase 7 §6).
//
// One gap in that draft: it requires a `StatBlock` (median/p05/p95/mean) for every
// measure, but a measure with no data in an utterance (e.g. F0 in a silent one)
// has no such numbers. This returns `null` for an empty block rather than
// inventing zeros.

import { FLAGS } from "../pad/pad-model.ts";

const FLAG_NAMES = {
  CLIPPED: FLAGS.CLIPPED,
  LOW_SNR: FLAGS.LOW_SNR,
  CREAK: FLAGS.CREAK,
  SUBHARMONIC: FLAGS.SUBHARMONIC,
  FORMANT_UNSTABLE: FLAGS.FORMANT_UNSTABLE,
  UNCALIBRATED: FLAGS.UNCALIBRATED,
};

/** Nearest-rank percentile of an already-sorted array. Null when empty. */
function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[index];
}

/** `{median, p05, p95, mean}` for the finite values, or null when there are none.
 * @param {number[]} values
 */
export function statBlock(values) {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return null;
  const sorted = [...finite].sort((a, b) => a - b);
  const mean = finite.reduce((sum, v) => sum + v, 0) / finite.length;
  return {
    median: percentile(sorted, 0.5),
    p05: percentile(sorted, 0.05),
    p95: percentile(sorted, 0.95),
    mean,
  };
}

/**
 * @param {Array<import("../types").Frame>} frames decoded frames for one utterance
 * @param {{ coreVersion: string, calibrated?: boolean }} options
 */
export function buildAnalysisSummary(frames, { coreVersion, calibrated = false }) {
  const voiced = frames.filter((f) => f.f0_hz > 0);

  const formantConfidences = [];
  for (const frame of frames) {
    for (const formant of frame.formants ?? []) {
      if (formant.hz > 0) formantConfidences.push(formant.confidence);
    }
  }

  const flagCounts = {};
  for (const frame of frames) {
    for (const [name, bit] of Object.entries(FLAG_NAMES)) {
      if ((frame.flags & bit) !== 0) flagCounts[name] = (flagCounts[name] ?? 0) + 1;
    }
  }

  const voicing = [...voiced.map((f) => f.f0_confidence)].sort((a, b) => a - b);

  return {
    core_version: coreVersion,
    duration_ms: frames.length ? Math.round(frames[frames.length - 1].t_ms) : 0,
    voiced_fraction: frames.length ? voiced.length / frames.length : 0,
    f0: statBlock(voiced.map((f) => f.f0_hz)),
    formants: [0, 1, 2, 3, 4].map((i) =>
      statBlock(
        frames.filter((f) => f.formants?.[i]?.hz > 0).map((f) => f.formants[i].hz),
      ),
    ),
    scale_semitones: statBlock(frames.map((f) => f.scale_semitones)),
    hnr_db: statBlock(frames.map((f) => f.hnr_db)),
    cpp_db: statBlock(frames.map((f) => f.cpp_db)),
    tilt_db_per_oct: statBlock(frames.map((f) => f.tilt_db_per_oct)),
    h1_h2_db: statBlock(frames.map((f) => f.h1_h2_db)),
    centroid_hz: statBlock(frames.map((f) => f.centroid_hz)),
    rms_dbfs: statBlock(frames.map((f) => f.rms_dbfs)),
    spl_db: calibrated ? statBlock(frames.map((f) => f.spl_db)) : null,
    jitter_local: statBlock(frames.map((f) => f.jitter_local)),
    shimmer_local: statBlock(frames.map((f) => f.shimmer_local)),
    confidence: {
      mean_formant: formantConfidences.length
        ? formantConfidences.reduce((sum, c) => sum + c, 0) / formantConfidences.length
        : 0,
      voicing_p05: percentile(voicing, 0.05) ?? 0,
    },
    flag_counts: flagCounts,
  };
}
