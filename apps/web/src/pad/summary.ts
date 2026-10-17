// Confidence-bearing text summary (phase 6 S2.4).
//
// This is the accessible equivalent of the pad: every displayed value carries a
// confidence, and a value that has no usable confidence is not shown as a value.

import {
  TRUST_VOICING_CONFIDENCE,
  confidenceBand,
  isTrustworthy,
  meanFormantConfidence,
} from "./pad-model.ts";

export const SUMMARY_COPY = {
  heading: "Summary",
  notReliable: "These numbers are not reliable yet. See the note above.",
  notEnoughVoice:
    "Not enough clear voice was detected. Try speaking a little longer or a little louder.",
  uncalibrated: "Sound level: not calibrated.",
  unvoiced: "Pitch: not detected (unvoiced).",
  noFormants: "Resonance: not measured yet.",
};

const round = (value, digits = 0) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

/** Pitch with its confidence. An unvoiced frame is not shown as a value. */
export function pitchLine(frame) {
  if (!(frame.f0_hz > 0)) return SUMMARY_COPY.unvoiced;
  return `Pitch: ${round(frame.f0_hz)} Hz (confidence: ${confidenceBand(frame.f0_confidence)}).`;
}

/** Resonance relative to the session baseline, with formant confidence. */
export function resonanceLine(frame) {
  const hasFormants = (frame.formants ?? []).some((f) => f.hz > 0);
  if (!hasFormants) return SUMMARY_COPY.noFormants;
  const semitones = frame.scale_semitones;
  const direction = semitones > 0.1 ? "above" : semitones < -0.1 ? "below" : "at";
  const phrase =
    direction === "at"
      ? "at your baseline"
      : `${round(Math.abs(semitones), 1)} semitones ${direction} your baseline`;
  return `Resonance: ${phrase} (confidence: ${confidenceBand(meanFormantConfidence(frame))}).`;
}

/** Level is SPL once calibrated, and honestly blank until then (S7). */
export function levelLine(_frame, { calibrated = false } = {}) {
  return calibrated ? "Sound level: see the calibration panel." : SUMMARY_COPY.uncalibrated;
}

export function isVoiceTooWeak(frame) {
  return (frame.f0_confidence ?? 0) < TRUST_VOICING_CONFIDENCE;
}

/**
 * @returns {{ heading: string, reliable: boolean, caveat: string|null, lines: string[] }}
 */
export function summarize(frame, options = {}) {
  const reliable = isTrustworthy(frame);
  const lines = [pitchLine(frame), resonanceLine(frame), levelLine(frame, options)];
  const caveat = reliable
    ? null
    : isVoiceTooWeak(frame)
      ? SUMMARY_COPY.notEnoughVoice
      : SUMMARY_COPY.notReliable;
  return { heading: SUMMARY_COPY.heading, reliable, caveat, lines };
}

/** The whole summary as one string, for screen readers and copy/paste. */
export function summaryText(frame, options = {}) {
  const { heading, lines, caveat } = summarize(frame, options);
  return [`${heading}:`, ...lines, ...(caveat ? [caveat] : [])].join(" ");
}
