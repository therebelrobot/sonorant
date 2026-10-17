import { Link } from "../App";

const PRINCIPLES = [
  ["Pitch and resonance are always visually separable", "They interact acoustically but are separately trainable; conflating them teaches the wrong skill."],
  ["Vowel identity is controlled before anything is in Hz", "A raw-Hz formant display mostly measures the vowel."],
  ["Every estimate carries a confidence", "The maths degrades fastest at high F0 — exactly where the primary users work."],
  ["Self-referential by default", "Compare against your own baseline, not a normative band."],
  ["No single composite score", "Not femininity, not voice quality, not progress."],
  ["Measurement and interpretation are visually distinct", "Anything reading as a judgement uses a different visual register."],
  ["Nothing diagnostic", "It measures. It does not classify, screen, or diagnose."],
  ["No backend, ever", "No server, no account, no telemetry, no audio egress."],
] as const;

export function Home() {
  return (
    <article className="prose">
      <h1>Sonorant</h1>
      <p className="lede">
        A local-first, open-source voice analysis and training tool. It measures the acoustic
        properties of a voice — pitch, formants/resonance, voice quality, and input integrity — and
        visualises them so a person training their voice can see what is actually changing.
      </p>
      <p>
        This site is for two audiences. If you write code, the{" "}
        <Link to="/guide">developer guide</Link> shows how to drive the Rust core from TypeScript, the
        npm wrapper, or the CLI. If you want to see what the measurements look like, the{" "}
        <Link to="/visualizations">visualizations</Link> page renders them live, from a recorded
        reference signal and — if you allow it — from your own microphone.
      </p>

      <section aria-labelledby="why">
        <h2 id="why">Why it exists</h2>
        <p>
          Voice modification is a slow, embodied skill. Progress depends on feedback, and the
          feedback available today is either a clinician&rsquo;s ear at infrequent appointments or a
          consumer app that measures the wrong quantity. People raise their pitch and plateau.
          Pitch is not the dominant cue for how a voice is gendered — vocal-tract resonance is — and
          resonance is rarely measured, because measuring it correctly means normalising out the
          vowel.
        </p>
        <p>Sonorant measures resonance, and gives it away.</p>
      </section>

      <section aria-labelledby="principles">
        <h2 id="principles">Non-negotiable principles</h2>
        <p>These are not aspirational; they constrain every feature, including the components on this site.</p>
        <dl className="principles">
          {PRINCIPLES.map(([title, body]) => (
            <div key={title} className="principles__row">
              <dt>{title}</dt>
              <dd>{body}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="next">
        <h2 id="next">Where to go</h2>
        <ul className="cards">
          <li className="card">
            <h3>
              <Link to="/guide">Developer guide</Link>
            </h3>
            <p>Load the WASM core, decode frames, and render them. Run the CLI over a WAV.</p>
          </li>
          <li className="card">
            <h3>
              <Link to="/visualizations">Visualizations</Link>
            </h3>
            <p>The pitch/resonance pad, the trend chart, and the confidence-bearing summary.</p>
          </li>
          <li className="card">
            <h3>
              <Link to="/packages">Packages</Link>
            </h3>
            <p>The npm packages and the Rust crates that ship together from one commit.</p>
          </li>
        </ul>
      </section>
    </article>
  );
}
