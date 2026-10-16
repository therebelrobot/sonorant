//! Frame preparation: windowing and pre-emphasis (TDD §4.1 analysis pipeline).

/// A Hann window of `len` samples. `len <= 1` returns all-ones (no window).
pub fn hann(len: usize) -> Vec<f32> {
    if len <= 1 {
        return vec![1.0; len];
    }
    let denom = (len - 1) as f32;
    (0..len)
        .map(|n| 0.5 - 0.5 * (2.0 * core::f32::consts::PI * n as f32 / denom).cos())
        .collect()
}

/// First-order pre-emphasis: `y[n] = x[n] - coeff * x[n-1]`, `y[0] = x[0]`.
///
/// Typical `coeff` is 0.97 (TDD §4.1).
pub fn pre_emphasis(input: &[f32], coeff: f32) -> Vec<f32> {
    let mut out = Vec::with_capacity(input.len());
    let mut prev = 0.0f32;
    for &x in input {
        out.push(x - coeff * prev);
        prev = x;
    }
    out
}

/// Multiply `input` by `window` sample-wise. Shorter input is not padded.
pub fn apply(input: &[f32], window: &[f32]) -> Vec<f32> {
    input
        .iter()
        .zip(window.iter())
        .map(|(x, w)| x * w)
        .collect()
}
