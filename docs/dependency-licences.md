# Dependency licence verification

**Status:** verified
**Verified:** 2026-10-16
**Method:** `crates.io` registry metadata (`GET /api/v1/crates/{crate}` → latest stable version's declared `license`), for each crate named in TDD §5.
**Authority:** TDD §5 (dependency register) and §16.1 (unverified licences open question). This record closes the phase-7 carry-forward item "Unverified dependency licences" for the crates below.
**Enforcement:** [`deny.toml`](../deny.toml) `[licenses]` allowlist, run by `cargo-deny` in CI.

## How to read the verdict column

- **Allow** — declared licence is inside the TDD §5 allowlist (MIT / Apache-2.0 / BSD-3-Clause / ISC / MPL-2.0 / Unlicense).
- **Allow (exception)** — inside the allowlist but carries a standing obligation (MPL file-level copyleft ⇒ use unmodified only).
- **Reference only** — must never become a dependency; read for prior art, then write the tracker in-house (TDD §5).
- **Evaluate** — may become a dependency only after the in-repo source is read; not currently a dependency.

## Registered crates (candidates for dependency)

| Crate | Latest stable | Declared licence | Inside allowlist? | Verdict |
|---|---|---|---|---|
| `rustfft` | 6.4.1 | MIT OR Apache-2.0 | yes | Allow |
| `realfft` | 3.5.0 | MIT | yes | Allow |
| `cpal` | 0.18.2 | Apache-2.0 | yes | Allow |
| `wasm-bindgen` | 0.2.129 | MIT OR Apache-2.0 | yes | Allow |
| `js-sys` | 0.3.106 | MIT OR Apache-2.0 | yes | Allow |
| `web-sys` | 0.3.106 | MIT OR Apache-2.0 | yes | Allow |
| `hound` | 3.5.1 | Apache-2.0 | yes | Allow |
| `symphonia` | 0.6.1 | MPL-2.0 | yes | Allow (exception) — use unmodified only |
| `serde` | 1.0.229 | MIT OR Apache-2.0 | yes | Allow |
| `serde_json` | 1.0.154 | MIT OR Apache-2.0 | yes | Allow |
| `chacha20poly1305` | 0.11.0 | Apache-2.0 OR MIT | yes | Allow |
| `argon2` | 0.6.0 | MIT OR Apache-2.0 | yes | Allow |
| `zip` | 9.0.4 | MIT | yes | Allow |
| `thiserror` | 2.0.21 | MIT OR Apache-2.0 | yes | Allow |

## Prior-art crates (must NOT become dependencies)

| Crate | Latest stable | Declared licence | Verdict |
|---|---|---|---|
| `pitch-detection` | 0.3.0 | MIT/Apache-2.0 | Evaluate → write in-house per de Cheveigné & Kawahara (2002) / McLeod & Wyvill (2005) (TDD §5) |
| `pyin-rs` | 0.1.0 | MIT | Evaluate → write in-house (TDD §5) |
| `loqa-voice-dsp` | 0.5.0 | MIT | Reference only — same product market (TDD §5) |
| `syne_audio_dsp` | 0.1.0 | MIT | Reference only — same product market (TDD §5) |

## Caveats

1. **Registry metadata is the author's declaration.** `crates.io` reports what the crate author wrote in `Cargo.toml`. Registry data is self-declared metadata, not a legal opinion; the SPDX identifier is what `cargo-deny` enforces.
2. **The gate enforces the declaration, not the intent.** `cargo-deny` reads each crate's declared licence and fails on anything outside the allowlist. MPL-2.0 is allowed by the allowlist; the "use unmodified only" obligation is recorded in [`deny.toml`](../deny.toml) and this table, because CI cannot see intent.
3. **Re-verify at the pin.** Licences can change between versions. `deny.toml`'s allowlist is version-independent, so re-run this record whenever a crate's version is bumped across a licence change; the CI gate will catch a disallowed change mechanically.
4. **Non-SPDX legacy expression.** `pitch-detection` declares `MIT/Apache-2.0` (legacy slash form). It is evaluate-only, so no allowlist entry is needed; if it were ever adopted, the expression must be resolved to a valid SPDX `OR` before the gate could pass.
