# RRF Phase 2 — Developer/Design Context & The 5 Whys

**Status:** draft
**Tier:** lightweight (from `rrf-00-triage`)
**Owner:** solo builder, with clinical input from a volunteer SLP
**Phase:** 2 of the Risk Reduction Delivery Framework
**Inputs:** phase 1 problem statement ([`docs/rrf/01-ideation-intake.md`](01-ideation-intake.md))
**Output feeds:** phase 3 (workflows), phase 4 (risk & constraints), all later execution decisions

---

## Purpose

This document hands Engineering the *why* behind the initiative before any *how* decisions are
made. It is the phase-2 deliverable at the lightweight tier: a bulleted 5-Whys summary plus the
context an engineer needs to reason about the problem as a strategic partner rather than a
downstream ticket executor.

Everything here traces to the project brief or the TDD. Levels marked `[stated]` are from how the
project was framed; `[inferred]` is the builder's reasoning and is open to correction. Where this
document paraphrases the brief, the brief is authoritative.

---

## 1. The 5 Whys

Reproduced from the brief's §3, one level per item, with the brief's own `[stated]` / `[inferred]`
markers preserved.

1. **Why does this matter to the user?** Because voice is one of the most commonly cited sources of
   gender dysphoria, and changing it takes months of deliberate practice. `[stated]`
2. **Why does that matter?** Because months of unmeasurable practice is where people quit, and the
   change arrives far later than the effort invested. `[inferred]`
3. **Why does that matter?** Because the people who quit are the ones who would have succeeded with
   better feedback, and because clinician time is scarce enough that frequent check-ins are not
   available to most people. `[inferred]`
4. **Why does that matter?** Because the existing tools that could fill this gap are either paid or
   incomplete, and the incomplete ones teach pitch because pitch is easy to measure. `[stated]`
5. **Why does that matter?** Because the specific harm is not a missing feature — it is a tool that
   confidently measures the wrong thing and thereby teaches a worse method than no tool at all.
   `[inferred]`

**Root motivation.** Build the measurement that the existing tools avoid because it is hard, and
give it away.

**Restatement check (from the brief).** Someone new to the project should be able to say: *"the
existing apps show pitch because pitch is easy; resonance is what matters and it's harder; this
measures resonance and is free."* If they can't, the framing above isn't landing.

---

## 2. Member journey

A short narrative of the person's journey, in the member's own terms. This is the qualitative
context the 5 Whys compress; it is drawn from the brief's §2 (problem) and §4 (who it's for).

1. **Noticing.** A person notices that their voice does not match how they understand themselves.
   Voice is one of the most commonly cited sources of gender dysphoria, and the mismatch is
   something they hear every time they speak.
2. **Seeking help.** They look for a way to change it. The credible path is a speech-language
   pathologist who works on voice — but voice modification services are clinician-limited, and
   demand for gender-affirming care is growing faster than the supply of clinicians trained in
   voice work.
3. **Clinician-limited access.** Appointments are infrequent. Progress depends on feedback, and the
   feedback available is either a clinician's ear at those infrequent appointments or a consumer app
   that measures the wrong quantity. Frequent check-ins are not available to most people.
4. **Practising alone.** Between appointments, the person practises alone, unsupervised, for months.
   Voice modification is a slow, embodied skill; a perceptible change takes months of deliberate
   practice, and the change arrives far later than the effort invested.
5. **Plateauing on pitch.** The widely reported failure mode: they raise their pitch and plateau.
   Pitch is not the dominant perceptual cue for how a voice is gendered — vocal tract resonance is —
   and resonance is rarely measured, because measuring it correctly requires normalising out the
   vowel, and almost nobody does that. The tools they can reach teach pitch because pitch is easy to
   measure.
6. **Quitting, or persisting without evidence.** They practise for months without evidence that
   anything is changing, conclude their voice cannot change, and stop. The people who stop are
   frequently the ones who would have succeeded with honest feedback. Those who persist do so
   without evidence either way.

**The outcome if solved.** Someone can see, alone and unsupervised, whether their resonance
configuration is changing, whether it is stable, and whether it survives connected speech — and they
can hand that history to a clinician as evidence.

---

## 3. Clinical / operational background an engineer needs

Explicit items, each traceable to the brief or TDD. These are the facts that make the problem
non-obvious to someone who has not worked in voice.

1. **Resonance matters more than pitch for how a voice is gendered.** Pitch is not the dominant
   perceptual cue; vocal tract resonance is. This is the core reason the project exists — a tool
   that only shows pitch is measuring the wrong thing. (Brief §2.)
2. **Measuring resonance requires normalising out the vowel.** F1–F2 varies roughly 13 semitones
   across English vowels, while the typical vocal-tract-length difference between adult speakers is
   2–3 semitones. A raw-Hz formant display mostly measures the vowel, not the speaker. Vowel
   identity must be controlled or normalised out before anything is expressed in Hz. (Brief §5,
   principle 2.)
3. **High F0 degrades formant estimation — and the primary user group works exactly there.** The
   maths degrades fastest at high F0, which is where the people this tool is for are working.
   High-F0 formant robustness is the project's differentiator, and it is why the core is written
   in-house rather than taken from a crate. (Brief §5, principle 3; TDD §1, decision driver 2.)
4. **Pitch and resonance are acoustically coupled but separately trainable.** They interact
   acoustically, they are separately trainable, and conflating them teaches the wrong skill — which
   is the failure mode this project exists to fix. They must always be visually separable. (Brief
   §5, principle 1.)
5. **Every estimate carries a confidence indication.** A value without a confidence is not
   displayable. The maths is least reliable exactly where the primary user group works, so
   confidence is not decoration — it is the honesty mechanism. (Brief §5, principle 3; TDD §4.2.)
6. **Self-referential by default.** Comparison is against the user's own baseline and their own
   chosen target. Normative reference bands exist but are off by default — this is both better
   measurement (baseline-relative comparison detects change in an individual better) and the
   respect-preserving choice. Normative comparison against cis speakers is contested in this
   community. (Brief §5, principle 4; §8, ethics.)
7. **No single composite score.** Not femininity, not voice quality, not progress. A composite score
   would collapse the measurement into a judgement. (Brief §5, principle 5.)
8. **Measurement and interpretation are visually distinct.** Anything reading as a judgement uses an
   unmistakable different visual register. (Brief §5, principle 6.)
9. **The SLP collaboration boundary: clinical input to design, NOT clinical validation of outputs.**
   The volunteer SLP contributes clinical judgement to design — which measures matter, what the
   workflow should be, what exercises are meaningful, what an experienced ear hears that the numbers
   miss. That is a large and load-bearing contribution. It is **not** clinical validation of
   outputs. There is an important difference between crediting "clinical input from a licensed SLP"
   and implying "clinically validated"; only the first is truthful, and the project's documentation
   must use that language deliberately. The volunteer's input governs measurement priorities and
   workflow; it does not govern what the software tells a user about their own body. (Brief §9.)
10. **The "nothing diagnostic" boundary.** The tool measures. It does not classify, screen, or
    diagnose. The line is crossed the moment output becomes a judgement — "this suggests vocal fold
    pathology" — rather than a measurement — "HNR 14 dB, below your baseline." Every feature stays on
    the measurement side, and there is no roadmap item that moves it. Diagnosis, screening, and
    triage of any pathology are in the "Never" list. (Brief §5, principle 7; §6, "Never"; §8,
    claims.)
11. **No backend, ever, in v1.** No server, no account, no telemetry, no audio egress. This is a
    deliberate architectural choice, not a simplification: it is what makes the tool deployable by a
    clinician and sustainable by one person. There is no network client in the codebase, and CSP is
    `connect-src 'none'`. (Brief §5, principle 8; §10; TDD §1, §12.)
12. **Operator-facing design obligations.** If another SLP self-hosts this, the architecture has to
    make responsible use *possible* for them. This is a design constraint, not a legal one on the
    builder. (Brief §0, §10.)

---

## 4. Engineer-restates-the-problem check

The exit criterion for this phase is that Engineering has consumed the context — demonstrated by
restating the problem and asking problem-space questions, not just solution-space ones.

**The check.** Before moving to phase 3, an engineer on the initiative should be able to restate, in
their own words:

- **Who hurts?** People modifying their voice — most visibly transgender people — and the SLPs who
  work with them. The primary user is the builder; second are self-directed users without regular
  clinician access; third are clinicians and SLPs who self-host.
- **How do they hurt?** They practise for months without evidence that anything is changing, because
  the feedback available is either a clinician's ear at infrequent appointments or a consumer app
  that measures the wrong quantity. They raise their pitch and plateau, because pitch is easy to
  measure and resonance is not.
- **Why does it matter?** The people who quit are frequently the ones who would have succeeded with
  honest feedback. The specific harm is not a missing feature — it is a tool that confidently
  measures the wrong thing and thereby teaches a worse method than no tool at all.

**Problem-space questions to invite** (not solution-space):

1. What does "progress" actually mean to the member, and how would they know it when they saw it?
2. What is the member doing when the feedback gap hurts most — isolated practice, connected speech,
   or something else?
3. What does the member currently do instead, and why does that fail them?
4. What would make a member distrust the tool, and how do we avoid producing that?
5. What does the clinician need to see to treat the member's history as evidence?
6. Where does the member's own baseline come from, and what happens before they have one?
7. What does the member do with a measurement that carries low confidence?

---

## Source

- [`docs/Project brief — voice analysis & training tool.md`](../Project%20brief%20%E2%80%94%20voice%20analysis%20%26%20training%20tool.md) — problem (§2), 5 Whys (§3), audiences (§4), principles (§5), scope (§6), claims/ethics/licence (§8), SLP collaboration boundary (§9), operator story (§10), success (§11), non-goals (§13).
- [`docs/rrf/01-ideation-intake.md`](01-ideation-intake.md) — phase 1 problem statement this document builds on.
- [`docs/TDD — Rust analysis core & local-first deployment.md`](../TDD%20%E2%80%94%20Rust%20analysis%20core%20%26%20local-first%20deployment.md) — high-F0 formant robustness as the differentiator (§1), the analysis core contract and confidence rule (§4), the no-backend boundary and security review (§12).
