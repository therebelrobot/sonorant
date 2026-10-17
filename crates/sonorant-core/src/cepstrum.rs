//! Real cepstrum and a provisional cepstral peak prominence (CPP).

use realfft::RealFftPlanner;

const LOG_FLOOR: f32 = 1e-12;

/// Real cepstrum of `frame`, length `frame.len()`. Empty input yields empty
/// output; an FFT failure yields a zeroed vector rather than a panic.
pub fn real_cepstrum(frame: &[f32]) -> Vec<f32> {
    if frame.is_empty() {
        return Vec::new();
    }
    let n = frame.len();
    let mut planner = RealFftPlanner::<f32>::new();
    let r2c = planner.plan_fft_forward(n);
    let c2r = planner.plan_fft_inverse(n);

    let mut input = frame.to_vec();
    let mut spec = r2c.make_output_vec();
    if r2c.process(&mut input, &mut spec).is_err() {
        return vec![0.0; n];
    }
    for c in spec.iter_mut() {
        let mag = (c.re * c.re + c.im * c.im).sqrt().max(LOG_FLOOR);
        c.re = mag.ln();
        c.im = 0.0;
    }

    let mut out = c2r.make_output_vec();
    if c2r.process(&mut spec, &mut out).is_err() {
        return vec![0.0; n];
    }
    let scale = 1.0 / n as f32;
    for v in out.iter_mut() {
        *v *= scale;
    }
    out
}

/// Cepstral peak prominence: the largest cepstral value above its own linear
/// trend, over the quefrency band that covers voice F0 (≈0.5–10 ms).
///
/// **Provisional.** This is a relative linear value, not calibrated to Praat's
/// CPP definition; calibration against the Praat oracle is the S2.3 conformance
/// fixture. Returns `NaN` when the band is too small to measure.
pub fn cpp(cepstrum: &[f32], sample_rate: f32) -> f32 {
    if cepstrum.is_empty() || sample_rate <= 0.0 {
        return f32::NAN;
    }
    let q_min = ((sample_rate * 0.0005) as usize).max(1);
    let q_max = ((sample_rate * 0.010) as usize).min(cepstrum.len().saturating_sub(1));
    if q_max <= q_min + 1 {
        return f32::NAN;
    }

    let n = (q_max - q_min + 1) as f32;
    let (mut sx, mut sy, mut sxx, mut sxy) = (0.0f32, 0.0f32, 0.0f32, 0.0f32);
    for q in q_min..=q_max {
        let x = q as f32;
        let y = cepstrum[q];
        sx += x;
        sy += y;
        sxx += x * x;
        sxy += x * y;
    }
    let denom = n * sxx - sx * sx;
    let (slope, intercept) = if denom.abs() > f32::EPSILON {
        let slope = (n * sxy - sx * sy) / denom;
        (slope, (sy - slope * sx) / n)
    } else {
        (0.0, sy / n)
    };

    let mut peak = f32::NEG_INFINITY;
    for q in q_min..=q_max {
        let trend = slope * q as f32 + intercept;
        peak = peak.max(cepstrum[q] - trend);
    }
    if peak.is_finite() {
        peak
    } else {
        f32::NAN
    }
}
