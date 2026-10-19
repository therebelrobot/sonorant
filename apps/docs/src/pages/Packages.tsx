const NPM = [
  ["sonorant", "The WASM core wrapper. Ships the .wasm artifact and a typed loader that verifies the hash and ABI version at startup."],
  ["sonorant-cli", "The user-facing CLI, TypeScript + Ink. Orchestration and presentation only — no maths."],
  ["sonorant-react", "Reusable React visualizations: the pitch/resonance pad, trend chart, summary and meters."],
] as const;

const CRATES = [
  ["sonorant-core", "FFT wrappers, LPC, YIN, cepstrum, formants. No I/O, no target-specific code."],
  ["sonorant-analysis", "Frame pipeline, AnalysisFrame assembly, session state machine."],
  ["sonorant-calibrate", "Calibration store and dBFS → dB SPL conversion."],
  ["sonorant-archive", "History export/import container with AEAD."],
  ["sonorant-ffi", "The thin wasm-bindgen surface. No logic."],
  ["sonorant-capture", "Native capture (cpal) and device enumeration."],
  ["sonorant-cli", "The Rust batch analyser, conformance harness and fixture generator."],
] as const;

export function Packages() {
  return (
    <article className="prose">
      <h1>Packages</h1>
      <p className="lede">
        Everything below is built from one commit at one version. The Rust workspace version is the
        release version, and every npm manifest mirrors it.
      </p>

      <section aria-labelledby="npm">
        <h2 id="npm">npm</h2>
        <table>
          <thead>
            <tr>
              <th scope="col">Package</th>
              <th scope="col">What it is</th>
            </tr>
          </thead>
          <tbody>
            {NPM.map(([name, what]) => (
              <tr key={name}>
                <th scope="row">
                  <code>{name}</code>
                </th>
                <td>{what}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="note">
          The Rust crate <code>sonorant-cli</code> (crates.io) and the npm package{" "}
          <code>sonorant-cli</code> share a name on purpose. Name the registry when it is ambiguous.
        </p>
      </section>

      <section aria-labelledby="crates">
        <h2 id="crates">Rust crates</h2>
        <table>
          <thead>
            <tr>
              <th scope="col">Crate</th>
              <th scope="col">Responsibility</th>
            </tr>
          </thead>
          <tbody>
            {CRATES.map(([name, what]) => (
              <tr key={name}>
                <th scope="row">
                  <code>{name}</code>
                </th>
                <td>{what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="licence">
        <h2 id="licence">Licence and supply chain</h2>
        <p>
          Sonorant is public domain under the <a href="https://unlicense.org">Unlicense</a>.
          Dependencies are gated by <code>cargo-deny</code> to a licence allowlist, published
          artifacts carry provenance, and the shipped <code>.wasm</code> hash is recorded and
          compared at startup.
        </p>
      </section>
    </article>
  );
}
