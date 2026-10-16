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
use sonorant_archive::{
    Bundle, Counts, ManifestParams, SCHEMA_VERSION, describe, import_archive, read_manifest,
    write_archive,
};
use std::io::Cursor;

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

// --- Archive surface (TDD §8) --------------------------------------------------
//
// Thin wrappers over `sonorant-archive`. No archive logic lives here.

fn js_error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

/// A plain-language description of an archive, readable without a passphrase.
#[wasm_bindgen]
pub fn archive_describe(bytes: &[u8]) -> Result<String, String> {
    let manifest = read_manifest(Cursor::new(bytes)).map_err(js_error)?;
    Ok(describe(&manifest))
}

/// Build an archive from a bundle JSON. `passphrase: None` is a plaintext export.
#[wasm_bindgen]
pub fn archive_export(
    bundle_json: &str,
    core_version: &str,
    abi_version: u32,
    created_at: &str,
    passphrase: Option<String>,
) -> Result<Vec<u8>, String> {
    let bundle: Bundle = serde_json::from_str(bundle_json).map_err(js_error)?;
    let payload = serde_json::to_string(&bundle).map_err(js_error)?;

    let params = ManifestParams {
        core_version: core_version.to_string(),
        abi_version,
        schema_version: SCHEMA_VERSION,
        created_at: created_at.to_string(),
        encrypted: passphrase.is_some(),
        kdf: None,
        counts: Counts {
            sessions: bundle.sessions.len() as u64,
            utterances: bundle.utterances.len() as u64,
            recordings: 0,
        },
    };

    let mut buffer = Cursor::new(Vec::new());
    write_archive(&mut buffer, params, payload.as_bytes(), passphrase.as_deref()).map_err(js_error)?;
    Ok(buffer.into_inner())
}

/// Import an archive into an existing bundle; returns `{ bundle, report }` JSON.
#[wasm_bindgen]
pub fn archive_import(
    bytes: &[u8],
    existing_json: &str,
    passphrase: Option<String>,
) -> Result<String, String> {
    let existing: Bundle = serde_json::from_str(existing_json).map_err(js_error)?;
    let (merged, report) =
        import_archive(Cursor::new(bytes), passphrase.as_deref(), &existing).map_err(js_error)?;

    Ok(serde_json::json!({
        "bundle": merged,
        "report": {
            "added": report.added,
            "skipped": report.skipped,
            "conflicted": report.conflicted,
            "conflicts": report.conflicts,
            "line": report.line(),
        }
    })
    .to_string())
}
