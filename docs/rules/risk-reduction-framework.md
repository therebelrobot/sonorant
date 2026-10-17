# Risk Reduction Delivery Framework

All product delivery work follows the Risk Reduction Delivery Framework. The full process
lives in the `rrf-*` skills; this rule holds the invariants that never scale away.

## Invariants

1. **Problem before solution.** Capture the member pain point or operational inefficiency
   and the "why" before prescribing an implementation.
2. **Depth scales with risk.** The tier (lightweight/comprehensive) is decided by
   `rrf-00-triage` and recorded. When in doubt, triage.
3. **One-way doors get extra review.** Decisions are classified in
   `rrf-04-risk-constraints`; irreversible decisions are never waved through to save time.
4. **Contracts before concurrency.** Service communication contracts and schemas are
   established up front so FE/BE work in parallel without last-minute wiring crises.
5. **Deploy ≠ launch.** Code ships to production dormant behind feature flags. Flag
   turn-on and business launch are separate, human-approved decisions in their own phases
   (`rrf-10-technical-deploy`, `rrf-13-launch`).
6. **Acceptance criteria are Given/When/Then.** UI criteria owned by Product/Design;
   non-UI by Engineering. UAT judges strictly against them; cosmetic findings become
   fast-follow tickets, not blockers.
7. **Go/No-Go pauses are blameless.** A "no" identifies a gap and reschedules — no fault,
   no friction.
8. **POCs re-enter the workflow.** Pre-phase-1 work becomes releasable only through the
   `rrf-poc-onramp` requirements. There is no legal/IP gate.

## Agent behavior

- When asked to start or continue delivery work, identify the current phase and load the
  matching `rrf-*` skill; if unknown, start at `rrf-00-triage`.
- Every phase can run in **automate** mode (produce the deliverable) or **guide** mode
  (walk the human through it). Ask which if unclear.
- Never automate: feature-flag exposure, go/no-go decisions, launch actions. Prepare,
  verify, and recommend — a human approves.
