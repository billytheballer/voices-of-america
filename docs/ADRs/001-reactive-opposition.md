# ADR 001: Reactive opposition baseline instead of an autonomous AI opponent

**Status:** Accepted (Stage 2)

## Context
The player governs as R or D. The other party needs a platform that voters compare against, but scripting an opposing "AI president" adds complexity, nondeterminism and balance risk.

## Decision
The opposition platform is a pure function of (its party anchor, the player's platform, the previous opposition platform):

1. **Player platform** `P` moves toward each enacted bill's `policy_vector`, weighted by radicalism.
2. **Provocation** per axis = 0 when `|P| ≤ threshold`, ramping linearly to 1 at the axis extreme.
3. **Target** = `anchor + mirrorStrength × provocation × (−P − anchor)`, clamped to `anchor ± corridor`.
4. **Step** = previous + `inertia × (target − previous)`.

Party anchors are the weight-averaged ideal points of each party's home factions, so they shift automatically when faction data changes.

## Consequences
- Fully deterministic and unit-tested (`src/engine/__tests__/reactiveBaseline.test.ts`).
- Reacts per axis: a GOP player's America First trade agenda pulls Democrats globalist on trade, while their positions on other axes stay put. A Dem player's DSA economics pulls the GOP toward fiscal conservatism. Factions that are only partly aligned (America First and Progressives are both protectionist-leaning) produce nuanced results instead of a simple left/right flip.
- All coefficients are in `balance.config.ts → OPPOSITION`.
