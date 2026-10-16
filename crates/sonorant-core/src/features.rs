//! Scalar frame features (TDD §4.1): level, spectral shape, and harmonics.

/// Level floor in dBFS, used instead of `-inf` for silence so the core never
/// emits a non-finite value here (TDD §14).
pub const DBFS_FLOOR: f32 = -160.0;

/// Ceiling in dBFS, reached only by out-of-range input. A signal in `[-1, 1]`
/// cannot exceed 0 dBFS; this exists so an infinite sample yields a finite value.
pub const DBFS_CEILING: f32 = 60.0;

/// RMS level in dBFS for a signal nominally in `[-1, 1]`. Silence returns
/// [`DBFS_FLOOR`]; out-of-range input is clamped to `[DBFS_FLOOR, DBFS_CEILING]`.
pub fn rms_dbfs(frame: &[f32]) -> f32 {
    if frame.is_empty() {
        return DBFS_FLOOR;
    }
    let mean_square = frame.iter().map(|x| x * x).sum::<f32>() / frame.len() as f32;
    if mean_square <= 0.0 || mean_square.is_nan() {
        return DBFS_FLOOR;
    }
    let dbfs = 10.0 * mean_square.log10();
    if dbfs.is_nan() {
        DBFS_FLOOR
    } else {
        dbfs.clamp(DBFS_FLOOR, DBFS_CEILING)
    }
}

/// Spectral centroid in Hz from a magnitude spectrum.
pub fn centroid_hz(magnitude: &[f32], sample_rate: f32) -> f32 {
    if magnitude.len() < 2 || sample_rate <= 0.0 {
        return 0.0;
    }
    // magnitude has len = n/2 + 1, so the original frame length is 2*(len-1).
    let bin_hz = sample_rate / (2.0 * (magnitude.len() as f32 - 1.0));
    let mut num = 0.0f32;
    let mut den = 0.0f32;
    for (k, &m) in magnitude.iter().enumerate() {
        num += k as f32 * bin_hz * m;
        den += m;
    }
    if den > 0.0 {
        let centroid = num / den;
        if centroid.is_finite() {
            centroid
        } else {
            0.0
        }
    } else {
        0.0
    }
}

/// Long-term average spectral tilt in dB per octave: the slope of a least-squares
/// line through `20*log10(magnitude)` against `log2(frequency)`.
pub fn spectral_tilt_db_per_oct(magnitude: &[f32], sample_rate: f32) -> f32 {
    if magnitude.len() < 2 || sample_rate <= 0.0 {
        return 0.0;
    }
    let bin_hz = sample_rate / (2.0 * (magnitude.len() as f32 - 1.0));
    let floor = 1e-9f32;
    let (mut sx, mut sy, mut sxx, mut sxy, mut n) = (0.0f32, 0.0f32, 0.0f32, 0.0f32, 0.0f32);
    for (k, &m) in magnitude.iter().enumerate() {
        if k == 0 || m <= floor {
            continue;
        }
        let x = (k as f32 * bin_hz).log2();
        let y = 20.0 * m.log10();
        sx += x;
        sy += y;
        sxx += x * x;
        sxy += x * y;
        n += 1.0;
    }
    let denom = n * sxx - sx * sx;
    let slope = if n >= 2.0 && denom.abs() > f32::EPSILON {
        (n * sxy - sx * sy) / denom
    } else {
        0.0
    };
    if slope.is_finite() {
        slope
    } else {
        0.0
    }
}

/// Difference in dB between the first two harmonics (H1 − H2), a rough
/// vocal-weight proxy. Returns `NaN` for an unvoiced frame (`f0_hz <= 0`), which
/// is a documented non-finite case.
pub fn h1_h2_db(magnitude: &[f32], sample_rate: f32, f0_hz: f32) -> f32 {
    if magnitude.len() < 2 || sample_rate <= 0.0 || f0_hz <= 0.0 {
        return f32::NAN;
    }
    let bin_hz = sample_rate / (2.0 * (magnitude.len() as f32 - 1.0));
    let floor = 1e-9f32;
    let amp_db = |freq: f32| -> Option<f32> {
        let k = (freq / bin_hz).round() as usize;
        magnitude.get(k).copied().filter(|m| *m > floor).map(|m| 20.0 * m.log10())
    };
    match (amp_db(f0_hz), amp_db(2.0 * f0_hz)) {
        (Some(h1), Some(h2)) => h1 - h2,
        _ => f32::NAN,
    }
}

/// Harmonics-to-noise ratio in dB, from the normalized autocorrelation at the
/// pitch period (Boersma's method). `NaN` for an unvoiced frame.
pub fn hnr_db(frame: &[f32], sample_rate: f32, f0_hz: f32) -> f32 {
    if frame.is_empty() || sample_rate <= 0.0 || f0_hz <= 0.0 {
        return f32::NAN;
    }
    let lag = (sample_rate / f0_hz).round() as usize;
    if lag == 0 || lag >= frame.len() {
        return f32::NAN;
    }
    let r0: f32 = frame.iter().map(|x| x * x).sum();
    if r0 <= 0.0 {
        return f32::NAN;
    }
    let mut r_lag = 0.0f32;
    for i in lag..frame.len() {
        r_lag += frame[i] * frame[i - lag];
    }
    let r = r_lag / r0;
    if r <= 0.0 || r >= 1.0 {
        return f32::NAN;
    }
    10.0 * (r / (1.0 - r)).log10()
}
