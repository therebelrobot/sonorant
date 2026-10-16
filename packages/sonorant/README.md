# sonorant (npm)

The npm WASM core wrapper (TDD §3). It ships the browser `.wasm` artifact produced
from `crates/sonorant-ffi` plus a typed loader.

**No acoustic maths lives in JavaScript.** The loader only loads the core, checks the
wasm hash and the ABI version, and exposes a `Float32Array` view over the frames the
core produced.

## Use

```js
import { loadEngine, framesView, FRAME_WORDS } from "sonorant";

const engine = await loadEngine(44100);
engine.configure(2048, 512, 24);
engine.push(pcmFloat32);        // Float32Array of mono PCM in [-1, 1]
const frames = framesView(engine); // Float32Array, FRAME_WORDS per frame
```

`loadEngine` throws on a wasm hash mismatch or a `CORE_ABI_VERSION` mismatch — a hard
startup failure, never a silent misread (TDD §12, §9.5).

## Rebuilding the wasm

The `.wasm` and the generated bindings under `pkg/` are committed so the package is
self-contained and testable. Regenerate them from the repo root with:

```
npm run wasm:build
```

then update `EXPECTED_WASM_SHA256` in `src/wasm-hash.js` to the new digest.
