//! Voiced-cycle (glottal-pulse) segmentation and the perturbation measures
//! (TDD §4.1): `jitter_local` and `shimmer_local`.
//!
//! Both are Praat's *local* definitions, in percent (100 × a ratio), so a
//! perfectly steady voice reads 0:
//!
//! ```text
//! jitter_local  = 100 · mean(|Tᵢ − Tᵢ₊₁|) / mean(T)     T = cycle period, samples
//! shimmer_local = 100 · mean(|Aᵢ − Aᵢ₊₁|) / mean(A)     A = peak |x| within a cycle
//! ```
//!
//! Cycle boundaries are **found, not assumed**: from each epoch the next is the
//! lag near `sample_rate / f0` that best aligns the waveform with itself
//! (normalised cross-correlation). Assuming a constant period would measure the
//! assumption, not the voice.
//!
//! `NaN` means "not measured", never zero. Both are `NaN` for an unvoiced frame,
//! and for a frame too short to hold [`MIN_PERIODS`] cycles — at the default
//! 2048-sample frame and 44.1 kHz that is roughly f0 ≥ 86 Hz. A low voice is
//! simply not measurable in a 46 ms frame; the per-utterance summary over many
//! frames is where a session-level number comes from.

/// Cycles required before a perturbation estimate is published. Below this the
/// successive difference of a handful of periods is noise, not a measurement.
pub const MIN_PERIODS: usize = 4;

/// Half-width of the period search around the expected lag, as a fraction of it.
/// Wide enough to track the pulse-to-pulse variation of a pathological voice.
const SEARCH_FRACTION: f32 = 0.25;

/// Upper bound on cycles marked per frame, to bound the work on long frames.
const MAX_PERIODS: usize = 64;

/// Minimum self-similarity for an epoch to be accepted. A cycle that does not
/// resemble its predecessor is not a cycle, and a period measured between them
/// would be a number invented from noise — better to stop and report `NaN`.
const MIN_ALIGNMENT: f32 = 0.6;

/// `(jitter_local, shimmer_local)` in percent, or `(NaN, NaN)` when not
/// measurable (TDD §4.1).
pub fn jitter_shimmer(frame: &[f32], sample_rate: f32, f0_hz: f32) -> (f32, f32) {
    const NOT_MEASURED: (f32, f32) = (f32::NAN, f32::NAN);

    if frame.len() < 8 || !(sample_rate > 0.0) || !(f0_hz > 0.0) {
        return NOT_MEASURED;
    }
    let period = sample_rate / f0_hz;
    if !period.is_finite() || period < 2.0 {
        return NOT_MEASURED;
    }
    if (frame.len() as f32) < period * MIN_PERIODS as f32 {
        return NOT_MEASURED;
    }

    let search = (period * SEARCH_FRACTION).ceil() as usize;
    // The comparison window covers one glottal pulse, not a whole cycle: a window
    // as long as the period would also contain the *next* pulse, and the
    // alignment would then be ambiguous between neighbouring cycles.
    let window = ((period * 0.4).round() as usize).max(2);

    // The first epoch is the strongest sample of the opening cycle. From there
    // each next epoch is the best self-alignment near one period on.
    let first_span = ((period * 1.25).ceil() as usize).clamp(1, frame.len());
    let first_epoch = argmax_abs(frame, 0, first_span);
    let mut epochs: Vec<usize> = vec![first_epoch];

    while epochs.len() <= MAX_PERIODS {
        let last = *epochs.last().unwrap();
        let expected = last as f32 + period;
        let lo = (expected - search as f32).max(0.0) as usize;
        // A candidate whose comparison window runs off the end of the frame cannot
        // be evaluated, and must not be replaced by a spurious in-frame match.
        let hi =
            ((expected + search as f32).ceil() as usize).min(frame.len().saturating_sub(window));
        if lo >= hi {
            break;
        }
        match best_alignment(frame, last, lo, hi, window) {
            Some((next, score)) if next > last && score >= MIN_ALIGNMENT => epochs.push(next),
            _ => break,
        }
    }

    // `epochs` are boundaries, so `periods` is one shorter than it.
    if epochs.len() < MIN_PERIODS + 1 {
        return NOT_MEASURED;
    }

    let mut periods: Vec<f32> = Vec::with_capacity(epochs.len() - 1);
    let mut amplitudes: Vec<f32> = Vec::with_capacity(epochs.len() - 1);
    for pair in epochs.windows(2) {
        periods.push((pair[1] - pair[0]) as f32);
        amplitudes.push(peak_abs(frame, pair[0], pair[1]));
    }

    let count = periods.len() as f32;
    let mean_period = periods.iter().sum::<f32>() / count;
    let mean_amplitude = amplitudes.iter().sum::<f32>() / count;
    if !(mean_period > 0.0) || !(mean_amplitude > 0.0) {
        return NOT_MEASURED;
    }

    let jitter = 100.0 * successive_mean_abs_diff(&periods) / mean_period;
    let shimmer = 100.0 * successive_mean_abs_diff(&amplitudes) / mean_amplitude;
    if jitter.is_finite() && shimmer.is_finite() && jitter >= 0.0 && shimmer >= 0.0 {
        (jitter, shimmer)
    } else {
        NOT_MEASURED
    }
}

/// Index of the largest `|x|` in `[from, to)`, or `from` when the range is empty.
fn argmax_abs(x: &[f32], from: usize, to: usize) -> usize {
    let start = from.min(x.len());
    let end = to.min(x.len()).max(start);
    let mut best = start;
    let mut best_magnitude = f32::NEG_INFINITY;
    for (offset, value) in x[start..end].iter().enumerate() {
        let magnitude = value.abs();
        if magnitude > best_magnitude {
            best_magnitude = magnitude;
            best = start + offset;
        }
    }
    best
}

/// Largest `|x|` in `[from, to)`.
fn peak_abs(x: &[f32], from: usize, to: usize) -> f32 {
    let start = from.min(x.len());
    let end = to.min(x.len());
    x[start..end].iter().fold(0.0f32, |m, v| m.max(v.abs()))
}

/// Normalised cross-correlation of `x[p..p+window]` with `x[q..q+window]`.
fn ncc(x: &[f32], p: usize, q: usize, window: usize) -> f32 {
    let (mut num, mut energy_p, mut energy_q) = (0.0f32, 0.0f32, 0.0f32);
    for k in 0..window {
        let a = x[p + k];
        let b = x[q + k];
        num += a * b;
        energy_p += a * a;
        energy_q += b * b;
    }
    let denominator = (energy_p * energy_q).sqrt();
    if denominator > 0.0 {
        num / denominator
    } else {
        0.0
    }
}

/// The `(q, score)` whose window best aligns with the one at `p`, if any.
fn best_alignment(
    x: &[f32],
    p: usize,
    lo: usize,
    hi: usize,
    window: usize,
) -> Option<(usize, f32)> {
    if p + window > x.len() {
        return None;
    }
    let mut best: Option<(usize, f32)> = None;
    for q in lo..=hi {
        if q + window > x.len() {
            break;
        }
        let score = ncc(x, p, q, window);
        if score.is_finite() && best.map_or(true, |(_, previous)| score > previous) {
            best = Some((q, score));
        }
    }
    best
}

/// Mean absolute difference between successive values.
fn successive_mean_abs_diff(values: &[f32]) -> f32 {
    if values.len() < 2 {
        return 0.0;
    }
    let sum: f32 = values
        .windows(2)
        .map(|pair| (pair[1] - pair[0]).abs())
        .sum();
    sum / (values.len() - 1) as f32
}
