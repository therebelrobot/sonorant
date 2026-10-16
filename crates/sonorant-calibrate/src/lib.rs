//! sonorant-calibrate — calibration store and dBFS → dB SPL conversion (TDD §13).
//!
//! **SPL requires a real calibration.** A shipped default sensitivity is an
//! *estimate*, modelled as a distinct type that has no route to `spl_db`, so it
//! can never make an SPL value real. Without an active calibration, `spl_db`
//! stays `NaN` — never a zero or a fake axis.
//!
//! The calibration *flow* (capturing a reference tone) needs acoustic-calibrator
//! hardware and is tracked separately (see the calibration issue).
#![forbid(unsafe_code)]

/// The reference level a calibration is measured against (TDD §13): 1 kHz at 94 dB.
pub const REFERENCE_SPL_DB: f32 = 94.0;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Method {
    Calibrator,
    ReferenceTone,
}

impl Method {
    pub fn as_str(self) -> &'static str {
        match self {
            Method::Calibrator => "calibrator",
            Method::ReferenceTone => "reference_tone",
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Calibration {
    pub id: String,
    pub device_class: String,
    pub mic_model: Option<String>,
    /// The measured level, in dBFS, for a 94 dB SPL reference tone.
    pub sensitivity_dbfs_at_94db: f32,
    pub method: Method,
    pub measured_at: i64,
}

/// A shipped default sensitivity for a device class. Deliberately **not** a
/// [`Calibration`]: it cannot be passed to [`spl_db`].
#[derive(Clone, Debug, PartialEq)]
pub struct SensitivityEstimate {
    pub device_class: String,
    pub sensitivity_dbfs_at_94db: f32,
}

/// `SPL = dBFS - sensitivity(dBFS at 94 dB SPL) + 94`.
pub fn dbfs_to_spl(dbfs: f32, sensitivity_dbfs_at_94db: f32) -> f32 {
    dbfs - sensitivity_dbfs_at_94db + REFERENCE_SPL_DB
}

/// The SPL for a frame's RMS level. `NaN` unless a real calibration is active.
pub fn spl_db(rms_dbfs: f32, calibration: Option<&Calibration>) -> f32 {
    match calibration {
        Some(c) if rms_dbfs.is_finite() && c.sensitivity_dbfs_at_94db.is_finite() => {
            dbfs_to_spl(rms_dbfs, c.sensitivity_dbfs_at_94db)
        }
        _ => f32::NAN,
    }
}

/// Per-device calibration store. The first calibration added becomes active.
#[derive(Debug, Default)]
pub struct CalibrationStore {
    entries: Vec<Calibration>,
    active: Option<String>,
}

impl CalibrationStore {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn add(&mut self, calibration: Calibration) {
        if self.active.is_none() {
            self.active = Some(calibration.id.clone());
        }
        self.entries.push(calibration);
    }

    /// Make a stored calibration active. Returns false if it is not known.
    pub fn set_active(&mut self, id: &str) -> bool {
        if self.entries.iter().any(|c| c.id == id) {
            self.active = Some(id.to_string());
            true
        } else {
            false
        }
    }

    pub fn clear_active(&mut self) {
        self.active = None;
    }

    pub fn active(&self) -> Option<&Calibration> {
        let id = self.active.as_ref()?;
        self.entries.iter().find(|c| &c.id == id)
    }

    pub fn entries(&self) -> &[Calibration] {
        &self.entries
    }
}
