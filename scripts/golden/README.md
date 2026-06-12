# ETI calibration set ("golden" resumes)

This folder holds the sample resumes used to calibrate the ETI scoring engine
before flipping the v2 rubric on in production. The calibration harness lives at
`scripts/calibrate-eti.ts` and is run by the founder **locally** — it makes live
LLM / GitHub calls and must never run in CI.

## Why this exists

`ETI_RUBRIC_VERSION=v2` is opt-in. Before flipping it on we need to compare the
**v1 vs v2 score distributions** on real resumes. The harness runs every
candidate through `runEvaluation` twice in the same process — once with
`ETI_RUBRIC_VERSION=v1`, once with `=v2` — and prints a side-by-side comparison.
(`activeRubricVersion()` reads the env var at call time, so the harness just sets
`process.env.ETI_RUBRIC_VERSION` around each call.)

## Folder layout

Point the harness at a folder containing **one subfolder per candidate**. Each
candidate subfolder needs exactly two files:

```
<folder>/
  alice/
    resume.pdf      # the candidate's resume (PDF, read as base64)
    meta.json       # { "experience": "<2", "githubUrl": "https://github.com/alice/proj" }
  bob/
    resume.pdf
    meta.json       # { "experience": ">=2" }
  carol/
    resume.pdf
    meta.json       # { "experience": "<2" }
```

The candidate's display name in the output is the subfolder name. Subfolders
missing `resume.pdf` or `meta.json` (or with an invalid `meta.json`) are skipped
with a warning, not fatal.

> Do **not** commit real candidate resumes or PII to the repo. Keep the actual
> calibration set outside version control (e.g. a local `~/eti-golden/` folder)
> and pass its path to the script. This `README.md` is the only file that lives
> here.

### `meta.json` schema

| field        | type                  | required | notes                                                                 |
| ------------ | --------------------- | -------- | --------------------------------------------------------------------- |
| `experience` | `"<2"` \| `">=2"`     | yes      | `"<2"` = junior track (also scores GitHub), `">=2"` = senior track.   |
| `githubUrl`  | `string`              | no       | Only used on the junior track; ignored for `">=2"`. Omit if none.     |

## Running it

The harness is TypeScript, run through `tsx` (fetched on demand; not a repo dep):

```bash
# Prints usage and exits 0 — makes NO network calls. Safe anywhere.
npx tsx scripts/calibrate-eti.ts

# Real calibration run — makes LIVE OpenAI / Gemini / DocumentAI / GitHub calls.
# Reads keys from .env.local exactly like the app does. Run locally only.
npx tsx scripts/calibrate-eti.ts ~/eti-golden
```

Each candidate is evaluated **twice** (v1 then v2, sequentially so the per-call
env swap is unambiguous). The script writes **nothing to Firestore** — all output
goes to stdout:

- **Per-candidate table** — name, experience, v1 score, v2 score, delta, v1
  overlord, v2 overlord.
- **Band distribution** — count of candidates in each score band
  (`<50` / `50–64` / `65–79` / `80+`) for v1 vs v2, plus the v2−v1 delta per band
  and the `matchable` (score ≥ 50) count, which is the production gate.
- **Overlord trigger rates** — how often the overlord cap fired under v1 vs v2,
  broken down by cap kind, with a gate warning if the v2 rate is ≥ 10%.

### Cost / time note

A real run is `2 × N` full evaluations, each hitting DocumentAI (resume OCR),
OpenAI (scoring), and — on the junior track — GitHub. Budget accordingly and
start with a small representative set (~10–20 resumes spanning weak/strong and
junior/senior) before scaling up.

## Post-run gates (read before flipping anything)

Use the harness output to decide whether v2 is safe to ship. **Do not flip the
flag on distribution vibes alone** — check each gate:

1. **v2 distribution looks right** — Flip `ETI_RUBRIC_VERSION=v2` only if the v2
   band distribution is sane: known-strong candidates land in `65–79`/`80+`,
   known-weak land `<50`, and v2 has not collapsed everyone into one band or
   wildly inflated/deflated scores vs v1. The per-candidate deltas should be
   explainable, not random.

2. **Senior overlord shadow rate < ~10%** — Enable the senior overlord only if
   its shadow (v2) trigger rate is below ~10%. A higher rate means the cap is
   firing on legitimate candidates and would suppress real scores; investigate
   the rubric before enabling. The harness prints a `GATE WARNING` when v2's rate
   is ≥ 10%.

3. **Re-check band + weak-pool thresholds** — After v2 is on, re-verify the
   decision thresholds still mean what they did under v1:
   - the **50** boundary (`is_matchable` / shows up in matching),
   - the **65** and **80** boundaries (band labels used downstream),
   - the **weak-pool** thresholds used by the matching pipeline.
   v2 may shift the raw→normalized mapping, so a 50 under v1 is not necessarily a
   50 under v2. Confirm the cutoffs still separate the populations you expect
   before relying on them in production.
