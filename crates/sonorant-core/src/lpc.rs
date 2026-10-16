//! Linear prediction: autocorrelation, Levinson-Durbin, LPC coefficients.

/// Autocorrelation `r[0..=order]` of `frame`.
pub fn autocorrelation(frame: &[f32], order: usize) -> Vec<f32> {
    let n = frame.len();
    let mut r = vec![0.0f32; order + 1];
    for k in 0..=order {
        if k >= n {
            break;
        }
        let mut sum = 0.0f32;
        for i in k..n {
            sum += frame[i] * frame[i - k];
        }
        r[k] = sum;
    }
    r
}

/// Levinson-Durbin recursion. Returns predictor coefficients `alpha[0..=order]`
/// with `alpha[0] = 0`, so the predictor is `x_hat[n] = sum alpha[j] x[n-j]` and
/// the error filter is `A(z) = 1 - sum alpha[j] z^-j`.
///
/// A silent (zero-energy) frame yields all-zeros rather than NaN.
pub fn levinson_durbin(r: &[f32], order: usize) -> Vec<f32> {
    let mut alpha = vec![0.0f32; order + 1];
    let r0 = r.first().copied().unwrap_or(0.0);
    if r0 <= 0.0 {
        return alpha;
    }
    let mut err = r0;
    for i in 1..=order {
        let mut acc = r.get(i).copied().unwrap_or(0.0);
        for j in 1..i {
            acc -= alpha[j] * r[i - j];
        }
        let k = if err > 0.0 { acc / err } else { 0.0 };
        let prev = alpha.clone();
        alpha[i] = k;
        for j in 1..i {
            alpha[j] = prev[j] - k * prev[i - j];
        }
        err *= 1.0 - k * k;
        if err <= 0.0 {
            break;
        }
    }
    alpha
}

/// LPC analysis filter coefficients `A[0..=order]` with `A[0] = 1`, i.e.
/// `A(z) = 1 + sum_{j>=1} A[j] z^-j`. Roots of `A(z)` give the formants.
pub fn lpc_coefficients(frame: &[f32], order: usize) -> Vec<f32> {
    let mut r = autocorrelation(frame, order);
    // Standard white-noise correction: a tiny lift on r[0] keeps the Levinson
    // recursion well-conditioned when the autocorrelation is near-singular.
    if let Some(r0) = r.first_mut() {
        if *r0 > 0.0 {
            *r0 *= 1.0 + 1e-4;
        }
    }
    let alpha = levinson_durbin(&r, order);
    let mut a = vec![0.0f32; order + 1];
    a[0] = 1.0;
    for j in 1..=order {
        a[j] = -alpha[j];
    }
    a
}
