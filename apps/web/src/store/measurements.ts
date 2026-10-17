// The measurements panel: the stored `AnalysisSummary` made visible.
//
// Most of the summary reached `metrics_json` and stopped there — measured,
// stored, and never shown to anyone. This turns it into labelled rows. Pure: no
// DOM, so it is testable on its own.
//
// Copy rules (TDD §11, project brief): plain language, no blame, nothing conveyed
// by colour alone, and numbers via `Intl` so another locale reads them correctly.

import { FLAG_LABELS, FLAGS, confidenceBand } from "../pad/pad-model.ts";

export const MEASUREMENT_COPY = {
  heading: "Measurements",
  empty: "No measurements yet. Finish a session first.",
  noData: "This session has no usable measurements.",
  uncalibrated: "Sound level is not shown: this session has no calibration.",
  caveat: "These are this session's own numbers. Nothing is compared with anyone else.",
};

/** A flag name from `flag_counts` as its UI label. */
export function flagLabel(name) {
  return FLAG_LABELS[FLAGS[name]] ?? name;
}

/** A number in the reader's locale, at a fixed number of decimals. */
export function formatMeasure(value, digits, { locale = "en-US" } = {}) {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/**
 * The measures this panel shows, in reading order: pitch, resonance, voice
 * quality, then the perturbation measures. `formants` are expanded separately.
 */
const SPECS = [
  { key: "f0", label: "Pitch", units: "Hz", digits: 0 },
  {
    key: "scale_semitones",
    label: "Resonance",
    units: "semitones",
    digits: 1,
    note: "against this session's own baseline",
  },
  { key: "hnr_db", label: "Harmonicity (HNR)", units: "dB", digits: 1 },
  {
    key: "cpp_db",
    label: "Cepstral peak prominence",
    units: "",
    digits: 2,
    note: "provisional — not Praat's CPP",
  },
  { key: "tilt_db_per_oct", label: "Spectral tilt", units: "dB/octave", digits: 1 },
  { key: "h1_h2_db", label: "Vocal weight (H1–H2)", units: "dB", digits: 1 },
  { key: "centroid_hz", label: "Brightness (centroid)", units: "Hz", digits: 0 },
  { key: "rms_dbfs", label: "Level", units: "dBFS", digits: 1 },
  {
    key: "jitter_local",
    label: "Jitter",
    units: "%",
    digits: 2,
    note: "cycle-to-cycle period variation; lower is steadier",
  },
  {
    key: "shimmer_local",
    label: "Shimmer",
    units: "%",
    digits: 2,
    note: "cycle-to-cycle loudness variation; lower is steadier",
  },
  { key: "spl_db", label: "Sound level", units: "dB SPL", digits: 1, calibratedOnly: true },
];

/**
 * One row per measure with data in this utterance. A `null` stat block means the
 * utterance held no finite value for that measure, and the row is omitted rather
 * than shown as a zero.
 */
export function measurementRows(summary, { calibrated = false, locale = "en-US" } = {}) {
  if (!summary) return [];

  const rows = [];
  const add = (key, label, units, digits, block, note = null) => {
    if (!block || !Number.isFinite(block.median)) return;
    rows.push({
      key,
      label,
      units,
      note,
      value: formatMeasure(block.median, digits, { locale }),
      range: `${formatMeasure(block.p05, digits, { locale })}–${formatMeasure(block.p95, digits, { locale })}`,
    });
  };

  for (const spec of SPECS) {
    if (spec.calibratedOnly && !calibrated) continue;
    add(spec.key, spec.label, spec.units, spec.digits, summary[spec.key], spec.note ?? null);
    // The formants sit with the other resonance measures.
    if (spec.key === "scale_semitones") {
      (summary.formants ?? []).forEach((block, index) => {
        add(`formants[${index}]`, `Formant F${index + 1}`, "Hz", 0, block);
      });
    }
  }

  return rows;
}

/** The lines above the list: what the session is, and how far to trust it. */
export function measurementLines(summary, { calibrated = false, locale = "en-US" } = {}) {
  if (!summary) return [];
  const lines = [];

  const seconds = Number.isFinite(summary.duration_ms) ? summary.duration_ms / 1000 : null;
  const voiced = Number.isFinite(summary.voiced_fraction)
    ? Math.round(summary.voiced_fraction * 100)
    : null;
  if (seconds !== null && voiced !== null) {
    lines.push(
      `${formatMeasure(seconds, 1, { locale })} s, ${formatMeasure(voiced, 0, { locale })}% voiced.`,
    );
  }

  const band = confidenceBand(summary.confidence?.mean_formant ?? 0);
  lines.push(`Confidence: ${band}.`);

  if (!calibrated) lines.push(MEASUREMENT_COPY.uncalibrated);

  const flags = Object.entries(summary.flag_counts ?? {}).map(
    ([name, count]) => `${flagLabel(name)} × ${count}`,
  );
  if (flags.length) lines.push(`Flags: ${flags.join(", ")}.`);

  lines.push(MEASUREMENT_COPY.caveat);
  return lines;
}
