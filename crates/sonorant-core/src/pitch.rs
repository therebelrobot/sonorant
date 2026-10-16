//! Pitch detection via YIN (de Cheveigné & Kawahara, 2002), written in-house
//! (TDD §5: trackers are implemented here, not depended on).

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Pitch {
    /// Fundamental frequency in Hz. `<= 0.0` means unvoiced.
    pub f0_hz: f32,
    /// 0..1: one minus the YIN aperiodicity at the chosen lag.
    pub confidence: f32,
}

pub const DEFAULT_MIN_F0_HZ: f32 = 60.0;
pub const DEFAULT_MAX_F0_HZ: f32 = 1200.0;
pub const DEFAULT_THRESHOLD: f32 = 0.15;

/// YIN pitch estimate for `frame`.
///
/// Returns `f0_hz <= 0.0` (unvoiced) for silence, silence-like input, or an
/// unvoiced frame rather than a spurious value.
pub fn yin(
    frame: &[f32],
    sample_rate: f32,
    min_f0_hz: f32,
    max_f0_hz: f32,
    threshold: f32,
) -> Pitch {
    const UNVOICED: Pitch = Pitch {
        f0_hz: 0.0,
        confidence: 0.0,
    };

    let n = frame.len();
    if n < 4 || sample_rate <= 0.0 || min_f0_hz <= 0.0 || max_f0_hz <= min_f0_hz {
        return UNVOICED;
    }
    let tau_min = (sample_rate / max_f0_hz).floor().max(2.0) as usize;
    let tau_max = ((sample_rate / min_f0_hz).ceil() as usize).min(n / 2);
    if tau_max <= tau_min + 1 {
        return UNVOICED;
    }
    let w = n - tau_max; // comparison window
    if w == 0 {
        return UNVOICED;
    }

    // Difference function.
    let mut d = vec![0.0f32; tau_max + 1];
    for tau in 1..=tau_max {
        let mut sum = 0.0f32;
        for j in 0..w {
            let diff = frame[j] - frame[j + tau];
            sum += diff * diff;
        }
        d[tau] = sum;
    }

    // Cumulative mean normalized difference.
    let mut cmnd = vec![1.0f32; tau_max + 1];
    let mut running = 0.0f32;
    for tau in 1..=tau_max {
        running += d[tau];
        cmnd[tau] = if running > 0.0 {
            d[tau] * tau as f32 / running
        } else {
            1.0
        };
    }

    // Absolute threshold; descend to the local minimum.
    let mut tau = tau_min;
    let mut found = None;
    while tau < tau_max {
        if cmnd[tau] < threshold {
            while tau + 1 < tau_max && cmnd[tau + 1] < cmnd[tau] {
                tau += 1;
            }
            found = Some(tau);
            break;
        }
        tau += 1;
    }
    let t = match found {
        Some(t) => t,
        None => return UNVOICED,
    };

    // Parabolic interpolation around the minimum.
    let tau_est = if t > 0 && t + 1 <= tau_max {
        let (y0, y1, y2) = (cmnd[t - 1], cmnd[t], cmnd[t + 1]);
        let denom = 2.0 * (2.0 * y1 - y2 - y0);
        if denom.abs() > f32::EPSILON {
            t as f32 + (y2 - y0) / denom
        } else {
            t as f32
        }
    } else {
        t as f32
    };
    if !(tau_est > 0.0) {
        return UNVOICED;
    }

    let idx = (tau_est.round() as usize).min(tau_max);
    let aperiodicity = cmnd[idx].clamp(0.0, 1.0);
    Pitch {
        f0_hz: sample_rate / tau_est,
        confidence: (1.0 - aperiodicity).clamp(0.0, 1.0),
    }
}
