# Simulation Model

All of this lives in `src/engine` as pure, deterministic TypeScript. Every coefficient lives in `src/data/balance.config.ts`.

## 1. Electorate
Each of the 51 states holds 8 factions, each with:
- `weight`: share of the state's electorate. Derived from the state's lean and demographic dials (`data/derive/stateElectorate.ts`).
- `baseTurnout`: the faction's national baseline plus the state's turnout culture.
- `satisfaction`: 0–100, **with the player's party**. 50 = neutral.
- `turnoutShift`: a temporary boost or drag from faction rules. It fades over time.

## 2. Turnout
```
enthusiasm = |satisfaction − 50| / 50
turnout    = baseTurnout + elasticity × 0.12 × (enthusiasm − 0.25) + turnoutShift
midterm:     × 0.78, and −0.03 more for factions whose party holds the White House
clamped to [0.20, 0.95]
```
Love and anger both mobilize; indifference keeps people home. High-elasticity factions (Progressive, America First) swing hardest.

## 3. Vote choice
```
utility  = 2.2 × (sat − 50)/50                      # how the player's party is doing by them
         + 1.6 × partyLean (toward the player)      # partisan identity
         + 1.2 × 4 × proximityAdvantage             # whose platform is closer, salience-weighted
P(player | major party) = sigmoid(utility)
```
A fixed `thirdPartyRate` per faction peels off first (30% for Libertarians, 5% for Independents).
`proximityAdvantage` is where the **reactive opposition** bites: when the opposition shifts toward a faction's ideal point, that faction drifts away from you.

## 4. State margin and calibration
```
votes = Σ_f weight_f × turnout_f × P_f
rawMargin = (player − opposition) / cast × 100
margin    = rawMargin + calibration[state]
```
`calibration[state]` is computed once at game start. It makes every state's opening margin equal its authored lean exactly. The faction model then drives **changes** from that baseline. This keeps the opening map faithful to the data without overfitting 51 × 8 parameters.

## 5. Each turn
1. **Event**: weighted draw (seeded RNG). Conditions raise the odds and cooldowns block repeats. Its metric and faction shocks are applied.
2. **Bill** (if enacted): LLM faction modifiers × 1.5, then state overrides, then deterministic faction rules. Metric impacts come from qualitative tags via `impactTables.ts`, scaled by `0.5 + 0.05 × programmatic_score`.
3. **Metric pressure**: metrics above their comfort levels lower satisfaction with the incumbent, weighted by each faction's sensitivity.
4. **Drift**: metrics revert toward long-run levels, debt grows by the structural deficit, and satisfaction decays 6% back toward 50.

## 6. Monte Carlo (`engine/simulation`)
Each of the 10,000 runs draws:

| Error term | Distribution | Why |
|---|---|---|
| National | Student-t (df 5), SD 2.5 | One shared miss for every state; fat tails allow upsets |
| Regional | Normal, SD 1.8, one per region | Rust Belt states miss together |
| Faction turnout | Normal, SD 3 pts × elasticity | "Progressives surged" or "America First stayed home" |
| State | Normal, SD 2.2 | Local noise |
| District (ME/NE) | Normal, SD 1.5 | On top of the parent state |

```
margin_s = base_s + h·(ε_nat + ε_region + ε_state) + h·Σ_f sensitivity_s,f · τ_f
h = sqrt(1 + 0.25 × turnsUntilElection)
```
`sensitivity_s,f` (margin change per +1 turnout point of faction f in state s) is computed by finite differences on the real vote model. A national turnout surprise therefore moves each state according to its own faction mix.

**Outputs:** win / tie / loss odds, EV histogram + 90% interval, popular-vote odds, Electoral College–popular vote split odds, per-state win odds and margin intervals, ME/NE district odds, and the tipping-point distribution (the unit that delivers the winner's 270th EV).

**Why correlation matters:** with independent state errors, misses cancel out and 10,000 runs produce absurd 99% confidence. Shared national and regional errors make battleground flips cluster, as they do in real elections. Tests assert P(lose PA ∧ lose WI) > P(lose PA)·P(lose WI).

**Engineering:** typed arrays, zero allocation in the hot loop, and a chunked async generator, so the Web Worker streams progress snapshots and honors cancellation. The chunked runner is bit-identical to the synchronous one. 10,000 runs take about 200 ms.

## 7. Congress (`engine/legislature`)

**Political capital.** Cost = 5 + 6 × (radical − 3)⁺, and executive orders cost half. Capital regenerates each turn by 12 × (0.4 + 1.2 × approval), capped at 100.

**Roll calls.** Each member votes yes with a party-level probability:
```
own party  = 0.97 − 0.035·(radical − 4)⁺ + 0.012·coalitionMood + whip
opposition = 0.04 + 0.05·(6 − radical)⁺  + 0.012·coalitionMood + whip/2
both × (1 − 0.06·(5 − programmatic)⁺)
```
`coalitionMood` is the average LLM modifier across that party's home factions, so members follow their voters. The yes count is a sum of two binomials, and **P(pass) is computed exactly by convolution**, with no sampling. The House needs 218. The Senate needs 60, or 51 (50 + VP) through reconciliation for bills the LLM flags as budgetary. Executive orders skip Congress but face court risk from the LLM's legal flags.

**Seats.** House: the within-state seat–vote curve s/(1−s) = (v/(1−v))^2.6 is applied to each state's simulated margin plus a national House-specific swing, with stochastic rounding. Senate: each race up that cycle = state margin ± 2-point incumbency + candidate-quality noise (SD 3). The same correlated draws drive the presidency, House and Senate, so coattails emerge naturally. A 50–50 Senate goes to the VP's party.

## 8. Game loop (`engine/loop`)

One turn = one quarter. The calendar is a pure function of (year, quarter, is the player the sitting president?):

| Year | Q1–Q2 | Q3 | Q4 |
|---|---|---|---|
| Presidential (2028, 2032…) | primary (governing if sitting) | general campaign | general election |
| Midterm (2030, 2034…) | governing | midterm campaign | midterm election |
| Odd | governing | governing | governing |

**`endTurn`:** election night (one draw of the forecast model from the game RNG) → the opposition reacts → incumbency-weighted metric pressure → drift → decay → capital regen → calendar → the next turn's event, so the player sees the crisis while drafting.

**Blame follows the White House.** Event shocks and metric pressure hit the incumbent. When the other party governs, the player gains half of what the incumbent loses. Debt pressure only counts debt above the baseline deficit path.

**Loop:** win and you govern. After two terms, a successor inherits the party's White House at the next presidential year. Lose a presidential election and the game ends. Midterms only reshape Congress.

**Difficulty:** Realistic uses the authored map. Balanced applies a uniform shift so the tipping-point state starts at 0. Hard is Balanced minus 3 points. In hands-off play the 2028 win rate is: Realistic D 43% / R 65%; Balanced D 58% / R 48%; Hard 20% for either.

**Determinism:** the whole game is one `GameState` (about 57 KB of JSON). Same seed + same actions = identical game, and opening the forecast never consumes game randomness.

## 9. Campaigns (`engine/campaign`)

Campaign quarters (primary, general campaign, midterm campaign) give **3 actions** each:

| Action | Effect | Trade-off |
|---|---|---|
| Fundraise | +$M = 40 × (0.6 + 0.8 × approval) × donor mood | Donors are your moderate wing (+1); your base wing notices (−0.5) |
| Rally in a state | Home factions +2 satisfaction and +2.5 pts turnout there; independents +1.5 | Diminishing returns: ½, ⅓… per repeat visit in a cycle |
| Buy ads in a state | Persuadables gain 1.6 × √(spend ÷ ($1.5M × House seats)), capped at 4 per buy | Big states cost more per voter; returns shrink with cumulative spend |

**Primary** (presidential years, non-incumbents, resolved at the end of Q2): each wing's support = clamp(0.5 + (satisfaction − 50) / 50 + 0.2), weighted by who votes in primaries (activists dominate). A free **pledge** per quarter lifts one wing (+4) at the others' expense (−1) and pulls your platform toward that wing, which the reactive opposition can then exploit in November. Losing the primary ends the game.

**Debate** (once, in the general campaign): three seeded questions; for each, speak to your base, pivot to the center, or attack. Fixed faction effects per style plus a performance roll (attacks are higher-variance), and centrist or base answers pull your platform on that question's axis.

**Opposition response:** each general or midterm campaign quarter, the opposition advertises in the six closest states (independents −1.2, your moderate wing −0.6, scaled by 0.45 + 0.15 × the opponent's fundraising). In the general campaign the opponent also attacks the axis where your platform is farthest from the independent voter: up to −0.6 with independents nationwide, scaled by their charisma. A rapid-response team halves both for the quarter.

### The field (`engine/campaign/race.ts`, `data/candidates.ts`)

Each presidential cycle has an opposing nominee and, if you face a primary, a rival from your own party. Through 2036 both come from weighted pools of real politicians; after that, from generated names. Draws use `hash(seed, cycle, party, role)` rather than the main RNG stream, so they are stable per game and adding them did not change any existing replay. Nobody is drawn twice.

- **Rival:** your primary support in the rival's wing drops by 8 points.
- **Convention** (start of Q3): the nominee's home state moves −3 toward them (+2 pts turnout for their partisans), and the opposition platform moves 15% of the way to their wing's ideal point.
- **Debate:** your performance mean shifts by 0.4 × (3 − their charisma); every point of your research file adds +0.3 to each attack answer.

### Negative campaigning

Every attack costs one of the three actions. Effectiveness = (1.3 − 0.1 × their discipline) ÷ (1 + 0.35 × negativity). Negativity rises by 1 per attack (0.5 per attack ad), falls by 1 each quarter, and resets each cycle. Backlash chance = 8% + 6% × negativity (halved for research releases and attack ads); a backlash costs 1 point with independents and 0.5 with your moderate wing.

| Action | Effect |
|---|---|
| Hit their record on an axis ($10M) | Independents nationwide gain 0.3 × (contrast + 1.5), clamped to [−1.2, +1.8], where contrast = their distance from the independent ideal minus yours. Your own weak spots backfire. |
| Opposition research ($15M) | The file grows by 1–2 (max 3). |
| Release the file | Independents +0.6 × file; the other party's turnout −0.8 pts × file nationwide. Empties the file. |
| Attack ad (in a state) | 70% of a positive ad's persuasion, plus their partisans' turnout −1 pt per persuasion point there. |
| Rapid response | Halves opposition ads and the opponent's attack this quarter. |

**Balance check** (Balanced, 200 games per party, 2028): with no campaigning, D 46% and R 41%. The opposition now campaigns with a named nominee, so standing still costs more than before. A simple positive strategy (fundraise, rally and advertise in the closest states) wins about 69% (D) and 59% (R); adding rapid response and record attacks raises D to about 80%. No primaries were lost.

## 10. The executive branch (`engine/government`, `data/departments.ts`)

Sixteen departments (the fifteen cabinet departments plus the EPA), each with a baseline budget, its current work, its factions' feelings about it growing (−3 to +3), the direction growth moves policy, and two or three directives. Every action is compiled into a `BillAnalysis` and sent through `submitBill`, so the vote math, court risk, faction effects, metrics and platform drift are the ones bills use.

| Action | Instrument | Radical | Faction reaction | Notes |
|---|---|---|---|---|
| Expand / cut 15% | Budget request (reconciliation-eligible) | 3 (4 at ±2) | ±1.5 × support | Debt ±minor (moderate for Defense, HHS and VA); department-specific metrics |
| Eliminate | Legislation | 9 | −2.5 × support, independents −1 | Court challenge likely. Defense, State, Justice, Treasury and VA can't be eliminated. |
| Re-establish | Legislation | 6 | +2 × support | |
| Directive | Executive order | per directive | authored per faction | One in force per department; replacing one swaps it |
| Rescind | Executive order | 2 | −½ × the directive's | No court risk |

Quarterly slots: 1 bill, 2 executive orders, 1 budget request. Any drafted bill can also be signed as an executive order: half the capital, but spending, taxes or a radicalism of 7+ count as exceeding executive authority, so the courts strike it down about half the time.
