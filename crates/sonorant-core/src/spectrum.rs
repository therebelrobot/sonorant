//! Real FFT wrappers (TDD §5: `realfft`/`rustfft` are the utility crates).

use realfft::RealFftPlanner;

/// Power spectrum `|X[k]|^2` for `k = 0..=len/2`.
///
/// Returns an empty vector for an empty frame. Never panics: an FFT failure
/// yields a zeroed spectrum rather than an abort.
pub fn power_spectrum(frame: &[f32]) -> Vec<f32> {
    if frame.is_empty() {
        return Vec::new();
    }
    let mut planner = RealFftPlanner::<f32>::new();
    let r2c = planner.plan_fft_forward(frame.len());
    let mut input = frame.to_vec();
    let mut spectrum = r2c.make_output_vec();
    if r2c.process(&mut input, &mut spectrum).is_err() {
        return vec![0.0; frame.len() / 2 + 1];
    }
    spectrum
        .iter()
        .map(|c| c.re * c.re + c.im * c.im)
        .collect()
}

/// Magnitude spectrum from a power spectrum: `sqrt(max(p, 0))`.
pub fn magnitude(power: &[f32]) -> Vec<f32> {
    power.iter().map(|p| p.max(0.0).sqrt()).collect()
}
