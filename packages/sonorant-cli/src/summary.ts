// CLI status and summary (phase 6 S5.1). Status is a WORD — `ok`, `warning`,
// `error` — never colour alone.

const FLAGS = {
  CLIPPED: 1,
  LOW_SNR: 2,
  CREAK: 4,
  SUBHARMONIC: 8,
  FORMANT_UNSTABLE: 16,
  UNCALIBRATED: 32,
};

export const STATUS = { OK: "ok", WARNING: "warning", ERROR: "error" };

const median = (values) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
};

/** `ok` / `warning` / `error` for a batch of frames. */
export function overallStatus(frames) {
  if (!frames || frames.length === 0) return STATUS.ERROR;
  const voiced = frames.filter((f) => f.f0_hz > 0);
  if (voiced.length === 0) return STATUS.ERROR;

  const flagged = frames.some(
    (f) => (f.flags & (FLAGS.CLIPPED | FLAGS.LOW_SNR | FLAGS.FORMANT_UNSTABLE)) !== 0,
  );
  return flagged ? STATUS.WARNING : STATUS.OK;
}

/** A plain-language summary of a batch of frames. */
export function summarize(frames) {
  const status = overallStatus(frames);
  if (status === STATUS.ERROR) {
    return {
      status,
      lines: [frames && frames.length ? "No voiced frames were detected." : "No frames were produced."],
    };
  }

  const voiced = frames.filter((f) => f.f0_hz > 0);
  const f0 = median(voiced.map((f) => f.f0_hz));
  const voicedFraction = Math.round((voiced.length / frames.length) * 100);
  const last = frames[frames.length - 1];

  const lines = [
    `${frames.length} frame(s), ${voicedFraction}% voiced.`,
    `Median pitch: ${f0 === null ? "n/a" : `${Math.round(f0)} Hz`}.`,
    `Last frame at ${((last.t_ms ?? 0) / 1000).toFixed(1)} s.`,
  ];
  return { status, lines };
}
