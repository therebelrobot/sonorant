# sonorant-react

Reusable React visualizations for Sonorant voice-analysis frames: a pitch/resonance
pad, a longitudinal trend chart with measurement-version boundaries, a
confidence-bearing frame summary, and voice-quality meters.

These components contain **no acoustic maths**. They render the frame objects the
Rust core produces — via the [`sonorant`](https://www.npmjs.com/package/sonorant)
npm package — and they follow the project's two display rules:

- **Every estimate carries a confidence indication.** Nothing is shown as a value
  without one.
- **Nothing is conveyed by colour alone.** Each chart is paired with a written
  alternative, and every badge spells its band out in text.

## Install

```sh
npm install sonorant-react react
```

`react` is a peer dependency (`>=18`).

## Use

```tsx
import { VoicePad, FrameSummary, QualityMeters, TrendChart } from "sonorant-react";
import "sonorant-react/styles.css";

// `frames` are decoded from the core with `sonorant`'s decodeFrames().
export function Live({ frames }) {
  const latest = frames[frames.length - 1];
  return (
    <>
      <VoicePad frames={frames} />
      {latest && <FrameSummary frame={latest} />}
      {latest && <QualityMeters frame={latest} />}
    </>
  );
}
```

`decodeFrames` lives in the `sonorant` package:

```ts
import { decodeFrames } from "sonorant";
const frames = decodeFrames(framesView(engine));
```

## API

| Export | What it draws |
|---|---|
| `VoicePad` | Pitch (Hz, log) across by resonance (semitones) up. Pitch is circles, resonance is squares. |
| `TrendChart` | A channel over time, split into segments at every `core_version` change; stops at a boundary that would mislead. |
| `FrameSummary` | The accessible, confidence-bearing text equivalent of the pad. |
| `QualityMeters` | HNR, CPP, tilt, H1–H2, centroid, jitter, shimmer — with confidence, or "not measured here". |
| `FlagList` | Input-integrity flags as text. |
| `ConfidenceBadge` | A single confidence band, spelled out. |

The pure mapping functions (`mapPitch`, `padPoint`, `summarize`, `buildTrendSeries`,
`trendTextAlternative`, …) are exported too, so a consumer can render a text-only
view or build a different chart on the same model.

## Styling

`sonorant-react/styles.css` is small and override-friendly. Every component renders
plain markup with stable `sonorant-*` class names; skip the stylesheet and style
them yourself if you prefer.

## Licence

[Unlicense](https://unlicense.org) — public domain.
