# Two-minute jury demo — EHDS Access Desk

Site: https://health-data-access-compass.lovable.app. **Recording link: TODO — insert a video of at most two minutes.**
First half: the applicant. Second half: staff. Rehearse once; every click below names the control as it is labelled today (English UI).

## Before recording (5 minutes)

1. Open the site in a fresh window, 1280 px wide or more. In the first-visit dialog choose **EN**, **Austria**, **Applicant**.
2. Keep this text in the clipboard for the quick-test (step 0:25). It is three of the ten official requests, R01, R08 and R05, from `TRACK-3-ehds/requests/`. Paste them as one JSON array: `[ <R01.json contents>, <R08.json contents>, <R05.json contents> ]`.
3. Staff account: create it with `scripts/create-staff-user.ts` (see `docs/running.md`) and sign in once to be sure it works. The staff half needs at least two requests **waiting for you**; the curated demo data has twelve (for example `AT20260420` and `AT20260421`). Do not approve them during the rehearsal.
4. Mute notifications. Open nothing else.

## Running order (0:00–2:00)

The quoted lines are the spoken script. Expected values are from the official `expected.json`; today's live eval reproduces all of them (10/10, 6/6).

| Time | Clicks | Point at | Say |
|---|---|---|---|
| 0:00–0:08 | Landing page. | Headline; the three promises (legal basis cited, no patient data leaves, same answer every time). | "Under the EHDS every request for health data needs a lawful decision. This desk gives it in seconds and explains it in plain words." |
| 0:08–0:25 | **Submit a request** → **Load a sample** → *R02 — private health insurance premiums*. Do not submit. | Right panel **Likely outcome**: "Likely: rejected", then the reason "insurance premiums … prohibited (Art. 54)". | "The applicant writes the question and purpose first. Before submitting, they already see the likely outcome: insurance pricing is a prohibited purpose under Article 54, even though only statistics were asked for." **Proves:** the purpose gate runs before any data is touched. |
| 0:25–0:45 | Role button → **Demo**. Paste the array into **Request JSON** → **Run all**. | The table fills row by row: R01 *Approved – statistics* (Art. 53, 69), R08 *Approved – statistics*, R05 *Approved – secure environment* (Art. 53, 66, 68, 73); each under two seconds. | "Judges can drop their own requests here. Three official ones: two get anonymised statistics, the model-training request gets a secure environment with exactly 1,152 patients and no records in the browser." **Proves:** end to end on new requests, correct form of access. |
| 0:45–1:00 | R08 row → **Open letter**. Scroll to **Results**. | Headline "Yes — approved for anonymised statistics"; Burgenland: women with BMI **<10**, mean BMI **suppressed**; Niederösterreich: **15**, mean BMI **27.2**. The deadline line and the law quoted word for word. | "Every letter starts with a plain yes or no, quotes the regulation verbatim and shows the legal deadline. Small groups stay visible but their counts show 'under ten' and their means are hidden. Opted-out patients were removed before any count." **Proves:** small-cell rule, opt-outs, understandable decision. |
| 1:00–1:12 | **Back to desk** → role button → **Staff** → sign in. | The role button shows the number waiting; the page opens with **Waiting for you (N)**, oldest first, each with its due date. | "Staff sign in and see what waits for them: requests the rules could not decide with confidence, with the legal deadline." **Proves:** humans decide where the law leaves room; nothing is silently approved. |
| 1:12–1:30 | First waiting request (`AT20260420`) → template **Approve: permitted purpose** → **Approve**. | The reason fills in and stays editable; after approving, the request leaves the list and the history shows the decision with your e-mail. | "One click fills a legal reason, the reviewer can edit it, and the decision is recorded under their own identity." **Proves:** audit trail with a real login, not a typed name. |
| 1:30–1:45 | Next waiting request (`AT20260421`) → **Override** → decision **Rejected** → reason: "Purpose statement too vague to confirm an Article 53 use; applicant asked to resubmit." → **Override**. | The history row now shows *overridden* with the reason. | "Staff can also override the rules, and the register shows that a person did." **Proves:** the tool supports, never replaces, the access body. |
| 1:45–1:53 | History → the R05 row → **Download**. | Message "Download blocked … (EHDS Art. 73)" with **403**; the attempt appears in the blocked-download log. | "Data in the secure environment cannot leave it. The attempt itself is logged." **Proves:** download block and traceability. |
| 1:53–2:00 | Landing page, **Tested before the next request** tile. | 10/10 · 6/6 · 0 leaks · 57 jury requests, 0 wrong. | "Ten of ten official requests correct, zero leaks, fifty-seven unseen requests without a wrong decision. Rules decide; people stay responsible." |

## If a slot runs long

Skip 1:30–1:45 (the override). Never skip 0:08–0:25 or 1:12–1:30: they carry the two scoring points "can an applicant understand the decision" and "would an access body use it".

## Numbers you may say

| Claim | Value | Source |
|---|---|---|
| Vienna, R01 | 263 adults with type 2 diabetes of 3,247 adults = 8.1 % | `expected.json`, live eval 6/6 |
| Burgenland / Niederösterreich, R08 | <10 and suppressed / 15 and 27.2 | `expected.json` |
| R05 cohort | 1,152 patients in the secure environment | `expected.json` |
| Eligible population | 19,161 of 20,000 synthetic patients (839 opted out, Art. 71) | track `data/README.md`; never shown by the app |
| Tests | 10/10 decisions, 6/6 numbers, 0 leaks, 3 consistent runs; 57 jury requests, 0 wrong, 0 leaks | measured 30 Oct 2026, README |

Do not quote an opt-out count from the screen (the app never shows one) and do not invent a latency figure; "under two seconds" is what was measured.

## What works / what does not (if asked)

Works: deterministic decisions with the rule id and version, verbatim legal quotes checked against EUR-Lex, opt-out filtering, small-cell and secondary suppression, secure-environment cohorts with blocked downloads, staff login with audit log, legal deadlines, EN/DE, public transparency register, per-access-body rules (AT, DE).
Does not, yet: the optional AI help (rewording unclear definitions, drafting a memo) is off until an OpenRouter key is set, and can only make outcomes stricter when on; staff accounts are created by script, not self-service; the secure environment is an isolated Postgres schema, not a full research workspace; synthetic data only.
