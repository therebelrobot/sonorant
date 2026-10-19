# README media (blueprint explainers)

The animated diagrams in the root [`README.md`](../../README.md) are rendered from
this project. It is a small [Remotion](https://www.remotion.dev/) scene builder: shapes are
lists of 3D line segments, projected to 2D each frame and drawn as SVG, in a fixed
blueprint house style (navy paper, pale-cyan linework, electric-cyan orbs).

Keeping the source here means the README's visuals are reproducible and reviewable,
rather than pasted-in binaries.

## Scenes

| Composition | Becomes | Shows |
| --- | --- | --- |
| `pitch-resonance-*` | `docs/assets/pitch-resonance.webp` | The core premise: a vocal tract as a wireframe tube. Pulses travel up it at a steady rate (pitch); the wave inside stretches as the tube lengthens (resonance). |
| `plateau-*` | `docs/assets/plateau.webp` | The failure mode: pitch rises, then flattens, while resonance never moves. |
| `local-only-*` | `docs/assets/local-only.webp` | The signal chain — mic → worklet → worker → core → pad — with the server struck out. |

Each scene is registered once per aspect ratio (16:9, 9:16, 1:1). The README uses 16:9.

## Rendering

```sh
npm install

# preview
npx remotion studio

# stills (check these before rendering)
npx remotion still src/index.ts pitch-resonance-16x9 out/check.png --frame=156 --scale=0.5

# video
npx remotion render src/index.ts pitch-resonance-16x9 out/pitch-resonance.mp4
```

`out/` is git-ignored. To turn a render into the animated WebP the README embeds
(animated WebP because GitHub autoplays it, and it is far smaller than GIF here):

```sh
ffmpeg -y -i out/pitch-resonance.mp4 -vf "fps=8,scale=800:-1:flags=lanczos" /tmp/f/%04d.png
img2webp -loop 0 -d 125 -q 48 -m 6 -o ../../assets/pitch-resonance.webp /tmp/f/*.png
```

## Layout

| Path | Purpose |
| --- | --- |
| `src/style.ts` | The house style: palette, frame rate, aspect presets, sizes, fonts, easing |
| `src/lib/projection.ts` | 3D rotation, perspective and framing for any aspect ratio |
| `src/lib/segments.ts` | Shared segment helpers: `box`, `arrow`, `poly`, `cloud` |
| `src/lib/vocalTract.ts` | The tube, the standing wave, and label anchors |
| `src/lib/localChain.ts` | The signal chain, the cloud, and label anchors |
| `src/lib/plateauChart.ts` | The chart axes and the two curves |
| `src/scenes/` | One file per scene: the timeline and the camera move |
