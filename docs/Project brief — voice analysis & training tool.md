# Project brief — voice analysis & training tool

**Status:** draft
**Tier:** lightweight (see §0 for the re-tier)
**Owner:** solo builder, with clinical input from a volunteer SLP
**Licence:** Unlicense

---

## 0. Re-tier, and what changed

The previous pass classified this as comprehensive tier and produced a PRD. That was wrong, and
the cause was a bad inference on my part: I assumed this was employer-facing and that member PHI
would be in scope. It isn't, and it won't be.

Re-tier: **lightweight.**

| Factor | Comprehensive reading | Actual |
|---|---|---|
| Complexity | high | high — real-time audio, novel stack, published ABI |
| Novelty | high | high — Rust/WASM, Tauri, DSP written from scratch |
| Blast radius | member-facing, regulated | personal; public users; a self-hosting clinician's own environment |
| Stakeholders to align | Product, Design, Eng, Care Team, legal, ops | builder + one volunteer SLP + anonymous users |
| Clinical pathway | yes | no |
| Regulated data | PHI in scope | no covered entity, no backend, no PHI repository |
| Irreversible | schema with history, comms, SaMD | licence (decided), ABI stability, public claims |

The reframe that matters: **the comprehensive tier exists to buy organizational alignment.**
There is no organization here. The stakeholder matrix, the Care Team workflows, the org RBAC, the
audit apparatus, and the go/no-go and launch phases were not merely optional — they were
inapplicable. Everything in those documents that was *engineering* rigour survives and is carried
forward; everything that was *coordination ceremony* is deleted.

One thing did upgrade, though. Publishing it and making it self-hostable by clinicians adds a
category the personal reading wouldn't have needed: **operator-facing design obligations.** If
another SLP deploys this, the architecture has to make responsible use *possible* for them, and
that's a design constraint, not a legal one on the builder.

---

## 1. What this is

A local-first, open-source tool that measures the acoustic properties of a voice and visualises
them so that a person training their voice can see what is actually changing. It is
offline-capable, has no backend, and stores nothing on anyone's server.

---

## 2. Problem

**Who experiences it.** People modifying their voice — most visibly transgender people — and the
speech-language pathologists who work with them.

**The pain point, concretely.** Voice modification is a slow, embodied skill that takes months
of practice to produce a perceptible change. Progress depends on feedback, and the feedback
available today is either a clinician's ear at infrequent appointments or a consumer app that
measures the wrong quantity.

The failure mode is specific and widely reported in the community: people raise their pitch and
plateau. Pitch is not the dominant perceptual cue for how a voice is gendered — vocal tract
resonance is, and resonance is rarely measured, because measuring it correctly requires normalising
out the vowel, and almost nobody does that.

**Why it matters now.** Voice modification services are clinician-limited. Demand for
gender-affirming care is growing faster than the supply of clinicians trained in voice work.

**What it costs to leave unsolved.** People practise for months without evidence that anything is
changing, conclude their voice cannot change, and stop. The ones who stop are frequently the ones
who would have succeeded with honest feedback.

**Outcome if solved.** Someone can see, alone and unsupervised, whether their resonance
configuration is changing, whether it is stable, and whether it survives connected speech — and
they can hand that history to a clinician as evidence.

---

## 3. The 5 Whys

Levels marked [stated] are from how the project was framed; [inferred] is my reasoning and is open
to correction.

1. **Why does this matter to the user?** Because voice is one of the most commonly cited sources of
   gender dysphoria, and changing it takes months of deliberate practice. [stated]
2. **Why does that matter?** Because months of unmeasurable practice is where people quit, and the
   change arrives far later than the effort invested. [inferred]
3. **Why does that matter?** Because the people who quit are the ones who would have succeeded with
   better feedback, and because clinician time is scarce enough that frequent check-ins are not
   available to most people. [inferred]
4. **Why does that matter?** Because the existing tools that could fill this gap are either paid or
   incomplete, and the incomplete ones teach pitch because pitch is easy to measure. [stated]
5. **Why does that matter?** Because the specific harm is not a missing feature — it is a tool that
   confidently measures the wrong thing and thereby teaches a worse method than no tool at all.
   [inferred]

**Root motivation.** Build the measurement that the existing tools avoid because it is hard, and
give it away.

**Restatement check.** Someone new to the project should be able to say: *"the existing apps show
pitch because pitch is easy; resonance is what matters and it's harder; this measures resonance and
is free."* If they can't, the framing above isn't landing.

---

## 4. Who it's for

**Primary: the builder.** This is built by someone who wants the tool. That's a real advantage —
the user is in the room for every design decision, and there is no stakeholder translation layer.

**Second: self-directed users.** People working on their voice without regular clinician access.
They get the tool as a static site or a desktop app, and their data never leaves their device.

**Third: clinicians and SLPs who self-host.** A professional deploying this in their own
environment. They need the architecture to be one they can defend to their own IT review, which
constrains the design more than the other two audiences do — see §10.

**Collaborator: the volunteer SLP.** Contributing clinical judgement to design and measurement
priorities. See §9 for the boundary on what that does and doesn't mean.

**Not users.** Nobody accessing this through an employer, a clinic's managed system, or any
relationship where the builder holds their data. There is no such relationship, by design.

---

## 5. Principles

Non-negotiable, and they are the reason the tool is worth building at all.

1. **Pitch and resonance are always visually separable.** They interact acoustically, they are
   separately trainable, and conflating them teaches the wrong skill — which is the failure mode
   this project exists to fix.
2. **Vowel identity is controlled or normalised out before anything is expressed in Hz.** F1–F2
   varies roughly 13 semitones across English vowels; the typical vocal-tract-length difference
   between adult speakers is 2–3. A raw-Hz formant display mostly measures the vowel.
3. **Every estimate carries a confidence indication.** The maths degrades fastest at high F0,
   which is exactly where the primary user group works.
4. **Self-referential by default.** Compare against the user's own baseline and their own chosen
   target. Normative reference bands exist but are off by default — better measurement, and the
   respect-preserving choice.
5. **No single composite score.** Not femininity, not voice quality, not progress.
6. **Measurement and interpretation are visually distinct.** Anything reading as a judgement uses
   an unmistakable different visual register.
7. **Nothing diagnostic.** It measures. It does not classify, screen, or diagnose.
8. **No backend, ever, in v1.** No server, no account, no telemetry, no audio egress.

---

## 6. Scope

### v1
- On-device capture and analysis; no network required at any point
- Pitch, formant/resonance, voice-quality, and input-integrity measurement
- Live two-axis biofeedback for pitch × resonance
- Sustained-tone, glide, resonance-hold, and connected-speech exercises
- Recording and local history; A/B comparison against the user's own past
- Longitudinal trends: distribution shift, sparklines
- Export/import of a history file, for portability and backup
- Web app (primary) and a desktop shell

### Deferred
- Calibrated SPL, voice range profiles, and serial VRPs — requires the calibration path (§12)
- Vocal dose / all-day tracking — requires background capture and a native shell
- Reference-voice library
- DDK, tremor, and other motor-speech measures

### Never
- Diagnosis, screening, or triage of any pathology
- Vocal-surgery decision support
- Any social or "passing" scoring
- Accounts, sync servers, or anything that holds a user's data centrally

---

## 7. The full visualisation inventory

The ~90-item inventory lives in its own document (`voice-viz-inventory`), tagged by domain and
phased. Two rules when trimming it:

- **Phase 1 is fixed.** Input integrity, confidence overlays, F0 contour and distribution, the
  two-axis pad, sustained/glide exercises, recording + A/B, MPT, practice calendar. Below this the
  tool has no value.
- **Nothing ships without a text summary, and nothing ships without a confidence indication.**

---

## 8. Boundary: claims, ethics, and licence

**Claims.** The tool measures and displays. It does not produce verdicts. The line is crossed the
moment output becomes a judgement — "this suggests vocal fold pathology" — rather than a
measurement — "HNR 14 dB, below your baseline." Every feature stays on the measurement side, and
there is no roadmap item that moves it.

**Ethics.** Normative comparison against cis speakers is contested in this community. It is off by
default for measurement reasons as much as for respect reasons: baseline-relative comparison is
simply better at detecting change in an individual. No output scores femininity, masculinity, or
passability, and none is stored.

**Licence: Unlicense.** Chosen deliberately, and the reasoning is worth recording because it is not
the obvious choice for a project whose motivation is that the existing tools are cost-gated.

- *What it costs.* A commercial actor can take this, host it, and charge for it. That is the
  cost-gating problem recurring, and it is a real risk.
- *Why it's still right.* The third audience is clinicians self-hosting this in a professional
  environment. Health-system and clinic legal review is dramatically easier with public domain than
  with copyleft — AGPL is frequently a hard blocker in those reviews, not a negotiable one. Choosing
  copyleft to prevent re-absorption would also prevent the deployment that matters most.
- *What actually protects the project.* Not the licence. The value that a fork doesn't inherit is
  trust, community, and continued development. Publishing the methodology, the measurement
  documentation, and the conformance fixtures alongside the code means a re-absorber can't be the
  only authoritative source for how the numbers are produced.

---

## 9. The SLP collaboration, and its boundary

The volunteer is contributing **clinical judgement to design**: which measures matter, what the
workflow should be, what exercises are meaningful, what an experienced ear hears that the numbers
miss. That is a large and genuinely load-bearing contribution.

**What it is not.** Clinical validation of outputs. There is an important difference between
crediting "clinical input from a licensed SLP" and implying "clinically validated." Only the first
is truthful here, and the project's documentation should use that language deliberately.

**The specific case that changes things.** If the volunteer starts using this with their own clients,
three things shift:

1. Their practice's professional-records obligations attach to whatever they store, even though the
   tool stores nothing centrally. Local-only storage helps them; it does not make them exempt.
2. Any output that sounds like an assessment becomes a professional-liability question for them, not
   for the project.
3. Their name on the project acquires a different meaning.

This is currently undecided, and the right response is architectural rather than legal: **the design
already avoids all three** by having no backend, no diagnosis, and no clinical verdicts. Nothing
needs to change if the situation changes — which is the point of building it this way. What the
project must not do is drift toward clinical output "because an SLP is involved," because that is
precisely what would make it unsafe for them to adopt later.

**Practical rule for the collaboration.** The volunteer's input governs measurement priorities and
workflow. It does not govern what the software tells the user about their own body, which stays
inside §5's boundary regardless of who is advising.

---

## 10. Operator story

What a clinician installing this actually gets, because it is the strongest argument for the
architecture:

- A static web bundle, and a local binary. **There is no service to operate.** No database, no
  account system, no message queue, no scheduled jobs.
- No PHI repository exists, because nothing is collected centrally. Data lives on the user's device.
- No network egress from the application. Verifiable, not just claimed — see the TDD's security
  review.
- Cost to operate: a domain and hosting for static files. That's it.
- History moves between devices by exporting and importing an encrypted file, which the user or
  clinician controls, rather than by syncing to a server.

**Caveats an operator needs documented, because they will hit all of them:** microphone access
requires a secure context, so a TLS certificate is mandatory even for a purely local deployment.
Browsers apply audio processing that can be disabled but not fully controlled. Calibrated SPL
measurement is impossible from the web app and requires the separate desktop path.

The absence of a backend is the whole design. It's also why this can be sustained by one person for
years, because there is nothing to operate, patch on a schedule, or pay for.

---

## 11. Success

This is a solo project with no users to acquire. Success is correspondingly concrete:

- The builder uses it for their own practice for a meaningful stretch, and it changes what they do.
- The volunteer SLP finds it more useful than the workflow they currently use.
- A stranger deploys it and reports that it worked.
- Someone other than the builder contributes a fix or a measure.
- People stop describing it as a pitch app.

**Explicitly not success:** user counts, retention curves, revenue, or growth. Optimising for those
would distort the measurement honesty that makes the tool worth anything.

**Guardrail.** Measurement confidence per session must not degrade. If the tool starts reporting
noise as signal, it has failed regardless of what else works.

---

## 12. Open questions

1. **Microphone and calibrator specification.** Equipment question, and it needs its own research
   pass with cited sources before anything is bought. The category is verified — Class 1 acoustic
   calibrators output 1 kHz at 94 dB under IEC 60942, with ½″ couplers and ¼″ adapters — but a
   specific pairing is not, and I won't name hardware on inference.
2. **Whether the desktop shell ships in v1.** Tied to demand for calibrated measurement.
3. **Phoneme classifier** for per-vowel analysis: build in Rust, vendor, or defer.
4. **Whether the SLP adopts it with clients** (§9). Decided, not blocking — the architecture is
   already compatible either way.
5. **Export file format** for history portability: encrypted JSON of measurements, and whether
   recordings are included.

---

## 13. Non-goals

- Replacing an SLP
- A general-purpose phonetics tool — Praat exists, is free, and is better at that
- Singing-voice training; adjacent, different skill, different user
- Any social or community feature
- Becoming a records system of any kind
- Any hosted service, account system, or sync tier
