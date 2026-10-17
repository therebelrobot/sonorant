# RRF Phase 1 — Ideation & Intake

**Status:** draft
**Tier:** lightweight (from `rrf-00-triage`)
**Owner:** solo builder, with clinical input from a volunteer SLP
**Phase:** 1 of the Risk Reduction Delivery Framework
**Output feeds:** phase 2 (context), phase 4 (risk)

---

## Idea / epic description

**Problem:** People modifying their voice — most visibly transgender people — and the speech-language pathologists (SLPs) who work with them experience a feedback gap. Voice modification is a slow, embodied skill that takes months of practice to produce a perceptible change, and progress depends on feedback. The feedback available today is either a clinician's ear at infrequent appointments or a consumer app that measures the wrong quantity. The specific, widely reported failure mode: people raise their pitch and plateau. Pitch is not the dominant perceptual cue for how a voice is gendered — vocal tract resonance is — and resonance is rarely measured, because measuring it correctly requires normalising out the vowel, and almost nobody does that.

**Why it matters:** Voice is one of the most commonly cited sources of gender dysphoria, and changing it takes months of deliberate practice. Voice modification services are clinician-limited, and demand for gender-affirming care is growing faster than the supply of clinicians trained in voice work. The cost of leaving this unsolved is concrete: people practise for months without evidence that anything is changing, conclude their voice cannot change, and stop. The people who stop are frequently the ones who would have succeeded with honest feedback. The harm is not a missing feature — it is a tool that confidently measures the wrong thing and thereby teaches a worse method than no tool at all.

**Outcome if solved:** A person can see, alone and unsupervised, whether their resonance configuration is changing, whether it is stable, and whether it survives connected speech — and they can hand that history to a clinician as evidence. Observable result: the builder uses it for their own practice and it changes what they do; the volunteer SLP finds it more useful than their current workflow; a stranger deploys it and reports that it worked; someone other than the builder contributes a fix or a measure; and people stop describing it as a pitch app.

**Affected users:** Members (people modifying their voice, most visibly transgender people) and the SLPs who work with them. Three audiences, in order: (1) the builder, who is the primary user; (2) self-directed users working on their voice without regular clinician access; (3) clinicians and SLPs who self-host. Collaborator: the volunteer SLP contributing clinical judgement to design. Explicitly not users: anyone accessing this through an employer, a clinic's managed system, or any relationship where the builder holds their data — no such relationship exists, by design.

**Tier:** lightweight (from `rrf-00-triage`)

---

## Problem space, not solution

This idea is framed as a problem, not a solution. The brief's §2 states the pain point, the failure mode, the cost of leaving it unsolved, and the outcome in problem terms, and §3's 5 Whys traces the root motivation to a measurement gap rather than a feature request. The framing passes the brief's own restatement check: *"the existing apps show pitch because pitch is easy; resonance is what matters and it's harder; this measures resonance and is free."*

Where the source material names specific features, they are reframed here as outcomes rather than carried forward as the idea's definition:

- **"Live two-axis biofeedback for pitch × resonance"** (brief §6) is a feature. The outcome it serves is the ability to see, in the moment, whether resonance is changing independently of pitch — the problem-space statement above.
- **"Sustained-tone, glide, resonance-hold, and connected-speech exercises"** (brief §6) is a feature list. The outcome is that a person can tell whether a resonance configuration survives connected speech, not just isolated tones.
- **"Recording and local history; A/B comparison against the user's own past"** and **"Longitudinal trends"** (brief §6) are features. The outcome is that a person can see whether their configuration is changing and stable over time, and can hand that history to a clinician as evidence.
- **"Export/import of a history file"** (brief §6) is a feature. The outcome is portability of the user's own evidence between their devices and their clinician, without a server.
- **"Web app (primary) and a desktop shell"** (brief §6) is a delivery mechanism. The outcome is that a self-directed user can run it on their own device with no account and no data leaving the device.

The brief's §5 principles (pitch and resonance always visually separable; vowel identity normalised out before anything is expressed in Hz; every estimate carries a confidence indication; self-referential by default; no single composite score; measurement and interpretation visually distinct; nothing diagnostic; no backend ever in v1) are constraints on any solution, not the problem statement itself. They are recorded here as boundary conditions the eventual solution must respect, and they belong to phase 4 (risk & constraints) and phase 5 (technical architecture) for formal treatment.

The brief's §6 "Never" list (no diagnosis, screening, or triage; no vocal-surgery decision support; no social or "passing" scoring; no accounts, sync servers, or central data) is likewise a scope boundary, not a solution.

---

## Refinement review

This idea is scheduled for refinement review. As a solo-builder project with no organization to align, the builder is the reviewer; the volunteer SLP contributes clinical judgement to design and measurement priorities, and does not govern what the software tells a user about their own body (brief §9). The review evaluates the problem statement above on its own terms — whether it can be understood without the idea owner present — and confirms the tier recorded by `rrf-00-triage`.

---

## Source

- [`docs/Project brief — voice analysis & training tool.md`](../Project%20brief%20%E2%80%94%20voice%20analysis%20%26%20training%20tool.md) — problem (§2), 5 Whys (§3), audiences (§4), principles (§5), scope (§6), success criteria (§11), non-goals (§13).
- [`docs/TDD — Rust analysis core & local-first deployment.md`](../TDD%20%E2%80%94%20Rust%20analysis%20core%20%26%20local-first%20deployment.md) — tier confirmation and the no-backend architectural boundary that keeps the problem statement honest.
