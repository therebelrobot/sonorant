# Inclusive Software Ruleset for AI Coding Agents

> **Scope:** This file constrains code generation, refactors, schema design, copy, and UX decisions for any software that touches human identity, demographics, accessibility, communication, or decision-making. Apply by default; override only with explicit written justification in PR description.
>
> **Audience:** AI coding agents (opencode, Claude Code, Cursor agent mode, and compatible tools) working in this repository. When a rule conflicts with a user request, surface the conflict and require explicit override.
>
> **Source convention:** Each rule cites a named primary source. Do not paraphrase; quote when the user asks why.

---

## 0. Meta-Rules

**R0.1 — Nothing about us without us.** Before designing any feature whose primary users are members of a marginalized group (trans users, unhoused users, disabled users, undocumented users, survivors of intimate-partner violence, Indigenous communities, minors, low-literacy users, ESL users), require evidence in the PR description that affected community members participated in design — either via cited research, paid consultants, advisory boards, or community partners. Source: Design Justice Network Principles (designjustice.org), Sins Invalid "Leadership of Those Most Impacted" (sinsinvalid.org/10-principles-of-disability-justice).

**R0.2 — Threat-model for adversarial users in the user's own social graph, not just strangers.** Default cybersecurity assumes "stranger threats." For features touching location, identity, financial info, communications, or device pairing, you must also model **intimate threats**: abusive partners, family members, employers, and state actors in hostile jurisdictions. Source: Freed et al., "Digital Technologies and Intimate Partner Violence" (CSCW 2017, nixdell.com/papers/a046-freed.pdf); eSafety Commissioner Safety by Design.

**R0.3 — Data minimization is the default.** Do not collect a demographic field unless you can write down (a) the specific decision it will inform, (b) who can access it, (c) the retention period, and (d) the harm model if it leaks. GDPR Art. 5(1)(c) requires personal data be "adequate, relevant and limited to what is necessary."  If you cannot justify all four, delete the field. Source: GDPR Article 5; ICO data minimization guidance.

**R0.4 — Solve for one, extend to many.** When a constraint surfaces for a marginalized user, prefer the solution that benefits the broader population (curb-cut effect). Source: Microsoft Inclusive Design Toolkit (inclusive.microsoft.design). 

**R0.5 — Prefer framework-provided controls over custom widgets.** Native HTML form controls, platform date pickers, and OS-level accessibility APIs ship with screen-reader, keyboard, RTL, high-contrast, and i18n support that custom JS components almost always break.  Source: Microsoft Learn, "Designing inclusive software in Windows."

---

## 1. Data Modeling: Names

**R1.1 — Use a single `full_name` field by default.** Do not split into `first_name` / `last_name` unless a documented downstream system requires it (billing, KYC, government identity verification). When splitting is unavoidable, use `given_name` and `family_name`, never "first/last" or "Christian name."  Source: W3C, "Personal names around the world" (w3.org/International/questions/qa-personal-names), Richard Ishida.

**R1.2 — Names must accept the full Unicode BMP including combining characters, and field length must be ≥ 256 bytes (not characters).** A four-character Japanese name in UTF-8 occupies 12 bytes.  Do not strip diacritics; do not normalize O'Hara to OHara; do not collapse Jean-Pierre to Jeanpierre.  Source: McKenzie, "Falsehoods Programmers Believe About Names" (kalzumeus.com/2010/06/17/falsehoods-programmers-believe-about-names/); Rogers, examples version (shinesolutions.com/2018/01/08/falsehoods-programmers-believe-about-names-with-examples/).

**R1.3 — Names are mutable. Model name as a versioned attribute, not an immutable identifier.** Primary key by an opaque UUID, never by name or email. Support mononyms (single-token names) — do not require a "last name." Some users have no surname (Indonesian, Icelandic, Tibetan, Burmese conventions). 

**R1.4 — Separate `legal_name` from `chosen_name` (a.k.a. preferred name, used name). `chosen_name` is the default display value everywhere.** `legal_name` is restricted to: insurance claims, tax/payroll, KYC/AML, government-mandated identity verification, prescription dispensing where state law requires. Every other display path (UI greeting, email, ID badge, wristband, chart banner, voice prompts, notifications, audit logs visible to non-privileged users) must use `chosen_name`. Source: HRC Foundation Patient Identification guidance (thehrcfoundation.org/professional-resources/patient-self-identification); WPATH EMR Working Group; PMC10198525 ("Use of chosen names in electronic health records to promote transgender inclusivity").

**R1.5 — Implement deadname protection in the data layer.** When a user updates their chosen name, the prior value must be: (a) removed from all denormalized read models and search indices within the request, (b) excluded from audit log surfaces visible to other users (a customer service rep should see "name changed on 2025-03-12" not "from Jane to John"), (c) excluded from email subject lines, push notification previews, and SMS bodies. Privileged forensic access (legal hold, fraud investigation) requires a separate role and is logged.

**R1.6 — Forms must not validate names against a regex of allowed characters.** Reject only empty strings and (optionally) strings >256 bytes. Do not enforce title-case, do not block apostrophes, hyphens, spaces, periods, or non-Latin scripts. The Falsehoods list and W3C guidance are explicit: "anything someone tells you is their name is — by definition — an appropriate identifier for them." 

**R1.7 — Provide a pronunciation field (free text or audio) when names are spoken aloud (telehealth, voice apps, ride-sharing, customer service).** For East Asian users, optionally store a phonetic field (Kana/Romanization) since family-name-first ordering and ideographic scripts make pronunciation non-obvious.  Source: W3C wiki, Personal Names.

**R1.8 — Honorifics and titles are an optional free-text field, not a required enum.** Do not force users into a closed list of {Mr, Mrs, Miss, Ms}. If you must constrain, include Mx, Dr, Prof, Mir, Rev, and a free-text option. Many users (children, nonbinary adults, those in cultures without Western honorifics) need to leave it blank.

---

## 2. Data Modeling: Gender, Sex, Pronouns, Orientation

**R2.1 — Do not collect gender unless you can name the decision it informs.** If the answer is "demographics" or "personalization," delete the field. Reskinning the field as "gender" when you actually mean "salutation" or "marketing segment" causes harm without benefit. Source: Dscout, "4 Design Principles for Gender-Identity Inclusion"; ALBA Network guidelines (alba.network/GSDinclusiveforms).

**R2.2 — When collection is justified, store gender identity, sex assigned at birth, and legal sex marker as three separate fields, each optional, each with "prefer not to say."** Gender identity is self-reported free text or a multi-select with at minimum: woman, man, nonbinary, agender, genderfluid, genderqueer, two-spirit (where culturally relevant),  questioning, prefer to self-describe (free text), prefer not to say. Sex assigned at birth is only collected when clinically required (lab reference ranges, dosing, anatomy-specific screenings). Legal sex marker is only collected when legally required (passport/visa workflows, federal reporting). Source: ALBA Network; Fenway Institute / NORC guidelines; CA mandates X marker.

**R2.3 — Pronouns are a separate, free-text-with-suggested-options field. Never label them "preferred pronouns" — they are pronouns.** Suggested options: she/her, he/him, they/them, and a free-text input.  Allow multiple selections (e.g., "she/they"). Display pronouns next to names in any internal-facing UI (admin, support, collaboration).  Source: University of San Diego "Guidelines for Gender Inclusive Design" (sandiego.edu).

**R2.4 — Sexual orientation, when collected, must be opt-in with a clearly stated purpose. Default to not collecting it.** This data is a high-risk target in hostile jurisdictions: per ILGA World's *Laws on Us* report (May 2024), 62 jurisdictions criminalize consensual same-sex sexual acts — "one-third of the world continues to criminalise consensual same-sex sexual acts: 60 UN member States by law, and 2 more de facto."  Store encrypted at rest with key separation; never include in third-party analytics payloads, ad pixels, or vendor SDKs. Source: GDPR Art. 9 special category data; ILGA World.

**R2.5 — Do not infer gender from name, voice, face, or behavior.** Automated gender recognition (AGR) systems have documented error rates exceeding 30% for darker-skinned women  (Buolamwini & Gebru, *Gender Shades*, FAT* 2018, gendershades.org); they fail systematically for trans, nonbinary, and gender-nonconforming people. If a use case "needs" inferred gender, the use case is wrong.

---

## 3. Data Modeling: Address, Location, Contact

**R3.1 — Address fields must support the international address model, not US-only.** Use a single `address_lines[]` array (1–4 lines, ~70 chars each) plus optional `locality`, `administrative_area`, `postal_code`, `country` (ISO 3166-1 alpha-2). Do not require state, ZIP, or county. Many countries have no postal code (Ireland for many addresses, parts of Caribbean, rural addresses globally). Source: Google libaddressinput; UPU S42 standard.

**R3.2 — Support unhoused users.** Address must not be required for account creation. Where address is needed for service delivery (mail-in voting, benefits, prescriptions), accept: general delivery, shelter addresses, PO boxes, and "no fixed address" with a contact mechanism (phone, email, or care-of). Do not run address-verification (USPS DPV, Loqate) as a hard gate — return a soft warning and allow override. Source: National Coalition for the Homeless / NLCHP guidance; HMIS data standards.

**R3.3 — Phone numbers are international by default (E.164 format).** Do not validate against US 10-digit patterns. Some users (refugees, recent immigrants) have foreign numbers as their only contact. Allow multiple phone numbers with labels.

**R3.4 — Location data collected from devices must be the coarsest precision that satisfies the use case.** Prefer city-level over GPS coordinates; prefer "user in country X" over IP geolocation when only jurisdiction matters. High-precision location is a stalking and state-surveillance vector. Source: Coalition Against Stalkerware; NNEDV Safety Net Project (techsafety.org).

---

## 4. Authentication, Account Recovery, Audit Trails

**R4.1 — WCAG 2.2 SC 3.3.8 (Accessible Authentication, Minimum, Level AA): cognitive function tests must not be required for any authentication step.** No CAPTCHAs that require puzzle-solving without an alternative;  no forced password memorization without a recovery path; no "remember the security question" gates. Provide passkey/WebAuthn, email magic links,  or password-manager-friendly inputs (do not block paste, do not block autofill). Source: W3C WCAG 2.2 (w3.org/TR/WCAG22/).

**R4.2 — Account recovery flows must not leak the previous identity.** When a user has changed their name or gender, recovery emails, support tickets, and "account merge" flows must not echo the prior value. Use the opaque account ID for verification.

**R4.3 — Audit logs containing previous names, addresses, or gender markers are themselves sensitive data.** Access them via a separate role with explicit logging; do not surface them in routine customer-service tooling.

**R4.4 — Provide an emergency exit / "panic" mechanism for surfaces dealing with sensitive populations (DV resources, LGBTQ+ resources in hostile regions, abortion access, immigration help).** A quick-exit button that navigates to a neutral page (weather.com is a common choice), clears the back history when feasible, and does not appear in browser history. Source: NNEDV (techsafety.org); Chayn / Hera trauma-informed design framework.

**R4.5 — 2FA via SMS is a known failure mode for survivors of intimate-partner violence (family plans, abuser control of carrier account).** Always offer at least one non-SMS factor (TOTP, passkey, recovery codes printable on paper). Source: Safe Connections Act 2022;  NNEDV Safety Net.

---

## 5. Accessibility (Architecture-Level)

**R5.1 — WCAG 2.2 Level AA is the minimum bar for any user-facing UI; AAA where lives are at stake (healthcare, emergency services, government benefits).** Source: W3C WCAG 2.2, published 5 October 2023.  (Note: ADA Title II per the DOJ April 2024 final rule still cites WCAG 2.1 AA as the technical standard, with compliance deadlines for large public entities extended to April 26, 2027 by the April 2026 Interim Final Rule;  2.2 is the prudent forward-looking target.)

**R5.2 — Every new interactive element must satisfy the WCAG 2.2 additions:**
- **SC 2.4.11 Focus Not Obscured (AA):** sticky headers/footers/cookie banners cannot cover the focused element. 
- **SC 2.5.7 Dragging Movements (AA):** any drag interaction must have a single-pointer (tap/click) alternative. 
- **SC 2.5.8 Target Size Minimum (AA):** interactive targets ≥ 24×24 CSS pixels (prefer 44×44, the AAA bar). 
- **SC 3.2.6 Consistent Help (A):** if help/contact/chat appears on multiple pages, it must be in the same relative position. 
- **SC 3.3.7 Redundant Entry (A):** do not require re-entry of information in the same session. 
- **SC 3.3.8 Accessible Authentication (AA):** see R4.1.

**R5.3 — Semantic HTML before ARIA. ARIA before custom JS.** Use `<button>`, `<a href>`, `<input type=...>`, `<details>`, `<dialog>` before adding `role="button"`. The first rule of ARIA is "don't use ARIA." Source: W3C ARIA Authoring Practices.

**R5.4 — Color contrast ≥ 4.5:1 for body text, ≥ 3:1 for large text and UI components (WCAG SC 1.4.3, 1.4.11).** Never convey information by color alone (SC 1.4.1). Test in forced-colors mode (Windows High Contrast).

**R5.5 — Respect `prefers-reduced-motion`. Animations longer than 5 seconds or flashing >3 times/second are barred (SC 2.3.1, 2.2.2).** Parallax, autoplay carousels, and entrance animations must be gated on `@media (prefers-reduced-motion: no-preference)`.

**R5.6 — Forms must have programmatic labels (`<label for>` or `aria-labelledby`), inline error messages with `aria-describedby`, and `autocomplete` attributes for name/address/email/tel fields (SC 1.3.5).** Autofill is an accessibility feature for cognitive and motor disabilities. 

**R5.7 — Reading level for general-audience copy: 8th grade or below (Flesch-Kincaid).** Use Hemingway/textstat in CI. Critical safety copy (medication instructions, emergency procedures, consent forms): 6th grade or below. Source: NIH plain-language guidelines; CDC Clear Communication Index.

**R5.8 — All non-text content has a text alternative (SC 1.1.1). Decorative images use `alt=""`; informative images describe function, not appearance.** Captions for prerecorded video (SC 1.2.2); live captions for live video (SC 1.2.4, AA).

**R5.9 — Keyboard navigation: every interactive element reachable in a logical order, with a visible focus indicator meeting SC 2.4.13 Focus Appearance (AAA): contrast ratio ≥ 3:1, area ≥ 2 CSS px perimeter.** No keyboard traps (SC 2.1.2). 

**R5.10 — Automated accessibility tools are necessary but insufficient.** Deque's 2021 study of 13,000+ pages and 300,000+ issues (deque.com/automated-accessibility-coverage-report) found "57.38% of issues from first-time audit customers could be found from automated testing"  — meaning automated tooling (axe-core, Lighthouse, pa11y) typically misses ~40% of issue volume. The commonly-cited "30%" figure refers to coverage of WCAG criteria (16/50), not issue volume. **Mandatory:** run axe-core in CI **and** test with at least one screen reader per platform before shipping (NVDA + Chrome, VoiceOver + Safari, TalkBack + Chrome).

---

## 6. Internationalization as Inclusion

**R6.1 — Strings are externalized from code on first commit. No hard-coded user-facing English.** Use ICU MessageFormat for plurals and gender, not concatenation. `"You have " + n + " items"` is a bug.

**R6.2 — RTL support is a launch requirement, not a future ticket, if Arabic, Hebrew, Persian, or Urdu is in scope.** Use logical CSS properties (`margin-inline-start` not `margin-left`); test mirrored layouts; ensure icons that imply direction (arrows, undo) flip appropriately.

**R6.3 — Dates, numbers, currencies, and calendars use the `Intl` API (or platform equivalent), not custom formatters.** Support non-Gregorian calendars (Hijri, Hebrew, Buddhist, Japanese Imperial, Persian) where the target audience uses them. Never display `MM/DD/YYYY` to a non-US user.

**R6.4 — Do not assume Latin script for sorting, search, or username uniqueness checks.** Use Unicode-aware collation (ICU) and case-folding.

**R6.5 — Translatable strings must allow 30–40% expansion (German, Finnish) and contraction (Chinese, Japanese).** Fixed-width buttons are an i18n bug.

---

## 7. Inclusive Terminology in Code, Comments, Docs, Logs

**R7.1 — Banned terms and replacements (apply to code, comments, branch names, log strings, error messages, docs, variable names):**

| Avoid | Use instead | Rationale (source) |
|---|---|---|
| master / slave | primary / replica, leader / follower, main / secondary | Inclusive Naming Initiative (inclusivenaming.org); Linux kernel 2020+  |
| whitelist / blacklist | allowlist / denylist, allow-list / block-list | Khronos, ASWF, Google style  |
| master branch | main | GitHub, GitLab defaults  |
| sanity check | validation check, consistency check, soundness check | ASWF Inclusive Language Guide  |
| dummy value/function | placeholder, stub, sample, fake | Google developer documentation style guide  |
| crippled / crazy / insane | broken, blocked, overwhelming | Khronos; Google style |
| hung (process) | unresponsive, stalled | ASWF |
| grandfathered | legacy, established, carried over | Khronos; tied to Jim Crow voter laws  |
| guys (group) | folks, people, everyone, team | Google style |
| manpower / man-hours | workforce / person-hours, labor-hours | ASWF |
| native (feature) | core, built-in, integrated | ASWF (avoid colonial connotation)  |
| pow-wow | huddle, meeting, sync | ASWF |
| first-class citizen | fully-supported, top-level | Google style |
| culture fit | values fit, mission alignment | ASWF |

**R7.2 — Default pronouns in docs and code comments are "they/them" or second-person ("you").** Avoid "he," "she," or "he/she" when the user's gender is unknown. 

**R7.3 — Code comments and docstrings should not use violent metaphors (kill, hang, abort, execute) when neutral alternatives exist (stop, terminate, run, cancel).** When the term is a Unix API (`SIGKILL`, `kill -9`), keep it but explain in plain prose.

**R7.4 — Error messages and empty states avoid blame, urgency, and trauma triggers.** "Something went wrong on our end" beats "You did this wrong." Never use rage-bait or fake urgency. Source: Chayn trauma-informed design; UX Content Collective.

**R7.5 — Person-first vs. identity-first language is community-specific. Do not default.**
- For autism: default to **identity-first** ("autistic person") per ASAN (autisticadvocacy.org/about-asan/identity-first-language): *"In the autism community, many self-advocates and their allies prefer terminology such as 'Autistic,' 'Autistic person,' or 'Autistic individual' because we understand autism as an inherent part of an individual's identity."* 
- For Deaf and broader disability communities: default to **identity-first** ("disabled person," "blind person," "Deaf person") per the NCDJ Disability Language Style Guide (ncdj.org/style-guide): *"Several U.S. disability groups have always used identity-first terms, specifically the culturally Deaf community and the autistic rights community."*  The NCDJ's primary recommendation is: *"Ask the disabled person or disability organizational spokesperson about their preferred terminology."* 
- For substance use, mental health, and incarceration: default to **person-first** ("person with substance use disorder," "person experiencing homelessness") per APA Style 7th ed. and SAMHSA — APA notes that *"both person-first and identity-first approaches to language are designed to respect disabled persons; both are also fallible."*
- When in doubt, ask the user how they wish to be referred to and store it as a profile field.

---

## 8. Algorithmic Fairness & ML

**R8.1 — Before any ML model that affects a person's access, price, opportunity, or freedom: write a model card (Mitchell et al., FAT* 2019) and a datasheet for the dataset (Gebru et al., arxiv.org/abs/1803.09010).** Source: Hugging Face / Google Model Cards.

**R8.2 — Question your proxy.** The Optum healthcare algorithm (Obermeyer et al., *Science* 2019, doi:10.1126/science.aax2342) used healthcare cost as a proxy for healthcare need and cut Black patients identified for care from 46.5% to 17.7%: *"Remedying this disparity would increase the percentage of Black patients receiving additional help from 17.7 to 46.5%. The bias arises because the algorithm predicts health care costs rather than illness."*  Before training, write down: what is the true outcome I want to predict, what is the proxy I'm actually predicting, and how does access/measurement of the proxy vary by group?

**R8.3 — Disparate-impact testing is required for any model used in hiring, lending, housing, criminal justice, healthcare triage, content moderation, or benefits eligibility.** Compute selection rate, false-positive rate, and false-negative rate across protected groups (race, gender, age, disability). The 4/5ths rule (EEOC) is a starting point, not sufficient. Source: ProPublica's "Machine Bias" (May 2016, propublica.org/article/machine-bias-risk-assessments-in-criminal-sentencing) reported COMPAS false-positive rates of 44.9% for Black defendants vs. 23.5% for white defendants — *"The formula was particularly likely to falsely flag black defendants as future criminals, wrongly labeling them this way at almost twice the rate as white defendants."*  Amazon's scrapped recruiting model (Reuters 2018) penalized résumés containing "women's." 

**R8.4 — Face, voice, gait, and affect recognition is barred from production unless (a) the user has opted in, (b) accuracy is validated across skin tones (Fitzpatrick I–VI) and gender expression, and (c) failure modes are non-punitive.** Buolamwini & Gebru's *Gender Shades* (FAT* 2018, gendershades.org / proceedings.mlr.press/v81/buolamwini18a.html) found: *"darker-skinned females are the most misclassified group (with error rates of up to 34.7%). The maximum error rate for lighter-skinned males is 0.8%."*  MIT News (news.mit.edu/2018/study-finds-gender-skin-type-bias-artificial-intelligence-systems-0212) reported that "for the darkest-skinned women in the data set — those assigned a score of VI — [error rates] were 46.5 percent and 46.8 percent"  for two of the three commercial systems tested.

**R8.5 — Automated decisions affecting individuals must include a human-in-the-loop appeal path (GDPR Art. 22, EU AI Act, NYC Local Law 144 for AEDTs).** "The algorithm said no" is not an explanation.

**R8.6 — Training data provenance is logged. Indigenous data is governed by the CARE Principles (Global Indigenous Data Alliance, gida-global.org/careprinciples), not just FAIR.** Per GIDA's official one-pager: **C**ollective Benefit — *"Data ecosystems shall be designed and function in ways that enable Indigenous Peoples to derive benefit from the data."*  **A**uthority to Control — *"Indigenous Peoples' rights and interests in Indigenous data must be recognised and their authority to control such data be empowered."*  **R**esponsibility — *"Those working with Indigenous data have a responsibility to share how those data are used to support Indigenous Peoples' self-determination and collective benefit."*  **E**thics — *"Indigenous Peoples' rights and wellbeing should be the primary concern at all stages of the data life cycle and across the data ecosystem."* 

---

## 9. Privacy for Vulnerable Populations

**R9.1 — Demographic data (race, ethnicity, disability, gender identity, sexual orientation, immigration status, religion) is "special category" under GDPR Art. 9 and equivalent state laws (CCPA/CPRA, Illinois GIPA).** It must be: separately consented, encrypted at rest with key separation from operational data, excluded from default analytics events, never sent to third-party SDKs without a documented DPA.

**R9.2 — Immigration status and legal-name-vs-chosen-name divergence are particularly sensitive in the US post-2025; do not log them, do not include them in webhooks, do not send them to AI vendors without a BAA-equivalent.**

**R9.3 — Minors (under 13 US COPPA, under 16 GDPR default): no behavioral advertising, no facial/biometric data, parental consent flows must not out the minor (especially LGBTQ+ minors).**

**R9.4 — Healthcare, reproductive health, and mental health data require HIPAA-equivalent handling regardless of whether your entity is a Covered Entity.** After Dobbs (2022), period-tracking, location, and search data have been subpoenaed in abortion prosecutions; design for "your data could be subpoenaed."

**R9.5 — Account deletion is a real delete, not a soft-flag, within the legally-permitted retention window.** Soft-delete that preserves names, photos, and demographic markers is a deadnaming and outing vector when leaked or breached.

---

## 10. Process Rules for the Agent / Orchestrator

**R10.1 — When generating a schema, form, or model that touches identity, output a "demographic data audit" comment block listing each field, its justification (per R0.3), and its retention.**

**R10.2 — When generating UI, run an automated accessibility check (axe-core) as part of the PR and include results in the PR description. Failures of WCAG 2.2 A or AA block merge.**

**R10.3 — When generating ML training code, output a model-card stub and a datasheet stub. Refuse to generate face-recognition, gender-inference, or emotion-recognition code without an explicit override and a documented use case.**

**R10.4 — When suggesting a variable name, branch name, or commit message, check against the R7.1 banned-terms list and propose the replacement. If the user insists, log the override in the PR description with a one-line justification.**

**R10.5 — When the user requests "collect user gender," "collect user race," "collect user religion," or similar: pause and ask for the decision the field will inform (R2.1). If none is provided after one round-trip, refuse to add the field and suggest deletion of the requirement.**

**R10.6 — When the user requests features that affect survivors, minors, undocumented users, LGBTQ+ users in hostile jurisdictions, or Indigenous communities, surface R0.1 (community participation evidence) and R0.2 (intimate-threat model) before writing code.**

**R10.7 — Cite the rule number in code comments and PR descriptions when applying a constraint (e.g., `// R1.5: deadname excluded from audit-log surface`).** This makes the rules legible to reviewers and to the user; it also makes overrides traceable.

---

## Appendix A — Canonical Sources (for the agent to cite)

- **W3C standards:** WCAG 2.2 (w3.org/TR/WCAG22/), Personal Names i18n (w3.org/International/questions/qa-personal-names), ARIA Authoring Practices.
- **Falsehoods Programmers Believe About Names:** McKenzie, kalzumeus.com; Rogers with examples, shinesolutions.com.
- **Microsoft Inclusive Design Toolkit:** inclusive.microsoft.design + Inclusive Design for Cognition guidebook.
- **Design Justice:** Costanza-Chock, MIT Press 2020 (designjustice.mitpress.mit.edu); Design Justice Network Principles.
- **Disability Justice:** Sins Invalid, "10 Principles of Disability Justice" by Patty Berne  (sinsinvalid.org/10-principles-of-disability-justice).
- **CARE Principles for Indigenous Data Governance:** Global Indigenous Data Alliance (gida-global.org/careprinciples; one-pager PDF at gida-global.org/s/CAREPrinciples_OnePagersFINAL_Oct_17_2019.pdf).
- **Inclusive Naming:** inclusivenaming.org; Google developer documentation style guide (developers.google.com/style/inclusive-documentation); Khronos inclusive language; Academy Software Foundation (aswf.io/blog/inclusive-language).
- **Person-first vs identity-first:** ASAN (autisticadvocacy.org/about-asan/identity-first-language); NCDJ Disability Language Style Guide (ncdj.org/style-guide); APA Style (apastyle.apa.org/style-grammar-guidelines/bias-free-language/disability).
- **Algorithmic harm case studies:** Obermeyer et al. (*Science* 2019, science.org/doi/10.1126/science.aax2342, Optum); ProPublica "Machine Bias" (propublica.org/article/machine-bias-risk-assessments-in-criminal-sentencing) and "How We Analyzed the COMPAS Recidivism Algorithm"; Reuters 2018 (Amazon hiring); Buolamwini & Gebru, *Gender Shades* (FAT* 2018, gendershades.org, proceedings.mlr.press/v81/buolamwini18a.html); EFF on Facebook real-name (eff.org/deeplinks/2014/09/facebooks-real-name-policy-can-cause-real-world-harm-lgbtq-community). 
- **Healthcare:** HRC Foundation patient identification; PMC10198525; WPATH EMR Working Group; Healthcare IT News coverage of inclusive EHRs.
- **Trauma-informed and DV/IPV:** NNEDV Safety Net (techsafety.org); Freed et al. CSCW 2017 (nixdell.com/papers/a046-freed.pdf); Chayn / Hera framework; eSafety Commissioner Safety by Design; Coalition Against Stalkerware.
- **Trans tech / queer HCI:** Haimson, *Trans Technologies* (MIT Press 2025);  CSCW / CHI queer HCI literature; ALBA Network (alba.network/GSDinclusiveforms).
- **Legal/regulatory:** GDPR (Articles 5, 9, 22); ADA Title II final rule (FR Doc. 2024-07758, effective June 24, 2024); EAA / EN 301 549; NYC Local Law 144 (AEDTs); EU AI Act; ILGA World *Laws on Us* (May 2024) for jurisdictional risk modeling (62 jurisdictions criminalizing same-sex acts).