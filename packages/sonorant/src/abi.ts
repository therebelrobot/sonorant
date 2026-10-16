// Mirrors crates/sonorant-ffi/abi/frame_layout.v1.json.
// The Rust ABI test (crates/sonorant-ffi/tests/abi.rs) is the authority; these
// constants must match it, and the loader fails hard on a mismatch.
export const CORE_ABI_VERSION = 1;
export const FRAME_WORDS = 30;
