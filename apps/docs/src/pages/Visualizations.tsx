import { useEffect, useMemo, useState } from "react";
import {
  FlagList,
  FrameSummary,
  QualityMeters,
  TrendChart,
  VoicePad,
  buildTrendSeries,
  channelLabel,
  meanFormantConfidence,
  prefersReducedMotion,
  segmentDistribution,
  trendTextAlternative,
} from "sonorant-react";
import type { TrendPoint, VoiceFrame } from "sonorant-react";

import { FIXTURES } from "../demo/fixtures";
import { useLiveCapture } from "../demo/useLiveCapture";

const MAX_LIVE_FRAMES = 240;
const FRAME_MS = 40;

/** Build a trend series from a frame sequence, tagging one core version. */
function seriesFromFrames(frames: VoiceFrame[], channel: string, coreVersion = "0.4.0") {
  const points: TrendPoint[] = frames
    .filter((f) => Number.isFinite(f.scale_semitones))
    .map((f) => ({
      t_ms: f.t_ms,
      value: channel === "f0" ? f.f0_hz : f.scale_semitones,
      confidence: meanFormantConfidence(f),
      coreVersion,
    }));
  return buildTrendSeries({ channel, points });
}

/**
 * An explicitly illustrative series for the version-boundary behaviour. It is not
 * a measurement — the caption says so — but it is the only honest way to show the
 * chart stopping at a change in the software without shipping a second core.
 */
const ILLUSTRATIVE_BOUNDARY = buildTrendSeries({
  channel: "scale",
  points: [
    { t_ms: 0, value: -1.2, confidence: 0.8, coreVersion: "0.3.0" },
    { t_ms: 1, value: -0.8, confidence: 0.8, coreVersion: "0.3.0" },
    { t_ms: 2, value: -0.4, confidence: 0.8, coreVersion: "0.3.0" },
    { t_ms: 3, value: -0.9, confidence: 0.8, coreVersion: "0.4.0" },
  ],
});

export function Visualizations() {
  const reducedMotion = useMemo(() => prefersReducedMotion(), []);
  const [fixtureId, setFixtureId] = useState(FIXTURES[0]?.id ?? "glide");
  const fixture = FIXTURES.find((f) => f.id === fixtureId) ?? (FIXTURES[0] as (typeof FIXTURES)[number]);
  const [cursor, setCursor] = useState(fixture.frames.length - 1);
  const [playing, setPlaying] = useState(false);
  const [mode, setMode] = useState<"fixture" | "live">("fixture");
  const [liveFrames, setLiveFrames] = useState<VoiceFrame[]>([]);

  const live = useLiveCapture((incoming) => {
    setLiveFrames((previous) => [...previous, ...incoming].slice(-MAX_LIVE_FRAMES));
  });

  // A new fixture resets the scrubber to "all frames".
  useEffect(() => {
    setCursor(fixture.frames.length - 1);
    setPlaying(false);
  }, [fixture]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setCursor((current) => {
        if (current >= fixture.frames.length - 1) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, FRAME_MS);
    return () => window.clearInterval(id);
  }, [playing, fixture]);

  const shown: VoiceFrame[] =
    mode === "live" ? liveFrames : fixture.frames.slice(0, cursor + 1);
  const current = shown[shown.length - 1];

  const series = seriesFromFrames(shown, "scale");
  const alt = trendTextAlternative(series);
  const distribution = series.segments
    .map((segment) => {
      const d = segmentDistribution(segment.points);
      return d ? `${segment.coreVersion}: p50 ${d.p50.toFixed(1)} (n=${segment.points.length})` : null;
    })
    .filter(Boolean)
    .join("; ");

  return (
    <article className="prose prose--wide">
      <h1>Visualizations</h1>
      <p className="lede">
        These are the <code>sonorant-react</code> components rendering real analysis output. The
        recorded fixtures were produced by the native Rust core (
        <code>scripts/demo-fixture.mjs</code>); the live mode drives the same WASM core from your
        microphone.
      </p>

      <section aria-labelledby="controls" className="demo-controls">
        <h2 id="controls" className="visually-hidden">
          Controls
        </h2>
        <div role="group" aria-label="Data source">
          <button
            type="button"
            aria-pressed={mode === "fixture"}
            onClick={() => {
              setMode("fixture");
              live.stop();
            }}
          >
            Recorded fixture
          </button>
          <button type="button" aria-pressed={mode === "live"} onClick={() => setMode("live")}>
            Live microphone
          </button>
        </div>

        {mode === "fixture" ? (
          <div role="group" aria-label="Fixture playback" className="demo-controls__row">
            <label>
              Fixture{" "}
              <select value={fixtureId} onChange={(e) => setFixtureId(e.target.value)}>
                {FIXTURES.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => {
                if (cursor >= fixture.frames.length - 1) setCursor(0);
                setPlaying((p) => !p);
              }}
              disabled={reducedMotion}
            >
              {playing ? "Pause" : "Play"}
            </button>
            <label>
              Frame {cursor + 1} of {fixture.frames.length}{" "}
              <input
                type="range"
                min={0}
                max={fixture.frames.length - 1}
                value={cursor}
                onChange={(e) => {
                  setPlaying(false);
                  setCursor(Number(e.target.value));
                }}
              />
            </label>
            {reducedMotion && (
              <p className="note" role="status">
                Animation is disabled because your system asks for reduced motion. Use the slider to
                step through frames.
              </p>
            )}
          </div>
        ) : (
          <div role="group" aria-label="Live capture" className="demo-controls__row">
            {live.status !== "running" ? (
              <button type="button" onClick={() => void live.start()}>
                {live.status === "starting" ? "Starting…" : "Start microphone"}
              </button>
            ) : (
              <button type="button" onClick={() => void live.stop()}>
                Stop
              </button>
            )}
            <button type="button" onClick={() => setLiveFrames([])} disabled={liveFrames.length === 0}>
              Clear
            </button>
            <p className="note" role="status">
              {live.status === "running"
                ? "Listening. Speak or sustain a vowel; the pad fills as frames arrive."
                : live.error
                  ? `The microphone could not be opened: ${live.error}`
                  : "The microphone is only opened when you press Start. Nothing is stored or sent anywhere."}
            </p>
          </div>
        )}
      </section>

      <section aria-labelledby="pad">
        <h2 id="pad">Pitch and resonance pad</h2>
        <VoicePad frames={shown} />
      </section>

      <div className="demo-grid">
        <section aria-labelledby="summary">
          <h2 id="summary">Summary</h2>
          {current ? <FrameSummary frame={current} /> : <p className="note">No frames yet.</p>}
          {current && <FlagList flags={current.flags} />}
        </section>

        <section aria-labelledby="quality">
          <h2 id="quality">Voice quality</h2>
          {current ? (
            <QualityMeters frame={current} />
          ) : (
            <p className="note">No frames yet.</p>
          )}
        </section>
      </div>

      <section aria-labelledby="trend">
        <h2 id="trend">Resonance over time</h2>
        <TrendChart series={series} />
        {distribution && <p className="note">Distribution — {distribution}.</p>}
        <p className="note">{alt.summary}</p>
      </section>

      <section aria-labelledby="boundary">
        <h2 id="boundary">Measurement-version boundaries</h2>
        <p className="note">
          <strong>Illustrative data.</strong> This series is not a measurement. It exists only to show
          that a chart must mark — and, when it would mislead, stop at — a change in the software that
          produced the numbers.
        </p>
        <TrendChart series={ILLUSTRATIVE_BOUNDARY} title="Illustrative trend with a version boundary" />
      </section>

      <section aria-labelledby="source">
        <h2 id="source">Where this data comes from</h2>
        <p>
          {mode === "fixture" ? (
            <>
              <strong>{fixture.label}.</strong> {fixture.description} Source:{" "}
              <code>{fixture.source}</code>.
            </>
          ) : (
            <>
              Live microphone input, analysed by the WASM core at your audio context&rsquo;s sample
              rate. Nothing is recorded, stored, or transmitted.
            </>
          )}
        </p>
      </section>
    </article>
  );
}
