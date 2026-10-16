//! Formant estimation from LPC coefficients (TDD §4.1).
//!
//! The root-finder recovers the poles of the all-pole model; a pole's angle gives
//! its frequency and its radius gives its bandwidth.
//!
//! **Confidence is a single-frame proxy** here: it falls off with pole bandwidth.
//! The TDD's definition also tempers confidence by pole stability across
//! neighbouring frames, which needs frame-to-frame state and is added in the S2.1
//! pipeline.

use crate::complex::Complex;

#[derive(Clone, Copy, Debug, Default, PartialEq)]
#[repr(C)]
pub struct Formant {
    pub hz: f32,
    pub bandwidth_hz: f32,
    /// 0..1.
    pub confidence: f32,
}

pub const MAX_FORMANTS: usize = 5;

/// Bandwidth at which confidence reaches zero (Hz).
const CONFIDENCE_BANDWIDTH_HZ: f32 = 400.0;
/// Poles wider than this are treated as non-formant.
const MAX_BANDWIDTH_HZ: f32 = 700.0;

/// Formants from LPC coefficients `a` (`a[0] = 1`), sorted by frequency and
/// truncated to [`MAX_FORMANTS`]. Returns an empty list for silence or non-finite
/// input.
pub fn lpc_formants(a: &[f32], sample_rate: f32, max_formant_hz: f32) -> Vec<Formant> {
    let order = a.len().saturating_sub(1);
    if order == 0 || sample_rate <= 0.0 || !a.iter().all(|c| c.is_finite()) {
        return Vec::new();
    }

    let sr = sample_rate as f64;
    let mut out = Vec::new();
    for z in poly_roots(a) {
        if !z.re.is_finite() || !z.im.is_finite() || z.im <= 0.0 {
            continue;
        }
        let mag = z.norm();
        if !mag.is_finite() || mag <= 0.0 || mag >= 1.0 {
            continue;
        }
        let hz = z.im.atan2(z.re) * sr / (2.0 * core::f64::consts::PI);
        let bandwidth = -mag.ln() * sr / core::f64::consts::PI;
        if !hz.is_finite()
            || !bandwidth.is_finite()
            || hz <= 0.0
            || hz >= max_formant_hz as f64
            || bandwidth <= 0.0
            || bandwidth >= MAX_BANDWIDTH_HZ as f64
        {
            continue;
        }
        let bandwidth_hz = bandwidth as f32;
        out.push(Formant {
            hz: hz as f32,
            bandwidth_hz,
            confidence: (1.0 - bandwidth_hz / CONFIDENCE_BANDWIDTH_HZ).clamp(0.0, 1.0),
        });
    }
    out.sort_by(|x, y| x.hz.partial_cmp(&y.hz).unwrap_or(core::cmp::Ordering::Equal));
    out.truncate(MAX_FORMANTS);
    out
}

/// Roots of `A(z) = a[0] + a[1] z^-1 + ... + a[p] z^-p`, as a monic polynomial in
/// `z` via Durand-Kerner. `a[0]` must be 1.
fn poly_roots(a: &[f32]) -> Vec<Complex> {
    let p = a.len() - 1;
    // c[m] z^m with c[m] = a[p - m]; c[p] = a[0] = 1 (monic).
    let c: Vec<Complex> = (0..=p).map(|m| Complex::new(a[p - m] as f64, 0.0)).collect();

    let seed = Complex::new(0.4, 0.9);
    let mut acc = Complex::ONE;
    let mut z = Vec::with_capacity(p);
    for _ in 0..p {
        acc = acc * seed;
        z.push(acc);
    }

    for _ in 0..500 {
        let mut max_delta = 0.0f64;
        for i in 0..p {
            let mut denom = Complex::ONE;
            for j in 0..p {
                if j != i {
                    denom = denom * (z[i] - z[j]);
                }
            }
            if denom.norm() < 1e-30 {
                continue;
            }
            let delta = horner(&c, z[i]) / denom;
            if !delta.re.is_finite() || !delta.im.is_finite() {
                continue;
            }
            z[i] = z[i] - delta;
            max_delta = max_delta.max(delta.norm());
        }
        if max_delta < 1e-12 {
            break;
        }
    }
    z
}

/// Horner evaluation of `c` (ascending powers) at `x`.
fn horner(c: &[Complex], x: Complex) -> Complex {
    let mut acc = Complex::ZERO;
    for &coef in c.iter().rev() {
        acc = acc * x + coef;
    }
    acc
}

#[cfg(test)]
mod tests {
    use super::*;

    fn convolve(a: &[f32], b: &[f32]) -> Vec<f32> {
        let mut c = vec![0.0f32; a.len() + b.len() - 1];
        for (i, &x) in a.iter().enumerate() {
            for (j, &y) in b.iter().enumerate() {
                c[i + j] += x * y;
            }
        }
        c
    }

    #[test]
    fn roots_of_known_poles() {
        let sr = 44100.0f32;
        let mut a = vec![1.0f32];
        for &(f, bw) in &[(700.0f32, 80.0f32), (1220.0, 90.0), (2600.0, 120.0)] {
            let r = (-core::f32::consts::PI * bw / sr).exp();
            let theta = 2.0 * core::f32::consts::PI * f / sr;
            let section = [1.0, -2.0 * r * theta.cos(), r * r];
            a = convolve(&a, &section);
        }
        let fs = lpc_formants(&a, sr, 5500.0);
        assert!(fs.len() >= 3, "got {} formants", fs.len());
        for (f, &e) in fs.iter().zip([700.0f32, 1220.0, 2600.0].iter()) {
            assert!(((f.hz - e) / e).abs() < 0.02, "expected {e}, got {}", f.hz);
        }
    }
}
