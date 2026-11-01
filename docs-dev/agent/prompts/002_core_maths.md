# Task: Core maths and filters (WP2)

## Goal

The generic, DOM-free numerical core: standardisation with floors and PCA, weighted ridge with
exact grouped leave-one-out, robust refitting, simplex stacking, filters, RNG and statistics.

## Scope

Implement only the work described in this prompt. Do not implement adjacent systems or future
prompts. Runs in parallel with 003–007 (in its own worktree and `E2E_PORT`).

## Owns

`src/core/maths/{linalg,standardise,ridge,groupedLoo,robust,pca,simplex,rng,stats,wilcoxon}.ts`,
`src/core/filters/{oneEuro,blinkHold}.ts`, `tests/unit/maths-*.test.ts`,
`tests/unit/filters-*.test.ts`.

## Context

`specification.md`: §4.8.2 (standardisation, floors, PCA, clipping), §4.8.3 (weighted ridge,
exact grouped LOO via the hat-matrix identity, CV score, Huber IRLS and hard rejection,
leverage), §4.9 (simplex stacking by support enumeration, nested CV), §4.11 (One Euro, blink
hold), §4.12 (BCEA and Wilcoxon usage), §6 (`groupedLooResiduals` signature), §10.1 WP2,
Appendix A (`LAMBDA_REL`, `PCA`, `ROBUST`, `ONE_EURO`, `BLINK_HOLD`).

`core/` imports nothing outside `core/` and uses `.ts` import extensions, so `node --test` runs it
from source (§5).

## Deliverables (required changes)

1. Everything in §4.8.2 and §4.8.3, generic and mapper-agnostic: weighted standardisation with
   per-column floors; seeded randomised PCA (Halko: k = 64, 10 extra dimensions, 2 power
   iterations, Gaussian sketch from `mulberry32(seed)`, one common scale √λ₁); prediction-time
   clipping with the extrapolation flag; Cholesky ridge with an unpenalised intercept and
   λ = λ_rel·Σw; `groupedLooResiduals` exactly as the §6 signature; the CV score (per-group
   median angular error, mean and SE over groups) with the angular error function passed in;
   two Huber passes and hard rejection; leverage and h95.
2. §4.9: the simplex-constrained least-squares solver (K ≤ 4, all 2^K − 1 supports, KKT) and a
   nested-CV helper; renormalisation over available members.
3. `mulberry32`, Fisher–Yates, robust statistics (median, MAD, percentiles, weighted median) and a
   Wilcoxon signed-rank test. Export it as
   `wilcoxonSignedRank(differences: readonly number[]): { statistic: number; pValue: number; n: number }`
   so that 003 can import it.
4. `OneEuroFilter2D` (port of gaze-lite's, in degrees, resetting after gaps over 200 ms) and
   `blinkHold` (0.6/0.4 hysteresis, 800 ms hold cap, hide after 600 ms).
5. The unit tests of §10.1 WP2.

## Do not implement

- mapper specs, feature extraction or the calibration pipeline (005–008);
- angle conversions (003 owns `core/geometry/angles.ts`; take the angular error as a parameter);
- anything that touches the DOM, or a change to `constants.ts` or the contracts.

## Acceptance criteria

The task is complete when:
- the §10.1 WP2 list passes: linear algebra, ridge against the closed form, grouped LOO equal to
  brute-force refits (max |Δ| < 1e-9) on random designs with unequal groups and weights, robust
  down-weighting of a planted outlier, floors, clipping, byte-identical seeded PCA that matches the
  exact SVD subspace on a low-rank fixture, simplex KKT and weight recovery, the mulberry32
  golden sequence, One Euro step response and reset, blink-hold hysteresis and caps, Wilcoxon
  against tabulated values;
- a fit of 1,500 × 72 with 13 groups and 10 λ values takes under 300 ms in Node;
- `npm run check` passes.

## Checks

`npm run check`.

## Commit and push

If and only if the scope was followed and checks pass, create one commit on `main` using this
file's exact filename as the commit message, run `git pull --rebase`, then push. Never
force-push.

Do not commit or push partially completed work unless explicitly instructed.

## Final report

End with the required final report specified in `AGENTS.md`.
