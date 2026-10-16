# Conformance fixtures

**Authority:** TDD §5 (Praat is an offline oracle that ships nothing) and §14 (testing).

Conformance checks that the core's measures match an independent oracle within the
documented tolerance bands ([`docs/measure-tolerances.md`](measure-tolerances.md)). It
runs in CI via `crates/sonorant-cli/tests/conformance.rs`.

## Oracle schema

An oracle fixture is JSON in `fixtures/oracle/`:

```json
{
  "oracle_format": 1,
  "source": "praat",
  "reference": "fixtures/reference/vowel-150.wav",
  "description": "...",
  "measures": {
    "f0_hz": { "expected": 150.0, "tolerance_rel": 0.02 },
    "formants_hz": [
      { "expected": 700.0, "tolerance_rel": 0.1 }
    ]
  }
}
```

- `source` names where the expected values came from. `synthetic-truth` means the exact
  parameters of a synthetic reference; `praat` means measured in Praat.
- `reference` is the WAV, relative to the repo root.

The harness regenerates our measured values with `sonorant-cli fixture` and asserts each
measure is within `tolerance_rel` of `expected`. A measure outside its band fails the
build.

## Current fixtures

| Fixture | Source | Notes |
|---|---|---|
| `fixtures/oracle/vowel-150.json` | `synthetic-truth` | Exact resonator parameters for the synthetic reference. |

## Producing a Praat oracle (pending)

Praat is GPL and ships nothing; it is an offline oracle run on a developer machine. To
add a real-recording oracle:

1. Choose a reference WAV and place it in `fixtures/reference/`.
2. In Praat, open the WAV and measure:
   - **F0** — the median pitch over the voiced portion.
   - **Formants** — the first three formant frequencies at the steadiest point.
   Record the analysis settings (window length, max formant, pre-emphasis) in
   `description`: a formant measurement is meaningless without them.
3. Write an oracle fixture with `"source": "praat"` and the measured values, using the
   bands from `docs/measure-tolerances.md`.
4. Run `cargo test -p sonorant-cli --test conformance`.

If a measure is outside its band, that is a `CORE_VERSION` decision (TDD §9), not a test
to relax.
