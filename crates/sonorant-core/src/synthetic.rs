//! Synthetic test signals: an impulse train through a cascade of known two-pole
//! resonators. This gives a signal with a known F0 and known formants, which is
//! what S1.1's acceptance criteria are checked against (and what the S1.4
//! fixture generator builds on).

/// Two-pole resonator coefficients `H(z) = 1 / (1 - a1 z^-1 - a2 z^-2)`.
fn resonator(freq_hz: f32, bandwidth_hz: f32, sample_rate: f32) -> (f32, f32) {
    let r = (-core::f32::consts::PI * bandwidth_hz / sample_rate).exp();
    let theta = 2.0 * core::f32::consts::PI * freq_hz / sample_rate;
    (2.0 * r * theta.cos(), -r * r)
}

/// A synthetic vowel: an impulse train at `f0_hz`, shaped by a cascade of
/// resonators given as `(frequency_hz, bandwidth_hz)` pairs, normalized to peak
/// amplitude 1.
pub fn vowel(f0_hz: f32, formants: &[(f32, f32)], sample_rate: f32, duration_s: f32) -> Vec<f32> {
    let n = (sample_rate * duration_s).max(0.0) as usize;
    if n == 0 {
        return Vec::new();
    }
    let mut x = vec![0.0f32; n];
    if f0_hz > 0.0 {
        let period = (sample_rate / f0_hz).round().max(1.0) as usize;
        // A short raised-cosine glottal pulse, not a unit impulse and not a wide
        // pulse. A unit impulse makes the autocorrelation near-singular; a wide
        // pulse has a spectral null below F2 and never excites the upper formants.
        let pulse_len = period.min(((0.0002 * sample_rate) as usize).max(2));
        let mut i = 0;
        while i < n {
            for k in 0..pulse_len {
                if i + k >= n {
                    break;
                }
                let w = if pulse_len == 1 {
                    1.0
                } else {
                    0.5
                        - 0.5
                            * (2.0 * core::f32::consts::PI * k as f32 / (pulse_len - 1) as f32)
                                .cos()
                };
                x[i + k] += w;
            }
            i += period;
        }
    }

    for &(freq, bw) in formants {
        let (a1, a2) = resonator(freq, bw, sample_rate);
        let mut y = vec![0.0f32; n];
        for k in 0..n {
            let y1 = if k >= 1 { y[k - 1] } else { 0.0 };
            let y2 = if k >= 2 { y[k - 2] } else { 0.0 };
            y[k] = x[k] + a1 * y1 + a2 * y2;
        }
        x = y;
    }

    // Glottal source + radiation: a shallow −6 dB/octave tilt, which is what the
    // pipeline's pre-emphasis (TDD §4.1) exists to compensate. Without it the
    // synthetic source is far brighter than a real voice and the pre-emphasis
    // biases the formant estimates upward.
    let a = (-2.0 * core::f32::consts::PI * 500.0 / sample_rate).exp();
    let mut prev = 0.0f32;
    for v in x.iter_mut() {
        let out = (1.0 - a) * *v + a * prev;
        prev = out;
        *v = out;
    }

    let peak = x.iter().fold(0.0f32, |m, v| m.max(v.abs()));
    if peak > 0.0 {
        for v in x.iter_mut() {
            *v /= peak;
        }
    }
    x
}
