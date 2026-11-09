import { FACTION_IDS, METRIC_IDS, POLICY_AXES } from '../../../domain/constants';
import type { BillAnalysis, BillFlag } from '../../../domain/schemas/billAnalysis.schema';
import type { FactionId, ImpactDirection, ImpactMagnitude, MetricId, PolicyAxis } from '../../../domain/types';
import { clamp } from '../../../lib/math';
import type { ParseBillRequest } from '../types';

/**
 * Offline stand-in for the LLM bill parser: a transparent keyword lexicon.
 * It's deliberately simple and says so (low confidence, labeled rationales),
 * but it produces valid, sensible analyses so the full game is playable with
 * no API key, in CI, and in the public demo.
 */

type Mods = Partial<Record<FactionId, number>>;
interface Topic {
  id: string;
  area: string;
  match: RegExp;
  axes: Partial<Record<PolicyAxis, number>>;
  mods: Mods;
  impacts?: Partial<Record<MetricId, [ImpactDirection, ImpactMagnitude]>>;
  flags?: BillFlag[];
}

// Faction order for readability: AF, TradCon, GOP Est, Dem Est, Prog, Mod Dem, Indep, Lib
const m = (af: number, tc: number, re: number, de: number, pr: number, md: number, ind: number, lib: number): Mods => ({
  r_america_first: af,
  r_traditional_neocon: tc,
  r_establishment: re,
  d_establishment: de,
  d_progressive: pr,
  d_moderate: md,
  independent: ind,
  libertarian_third: lib,
});

const TOPICS: Topic[] = [
  { id: 'border_enforcement', area: 'border', match: /\b(border (wall|security|patrol|officers?|agents?|processing|technology)|ports of entry|deport\w*|ice agents?|asylum (limits|restrictions)|immigration enforcement)\b/i,
    axes: { immigration: 6 }, mods: m(5, 2, 1, -2, -5, 1, 2, -1), impacts: { border_crossings: ['down', 'moderate'] } },
  { id: 'immigration_expansion', area: 'immigration', match: /\b(path(way)? to citizenship|dreamers?|amnesty|refugees?|(work|seasonal|guest|farm) visas?|visas? for|guest workers?|green cards?)\b/i,
    axes: { immigration: -5 }, mods: m(-4, -1, 2, 3, 4, 1, 0, 3), impacts: { border_crossings: ['up', 'minor'] } },
  { id: 'tariffs', area: 'trade', match: /\b(tariffs?|reshor\w*|made in america|buy american|protect(ing)? (american|domestic) (jobs|industry))\b/i,
    axes: { trade: 6 }, mods: m(5, -1, -4, -1, 1, 2, 0, -5), impacts: { inflation: ['up', 'minor'] } },
  { id: 'free_trade', area: 'trade', match: /\b(free trade|trade (deal|agreement)|lower(ing)? tariffs|remove tariffs)\b/i,
    axes: { trade: -5 }, mods: m(-4, 1, 4, 1, -2, -1, 0, 4), impacts: { inflation: ['down', 'minor'] } },
  { id: 'tax_cut', area: 'taxes', match: /\b(tax cuts?|cut(ting)? taxes|lower(ing)? taxes|tax relief|eliminate the \w+ tax)\b/i,
    axes: { economic: 5 }, mods: m(2, 4, 5, -3, -5, -1, 1, 5), impacts: { national_debt: ['up', 'moderate'] },
    flags: ['deficit_financed', 'reconciliation_eligible'] },
  { id: 'family_credit', area: 'taxes', match: /\b(child tax credit|tax credits?|child care|paid family leave|baby bonus)\b/i,
    axes: { economic: -3 }, mods: m(1, -2, -3, 5, 4, 4, 2, -4), impacts: { national_debt: ['up', 'moderate'] },
    flags: ['deficit_financed', 'reconciliation_eligible'] },
  { id: 'gas_relief', area: 'energy', match: /\b(gas tax|tax holiday|prices? at the pump|fuel prices?)\b/i,
    axes: { economic: 1 }, mods: m(2, -1, -2, -1, -3, 2, 3, 1), impacts: { gas_price: ['down', 'moderate'], national_debt: ['up', 'minor'] } },
  { id: 'tax_the_rich', area: 'taxes', match: /\b(wealth tax|tax(ing)? the (rich|wealthy)|millionaires?|billionaires?|corporate tax (increase|hike))\b/i,
    axes: { economic: -6 }, mods: m(-1, -4, -6, 2, 6, 1, 1, -6), impacts: { national_debt: ['down', 'minor'] }, flags: ['reconciliation_eligible'] },
  { id: 'single_payer', area: 'health care', match: /\b(single[- ]payer|medicare for all|universal (health|coverage))\b/i,
    axes: { economic: -8, institutional: -6 }, mods: m(-5, -8, -9, -1, 9, -4, -3, -9), impacts: { national_debt: ['up', 'major'] } },
  { id: 'health_costs', area: 'health care', match: /\b(drug prices|prescription|insulin|public option|health (care )?costs?)\b/i,
    axes: { economic: -3 }, mods: m(2, -1, -2, 4, 3, 3, 3, -2), impacts: { inflation: ['down', 'minor'] } },
  { id: 'climate', area: 'energy', match: /\b(climate|renewable|solar|wind power|carbon|emissions|clean energy|electric vehicles?)\b/i,
    axes: { economic: -3 }, mods: m(-4, -2, -1, 3, 5, -1, 1, -2), impacts: { gas_price: ['up', 'minor'] } },
  { id: 'drilling', area: 'energy', match: /\b(drill(ing)?|oil|pipelines?|fracking|natural gas|energy independence|leases?)\b/i,
    axes: { economic: 3 }, mods: m(4, 3, 3, -2, -5, 2, 2, 1), impacts: { gas_price: ['down', 'moderate'] } },
  { id: 'foreign_aid', area: 'foreign policy', match: /\b(military aid|aid package|security assistance|arm(ing)? (our )?allies|weapons to)\b/i,
    axes: { foreign_policy: 5 }, mods: m(0, 4, 2, 2, -3, 0, -1, -4), impacts: { conflict_index: ['down', 'minor'] } },
  { id: 'defense', area: 'defense', match: /\b(defen[cs]e (budget|spending)|navy|shipbuilding|military readiness|troops? (to|deployment))\b/i,
    axes: { foreign_policy: 5, economic: 1 }, mods: m(0, 5, 2, 0, -4, 1, 0, -3), impacts: { national_debt: ['up', 'moderate'] } },
  { id: 'restraint', area: 'foreign policy', match: /\b(bring (our )?troops home|withdraw\w*|end (the|endless|forever) wars?|non-?intervention)\b/i,
    axes: { foreign_policy: -6 }, mods: m(4, -5, -2, -1, 3, 0, 2, 5), impacts: { conflict_index: ['up', 'minor'] } },
  { id: 'police', area: 'public safety', match: /\b(police|law enforcement|crime|public safety|fentanyl)\b/i,
    axes: { social: 3 }, mods: m(3, 3, 1, 1, -3, 2, 2, -1) },
  { id: 'abortion_restrict', area: 'social policy', match: /\b(ban abortion|abortion ban|restrict(ing)? abortion|fetal heartbeat)\b/i,
    axes: { social: 7 }, mods: m(3, 5, -1, -6, -8, -3, -4, -2), flags: ['likely_court_challenge'] },
  { id: 'abortion_protect', area: 'social policy', match: /\b(protect abortion|codify roe|reproductive (rights|freedom)|abortion access)\b/i,
    axes: { social: -6 }, mods: m(-4, -5, 0, 5, 6, 2, 2, 1), flags: ['likely_court_challenge'] },
  { id: 'gun_control', area: 'guns', match: /\b(assault weapons|background checks?|gun control|red[- ]flag|magazine limits?)\b/i,
    axes: { social: -4 }, mods: m(-5, -3, -1, 4, 5, 0, 1, -6), flags: ['likely_court_challenge'] },
  { id: 'gun_rights', area: 'guns', match: /\b(second amendment|concealed carry|gun rights|constitutional carry)\b/i,
    axes: { social: 4 }, mods: m(5, 3, 0, -4, -5, -1, -1, 4) },
  { id: 'shrink_government', area: 'government', match: /\b(abolish(ing)? the (department|agency|bureau|irs|epa)|eliminate the (department|agency)|shrink (the )?government|cut (federal )?spending|federal workforce|downsiz\w*)\b/i,
    axes: { economic: 7, institutional: -6 }, mods: m(5, 3, -1, -7, -8, -4, -1, 7), impacts: { national_debt: ['down', 'moderate'] } },
  { id: 'infrastructure', area: 'infrastructure', match: /\b(infrastructure|roads|bridges|broadband|rail|seaports?|power grid)\b/i,
    axes: { economic: -2 }, mods: m(2, 1, 3, 4, 2, 4, 3, -2), impacts: { national_debt: ['up', 'moderate'] }, flags: ['deficit_financed'] },
  { id: 'student_debt', area: 'education', match: /\b(student (loan|debt)s?|tuition[- ]free|free college)\b/i,
    axes: { economic: -5 }, mods: m(-3, -4, -3, 2, 6, -1, 1, -4), impacts: { national_debt: ['up', 'moderate'] } },
  { id: 'wages', area: 'labor', match: /\b(minimum wage|union(s|ize)?|collective bargaining|paid leave|overtime)\b/i,
    axes: { economic: -4 }, mods: m(1, -3, -4, 4, 5, 3, 2, -4), impacts: { inflation: ['up', 'minor'] } },
  { id: 'clean_government', area: 'ethics', match: /\b(term limits|stock trading|trading (individual )?stocks|lobbying|campaign finance|anti-?corruption|ethics office)\b/i,
    axes: { institutional: -2 }, mods: m(3, 0, -2, -1, 3, 2, 4, 3) },
  { id: 'housing', area: 'housing', match: /\b(housing|rent|zoning|homeownership|mortgages?)\b/i,
    axes: { economic: -2 }, mods: m(1, 0, 1, 3, 3, 2, 3, 1), impacts: { inflation: ['down', 'minor'] } },
  { id: 'farm', area: 'agriculture', match: /\b(farm\w*|agricultur\w*|crops?|ranch\w*)\b/i,
    axes: { trade: 1 }, mods: m(2, 1, 1, 1, 0, 3, 1, 0) },
];

const RADICAL_WORDS = /\b(abolish|ban|eliminate|nationaliz\w*|seize|outlaw|all|every|immediately|permanently|100%|total)\b/gi;
const SPECIFIC = /(\$\s?\d[\d,.]*|\d{1,3}(,\d{3})+|\d+(\.\d+)?\s?(%|percent|billion|million|thousand|officers|agents|years?|months?|days?))/gi;
const TIMELINE = /\b(by 20\d\d|within \d+|phased?|over (\d+|two|three|four|five) years|starting in)\b/i;
const FUNDING = /\b(funded by|paid for by|offset|revenue from|financed by)\b/i;
const MECHANISM = /\b(agency|department|grants?|oversight|audit|enforce\w*|administ\w*)\b/i;
const VAGUE = /\b(somehow|ensure|explore|consider|look into|make america|great again|for the people)\b/gi;
const EXEC_ORDER = /\b(executive order|i (hereby )?(order|direct)|by executive action|presidential (order|directive))\b/i;

const MAG: ImpactMagnitude[] = ['none', 'minor', 'moderate', 'major'];

function titleFrom(text: string, isOrder: boolean): string {
  const first = text
    .replace(/^\s*by executive (order|action),?\s*/i, '')
    // Split on sentence/clause ends, but not inside numbers like 3,000 or $2.5.
    .split(/[.!?;](?=\s|$)|,(?=\s)|\n/)[0]!
    .replace(/^(i (hereby )?(want|propose|would like|direct|order)( to| that)?|we should|let'?s|a bill to)\s+/i, '')
    .trim();
  const words = first.split(/\s+/).slice(0, 8).join(' ').replace(/[^\w$%)]+$/, '');
  const cased = words.charAt(0).toUpperCase() + words.slice(1);
  const base = cased.length > 3 ? cased : 'Untitled proposal';
  return (isOrder ? `Executive Order: ${base}` : `${base} Act`).slice(0, 80);
}

export function heuristicParseBill({ text }: ParseBillRequest): BillAnalysis {
  const hits = TOPICS.filter((t) => t.match.test(text));
  const isOrder = EXEC_ORDER.test(text);

  // Policy vector: average the matched topics' positions per axis.
  const vector = Object.fromEntries(POLICY_AXES.map((a) => [a, null])) as BillAnalysis['policy_vector'];
  for (const axis of POLICY_AXES) {
    const vals = hits.map((h) => h.axes[axis]).filter((v): v is number => v !== undefined);
    if (vals.length) vector[axis] = Math.round(clamp(vals.reduce((s, v) => s + v, 0) / vals.length, -10, 10));
  }

  const intensity = (text.match(RADICAL_WORDS) ?? []).length;
  const maxAxis = Math.max(0, ...POLICY_AXES.map((a) => Math.abs(vector[a] ?? 0)));
  const radical = Math.round(clamp(2 + maxAxis * 0.5 + intensity * 1.2 + (hits.length > 3 ? 1 : 0), 1, 10));

  const specifics = (text.match(SPECIFIC) ?? []).length;
  const vague = (text.match(VAGUE) ?? []).length;
  const programmatic = Math.round(
    clamp(
      3 + Math.min(3, specifics) + (TIMELINE.test(text) ? 1 : 0) + (FUNDING.test(text) ? 2 : 0) +
        (MECHANISM.test(text) ? 1 : 0) + (text.length > 250 ? 1 : 0) - vague,
      1,
      10,
    ),
  );

  // Modifiers: sum topic effects, scaled by how sweeping the bill is.
  const scale = 0.7 + radical * 0.06;
  const faction_modifiers = Object.fromEntries(
    FACTION_IDS.map((f) => {
      const raw = hits.reduce((s, h) => s + (h.mods[f] ?? 0), 0);
      const delta = Math.round(clamp(raw * scale, -10, 10));
      const drivers = hits.filter((h) => (h.mods[f] ?? 0) !== 0).map((h) => h.area);
      return [f, { delta, reason: drivers.length ? `Reacts to the ${[...new Set(drivers)].slice(0, 2).join(' and ')} provisions` : 'Little at stake for this faction' }];
    }),
  ) as BillAnalysis['faction_modifiers'];

  // Metric impacts: strongest matched effect per metric wins.
  const metric_impacts = Object.fromEntries(
    METRIC_IDS.map((mid) => {
      const effects = hits.map((h) => h.impacts?.[mid]).filter((x): x is [ImpactDirection, ImpactMagnitude] => !!x);
      if (!effects.length) return [mid, { direction: 'none', magnitude: 'none' }];
      const best = effects.sort((a, b) => MAG.indexOf(b[1]) - MAG.indexOf(a[1]))[0]!;
      return [mid, { direction: best[0], magnitude: best[1] }];
    }),
  ) as BillAnalysis['metric_impacts'];

  const flagSet = new Set(hits.flatMap((h) => h.flags ?? []));
  const fiscal = hits.some((h) => ['taxes', 'budget'].includes(h.area));
  const foreignAid = hits.some((h) => h.id === 'foreign_aid');
  const roi = /\b(supply chains?|minerals?|jobs|manufactur\w*|in exchange for|domestic)\b/i.test(text);
  const flags: BillAnalysis['flags'] = {
    likely_court_challenge: flagSet.has('likely_court_challenge') || (isOrder && radical >= 6),
    exceeds_executive_authority: isOrder && (fiscal || radical >= 7),
    foreign_aid_blank_check: foreignAid && !roi,
    domestic_roi_tangible: foreignAid && roi,
    deficit_financed: flagSet.has('deficit_financed') && !FUNDING.test(text),
    reconciliation_eligible: !isOrder && flagSet.has('reconciliation_eligible'),
  };
  if (flags.foreign_aid_blank_check) faction_modifiers.r_america_first.delta = Math.max(-10, faction_modifiers.r_america_first.delta - 3);

  const areas = [...new Set(hits.map((h) => h.area))].slice(0, 6);
  return {
    schema_version: '1.0',
    title: titleFrom(text, isOrder),
    summary: text.replace(/\s+/g, ' ').trim().slice(0, 297) + (text.length > 297 ? '...' : ''),
    instrument: isOrder ? 'executive_order' : 'legislation',
    policy_areas: areas.length ? areas : ['general'],
    radical_score: radical,
    programmatic_score: programmatic,
    score_rationale: {
      radical: `Offline estimate: ${hits.length} policy area${hits.length === 1 ? '' : 's'} detected, ${intensity} sweeping term${intensity === 1 ? '' : 's'}.`,
      programmatic: `Offline estimate: ${specifics} specific figure${specifics === 1 ? '' : 's'}${FUNDING.test(text) ? ', funding named' : ''}${TIMELINE.test(text) ? ', timeline given' : ''}.`,
    },
    policy_vector: vector,
    faction_modifiers,
    state_overrides: [],
    metric_impacts,
    flags,
    confidence: Math.round(clamp(0.25 + hits.length * 0.08, 0.2, 0.55) * 100) / 100,
  };
}
