//! sonorant-ffi — thin wasm-bindgen surface over `sonorant-analysis` (TDD §4.3).
//!
//! **No acoustic logic lives here.** Every method delegates to the `Analyzer`
//! contract; this crate only shapes the boundary. The `AnalysisFrame` array is
//! exposed as a contiguous `f32` block the JS side reads as a `Float32Array`
//! (TDD §4.4).
#![forbid(unsafe_code)]

use wasm_bindgen::prelude::*;

use sonorant_analysis::{
    AnalysisFrame, AnalysisParams, Analyzer, SessionAnalyzer, CORE_ABI_VERSION,
};
use sonorant_core::CORE_VERSION;

/// Words in one `AnalysisFrame` (TDD §4.4: 29 `f32` + 1 `u32` = 30).
pub const FRAME_WORDS: usize = 30;

#[wasm_bindgen]
pub struct Engine {
    inner: Box<dyn Analyzer>,
    scratch: Vec<AnalysisFrame>,
    sample_rate: u32,
}

#[wasm_bindgen]
impl Engine {
    #[wasm_bindgen(constructor)]
    pub fn new(sample_rate: u32) -> Engine {
        Engine {
            inner: Box::new(SessionAnalyzer::new(sample_rate)),
            scratch: Vec::new(),
            sample_rate,
        }
    }

    pub fn configure(&mut self, frame_len: usize, hop: usize, lpc_order: u16) {
        let mut params = AnalysisParams::new(self.sample_rate);
        params.frame_len = frame_len;
        params.hop = hop;
        params.lpc_order = lpc_order;
        self.inner.configure(params);
        self.scratch.clear();
    }

    /// Consume PCM and return how many frames are now readable via
    /// [`Engine::frames_ptr`] / [`Engine::frames_len`].
    pub fn push(&mut self, pcm: &[f32]) -> usize {
        let produced = self.inner.push(pcm);
        self.scratch.clear();
        if produced > 0 {
            self.scratch.resize(produced, AnalysisFrame::default());
            let written = self.inner.drain(&mut self.scratch);
            self.scratch.truncate(written);
        }
        self.scratch.len()
    }

    /// Pointer to the first `f32` of the contiguous frame array. Read
    /// `frames_len() * FRAME_WORDS` words as a `Float32Array` over
    /// `memory.buffer`.
    pub fn frames_ptr(&self) -> *const f32 {
        self.scratch.as_ptr() as *const f32
    }

    pub fn frames_len(&self) -> usize {
        self.scratch.len()
    }

    pub fn reset(&mut self) {
        self.inner.reset();
        self.scratch.clear();
    }

    pub fn core_version(&self) -> String {
        CORE_VERSION.to_string()
    }

    pub fn abi_version(&self) -> u32 {
        CORE_ABI_VERSION
    }
}

/// The startup guard a JS reader must call with the ABI version it was built for.
/// A mismatch is a hard startup failure, not a silent misread (TDD §9.5, §4.4).
pub fn require_abi(reader_abi: u32) -> Result<(), String> {
    if reader_abi == CORE_ABI_VERSION {
        Ok(())
    } else {
        Err(format!(
            "CORE_ABI_VERSION mismatch: core is {CORE_ABI_VERSION}, reader expects {reader_abi}. Update both to the same version."
        ))
    }
}
