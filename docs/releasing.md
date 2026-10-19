# Releasing

**Status:** active (phase 10, [deployment](deployment.md) is the deploy half)

A release is one number that travels to five places: the Rust workspace (which
`CORE_VERSION` reads), three `package.json` files, the version `sonorant-cli
--version` prints, and the app's own version. `scripts/version.mjs` is the only
thing that writes it, and `npm run check:release` fails if any copy disagrees.

## The flow

```
npm run release:patch        # or release:minor / release:major — a human decides
   │
   └─ bumps every copy, commits "chore(release): vX.Y.Z",
      pushes the commit and the tag to main
        │
        └─ release.yml sees the release commit on main
             → build + gate + attest → GitHub Release → publish to npm + crates.io
```

1. **Merge work into main as usual.** Nothing is released.
2. **Decide the bump and run the release script.** `npm run release:patch` (or
   `release:minor` / `release:major`) bumps every copy of the version, commits
   `chore(release): vX.Y.Z`, and pushes the commit and the tag.
3. Everything after that is automatic: build → gates → artifacts →
   GitHub Release → npm and crates.io.

### Why the human step is there

A registry publish is irreversible — crates.io cannot delete or reuse a version —
and `CORE_VERSION` is stamped on every user's stored measurements, so the version
is a claim about what the tool *measures* (TDD §9), not about an API. A
conventional-commit bot can see that a `feat` happened; it cannot see whether a
measure moved. Choosing the bump when you run the release script is where a human
looks, and `AGENTS.md` says the same thing in one line: *never automate launch
actions; a human approves.*

The conventional-commit rule is a first draft, not a judgement: `feat` → minor,
`fix`/anything else → patch, `!` → major. `node scripts/version.mjs plan` prints
what the commits imply without changing anything; override it deliberately.

### Why there is no release PR

`release.yml` used to open a `chore(release): vX.Y.Z` pull request on any push to
main whose commits looked releasable, and treat the merge as the approval. That
loop was unbounded. The "is this push the release PR?" test looked for the branch
name in the merge commit *body*, where GitHub does not put it — the branch name is
in the subject, the body is the PR title — so a merged release PR looked like
ordinary work, no tag was ever created, and the next push proposed another bump.
Every merge produced a fresh release PR, and no release was ever cut. The PR is
gone; running the release script is the approval, and the human judgement it stood
for now lives in the bump choice.

## Doing a release by hand

The release script *is* the manual path; it is now the only path:

```bash
npm run release:patch     # or release:minor / release:major
#   bumps every copy, commits "chore(release): vX.Y.Z", tags, and pushes
npm run release:tags      # list the tags
npm run check:release     # confirm every copy agrees
```

The push hands over to `release.yml`, which sees a release commit and takes it
from there. If CI is unavailable, the bump is the whole local release; dispatch
`publish.yml` from the Actions tab (or re-run it) once the artifacts are built.

## One-time setup (maintainer, needs 2FA)

These steps are yours: they need interactive authentication, and they are the only
thing standing between a workflow and a registry.

### npm: trusted publishing

Both names are **already claimed** on npm by this repository's owner —
`sonorant@0.0.1` and `sonorant-cli@0.0.1`, published 2026-10-09 as placeholders, with
a `repository.url` that already matches the one in `package.json`. That matters
twice: trusted publishing cannot *create* a package, so an unclaimed name would
have needed a manual bootstrap first, and npm matches `repository.url` exactly, so
a mismatch here would silently cost provenance. Both are in order.

So there is nothing to bootstrap. The first CI release publishes the first real
version over the placeholder; deprecate the placeholder afterwards:

```bash
npm deprecate sonorant@0.0.1     "placeholder; superseded by the published release"
npm deprecate sonorant-cli@0.0.1 "placeholder; superseded by the published release"
```

Then trust this repository's publish workflow. **`npm trust` needs npm >= 11.15.0**
— upgrade first, or the command may accept the entry without granting publish
permission, which fails later at release time:

```bash
npm install -g npm@latest
npm trust github sonorant     --repo therebelrobot/sonorant --file publish.yml --allow-publish
npm trust github sonorant-cli --repo therebelrobot/sonorant --file publish.yml --allow-publish
npm trust list sonorant        # confirm the entry, and the permission it grants
```

Or do the same on npmjs.com → package → Settings → Trusted publishing. The
**filename must be exactly `publish.yml`**, and the repo `therebelrobot/sonorant`;
npm does not validate either until the first publish, so a typo shows up as a
failure at release time, not here.

Finally, lock it down: package → Settings → Publishing access → *Require
two-factor authentication and disallow tokens*. OIDC keeps working; stray tokens
stop. Delete any `NPM_TOKEN` secret.

### crates.io: trusted publishing

For each of the five published crates — `sonorant-core`, `sonorant-analysis`,
`sonorant-calibrate`, `sonorant-archive`, `sonorant-ffi` — add a trusted publisher
on crates.io (crate → Settings → Trusted publishing) naming this repository and the
workflow `publish.yml`. `rust-lang/crates-io-auth-action` then exchanges the
workflow's OIDC token for a temporary token at publish time, and revokes it when
the job ends. There is no long-lived `CARGO_REGISTRY_TOKEN` anywhere.

`sonorant-capture` and the Rust `sonorant-cli` are marked `publish = false`: the
first is native-only, and the second is the *internal* batch binary — the
crates.io `sonorant-cli` is a name reservation, while the product's CLI is the npm
`sonorant-cli` (AGENTS.md §5 names this collision on purpose).

## What actually ships

| Registry | Artifact |
|---|---|
| npm | `sonorant` (the WASM wrapper), `sonorant-cli` (the Ink CLI) |
| crates.io | `sonorant-core`, `sonorant-analysis`, `sonorant-calibrate`, `sonorant-archive`, `sonorant-ffi` |
| GitHub Release | the web bundle, the native CLI binary, the `.wasm`, `SHA256SUMS`, an SPDX SBOM, and build provenance |

## Verifying a release

```bash
npm view sonorant dist.attestations --json    # provenance is attached
npm view sonorant-cli version
cargo info sonorant-core                       # or the crates.io page
```

On GitHub: the Release carries the artifacts and the attestation; `gh attestation
verify` checks a downloaded artifact against it.

## When something fails

- **`publish.yml` did not run.** It is triggered by `workflow_dispatch` from
  `release.yml`, deliberately: a tag pushed with `GITHUB_TOKEN` does not trigger
  workflows. Re-run it by hand — Actions → publish → *Run workflow* with the tag.
- **A crate failed after the first one succeeded.** Re-run the workflow. Already
  published versions are detected and skipped, so only the remainder is pushed.
- **"tag does not match the release version".** A copy of the version drifted.
  `npm run check:release` names every file that disagrees; fix with
  `node scripts/version.mjs set <version>`.
- **"no matching version found for sonorant@^x"** while bumping: a dependent's
  range did not move with the version. `scripts/version.mjs` keeps
  `NPM_RANGES` in sync; run `check:release` to confirm.
