import { Code } from "../components/Code";
import { Link } from "../App";

export function Guide() {
  return (
    <article className="prose">
      <h1>Developer guide</h1>
      <p className="lede">
        TypeScript is the UI and orchestration layer only. All acoustic maths lives in the Rust core,
        compiled to WASM for the browser and to native for the CLI and desktop. You drive the same
        core through the same contract from every surface.
      </p>

      <section aria-labelledby="install">
        <h2 id="install">Install</h2>
        <Code label="shell">{`npm install sonorant           # the WASM core wrapper
npm install sonorant-react     # optional: ready-made React visualizations`}</Code>
        <p>
          <code>sonorant</code> ships the <code>.wasm</code> core plus a typed loader that verifies
          the artifact&rsquo;s hash and ABI version at startup. <code>sonorant-react</code> is a
          peer of React <code>&gt;=18</code> and contains no maths — it draws what the core measured.
        </p>
      </section>

      <section aria-labelledby="load">
        <h2 id="load">Load the core and analyse PCM</h2>
        <p>
          The core takes mono <code>Float32Array</code> PCM and emits frames. Configure it once, then
          push audio as it arrives.
        </p>
        <Code label="analyse.ts">{`import { loadEngine, framesView, decodeFrames } from "sonorant";

const engine = await loadEngine(48000);   // sample rate of your audio context
engine.configure(2048, 512, 24);          // frame length, hop, LPC order

function onAudio(pcm: Float32Array) {
  engine.push(pcm);
  const frames = decodeFrames(framesView(engine));  // re-read the view after every push
  render(frames);
}`}</Code>
        <p className="note">
          The frame block is a flat <code>Float32Array</code> over the WASM memory, so re-create the
          view after each push — the buffer can move.
        </p>
      </section>

      <section aria-labelledby="frames">
        <h2 id="frames">What a frame contains</h2>
        <p>
          Each frame carries pitch with its confidence, up to five formants with confidences, voice
          quality (HNR, CPP, spectral tilt, H1–H2, centroid), the session-relative formant scale in
          semitones, level, jitter and shimmer, and a bitfield of input-integrity flags.
        </p>
        <Code label="TypeScript">{`interface VoiceFrame {
  t_ms: number;
  f0_hz: number;                 // <= 0 means unvoiced
  f0_confidence: number;         // 0..1
  formants: { hz: number; bandwidth_hz: number; confidence: number }[];
  hnr_db: number;
  cpp_db: number;
  scale_semitones: number;       // resonance, relative to the session baseline
  spl_db: number;                // NaN until a calibration is attached
  flags: number;                 // CLIPPED | LOW_SNR | CREAK | SUBHARMONIC | ...
}`}</Code>
        <p className="note">
          A frame without a confidence is not displayable, and a value the core could not measure is{" "}
          <code>NaN</code> — not zero. <code>spl_db</code> stays <code>NaN</code> until a real
          calibration exists.
        </p>
      </section>

      <section aria-labelledby="render">
        <h2 id="render">Render with sonorant-react</h2>
        <Code label="Live.tsx">{`import { VoicePad, FrameSummary, QualityMeters } from "sonorant-react";
import "sonorant-react/styles.css";

export function Live({ frames }) {
  const latest = frames.at(-1);
  return (
    <>
      <VoicePad frames={frames} />
      {latest && <FrameSummary frame={latest} />}
      {latest && <QualityMeters frame={latest} />}
    </>
  );
}`}</Code>
        <p>
          Every component pairs its chart with a written alternative and spells confidence out in
          text, because nothing here may be conveyed by colour alone. See the{" "}
          <Link to="/visualizations">visualizations page</Link> for a running example, and the{" "}
          <Link to="/packages">packages page</Link> for the full export list.
        </p>
      </section>

      <section aria-labelledby="cli">
        <h2 id="cli">The command-line tools</h2>
        <p>
          The native Rust binary is the batch analyser and fixture generator; the npm{" "}
          <code>sonorant-cli</code> is the user-facing Ink front end. Both drive the same core.
        </p>
        <Code label="shell">{`# Analyse a WAV to CSV on stdout (frame per row).
sonorant-cli analyse recording.wav --session > frames.csv

# Write a regression fixture (JSON) for the conformance suite.
sonorant-cli fixture recording.wav --out fixtures/reference/recording.json

# Generate a synthetic reference vowel.
sonorant-cli synth --f0 200 --formant-scale 1.1 --out reference.wav`}</Code>
        <p className="note">
          <code>--session</code> applies the session baseline, so <code>scale_semitones</code> is
          meaningful. Without it the column is present but zero — the raw framing does not know the
          session.
        </p>
      </section>

      <section aria-labelledby="build">
        <h2 id="build">Build from source</h2>
        <Code label="shell">{`npm ci
npm run wasm:build   # regenerate packages/sonorant/pkg from crates/sonorant-ffi
npm run build        # the web bundle, the docs site, and the npm packages
npm test             # node tests + the Rust conformance suite
cargo build --release -p sonorant-cli`}</Code>
        <p>
          After <code>wasm:build</code>, update <code>EXPECTED_WASM_SHA256</code> in{" "}
          <code>packages/sonorant/src/wasm-hash.ts</code> to the new digest for the same commit.
        </p>
      </section>

      <section aria-labelledby="architecture">
        <h2 id="architecture">Architecture, in brief</h2>
        <ul>
          <li>
            <strong>One core, four targets.</strong> The same Rust core compiles to{" "}
            <code>wasm32-unknown-unknown</code>, native desktop/mobile (Tauri 2), a native CLI, and
            arm64 Linux.
          </li>
          <li>
            <strong>No acoustic maths in TypeScript, ever</strong> — not even a fallback. A second
            implementation is how the two diverge silently.
          </li>
          <li>
            <strong>Pure, portable core.</strong> <code>sonorant-core</code> and{" "}
            <code>sonorant-analysis</code> have no I/O and no target-specific code, and forbid unsafe
            code.
          </li>
          <li>
            <strong>No network client exists in the codebase.</strong> The shipped app&rsquo;s CSP is{" "}
            <code>connect-src &apos;none&apos;</code>, and CI scans the built bundle for any external
            origin.
          </li>
          <li>
            <strong>Measure versioning.</strong> Every stored record carries the core version that
            produced it; charts must not splice across a version change without marking it.
          </li>
        </ul>
      </section>
    </article>
  );
}
