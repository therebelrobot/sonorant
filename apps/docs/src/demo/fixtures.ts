import type { VoiceFrame } from "sonorant-react";

import referenceVowel from "./reference-vowel.frames.json";
import syntheticGlide from "./synthetic-glide.frames.json";

export interface Fixture {
  id: string;
  label: string;
  description: string;
  source: string;
  frames: VoiceFrame[];
}

/** JSON stores NaN as null; the components treat a non-finite value as missing. */
const frames = (json: { frames: unknown[] }): VoiceFrame[] => json.frames as unknown as VoiceFrame[];

/**
 * The demo fixtures are real analyses (see `scripts/demo-fixture.mjs`), generated
 * by the native `sonorant-cli` and committed so the docs build needs no toolchain.
 */
export const FIXTURES: Fixture[] = [
  {
    id: "glide",
    label: "Synthetic glide",
    description: syntheticGlide.description,
    source: syntheticGlide.source,
    frames: frames(syntheticGlide),
  },
  {
    id: "reference",
    label: "Reference vowel",
    description: referenceVowel.description,
    source: referenceVowel.source,
    frames: frames(referenceVowel),
  },
];
