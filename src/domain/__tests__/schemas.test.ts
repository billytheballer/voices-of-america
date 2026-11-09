import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { FACTION_IDS, FEED_SIZE } from '../constants';
import {
  BillAnalysisSchema,
  makeFeedBatchSchema,
  reconcileStance,
  GameStateSchema,
} from '../schemas';

const validBill = {
  schema_version: '1.0',
  title: 'Secure Borders & Harvest Act',
  summary: 'Funds border infrastructure while creating a seasonal agricultural visa exemption.',
  instrument: 'legislation',
  policy_areas: ['border', 'agriculture', 'labor'],
  radical_score: 5,
  programmatic_score: 8,
  score_rationale: { radical: 'Mixes enforcement with a carve-out.', programmatic: 'Funded, phased.' },
  policy_vector: {
    economic: null, trade: 2, foreign_policy: null, immigration: 6, social: null, institutional: 4,
  },
  faction_modifiers: Object.fromEntries(FACTION_IDS.map((f) => [f, { delta: 1, reason: 'test' }])),
  state_overrides: [{ state: 'CA', faction: 'd_moderate', delta: 3, reason: 'Central Valley ag visas' }],
  metric_impacts: {
    gas_price: { direction: 'none', magnitude: 'none' },
    inflation: { direction: 'down', magnitude: 'minor' },
    national_debt: { direction: 'up', magnitude: 'moderate' },
    border_crossings: { direction: 'down', magnitude: 'major' },
    conflict_index: { direction: 'none', magnitude: 'none' },
  },
  flags: {
    likely_court_challenge: false,
    exceeds_executive_authority: false,
    foreign_aid_blank_check: false,
    domestic_roi_tangible: true,
    deficit_financed: true,
    reconciliation_eligible: false,
  },
  confidence: 0.8,
};

describe('BillAnalysisSchema', () => {
  it('accepts a well-formed analysis', () => {
    expect(BillAnalysisSchema.safeParse(validBill).success).toBe(true);
  });

  it('rejects a missing faction (record is exhaustive)', () => {
    const { independent: _drop, ...rest } = validBill.faction_modifiers;
    const r = BillAnalysisSchema.safeParse({ ...validBill, faction_modifiers: rest });
    expect(r.success).toBe(false);
  });

  it('clamps and rounds out-of-range modifiers instead of rejecting', () => {
    const bill = structuredClone(validBill);
    bill.faction_modifiers.r_america_first = { delta: 14.6, reason: 'over' };
    const r = BillAnalysisSchema.parse(bill);
    expect(r.faction_modifiers.r_america_first.delta).toBe(10);
  });

  it('rejects out-of-range headline scores (strict)', () => {
    expect(BillAnalysisSchema.safeParse({ ...validBill, radical_score: 11 }).success).toBe(false);
  });

  it('rejects unknown state codes and duplicate overrides', () => {
    const bad = { ...validBill, state_overrides: [{ ...validBill.state_overrides[0], state: 'ZZ' }] };
    expect(BillAnalysisSchema.safeParse(bad).success).toBe(false);
    const dup = { ...validBill, state_overrides: [validBill.state_overrides[0], validBill.state_overrides[0]] };
    expect(BillAnalysisSchema.safeParse(dup).success).toBe(false);
  });

  it('exports to JSON Schema for the Anthropic tool definition', () => {
    const json = z.toJSONSchema(BillAnalysisSchema, { io: 'input' });
    expect(json).toHaveProperty('properties.faction_modifiers');
  });
});

describe('FeedBatch schema', () => {
  const ids = Array.from({ length: FEED_SIZE }, (_, i) => `arch_${i}`) as [string, ...string[]];
  const Schema = makeFeedBatchSchema(ids);
  const post = (id: string) => ({
    archetype_id: id,
    handle: `@${id}`,
    text: 'Gas is up again and nobody in DC drives.',
    reacting_to: 'metric',
    reference_id: 'gas_price',
    stance: 'oppose',
    intensity: 3,
    tone: 'weary',
    hashtags: ['#GasPrices'],
    reply_to_archetype_id: null,
  });
  const batch = { schema_version: '1.0', turn_id: '2029-T04', posts: ids.map(post) };

  it('accepts exactly 20 unique posts', () => {
    expect(Schema.safeParse(batch).success).toBe(true);
  });

  it('rejects duplicates, wrong counts, unknown archetypes and self-replies', () => {
    expect(Schema.safeParse({ ...batch, posts: [...batch.posts.slice(1), post('arch_1')] }).success).toBe(false);
    expect(Schema.safeParse({ ...batch, posts: batch.posts.slice(1) }).success).toBe(false);
    expect(Schema.safeParse({ ...batch, posts: [...batch.posts.slice(1), post('ghost')] }).success).toBe(false);
    const self = { ...batch, posts: batch.posts.map((p, i) => (i === 0 ? { ...p, reply_to_archetype_id: p.archetype_id } : p)) };
    expect(Schema.safeParse(self).success).toBe(false);
  });

  it('engine overrides stances that contradict mood', () => {
    expect(reconcileStance('support', -70)).toBe('oppose');
    expect(reconcileStance('oppose', 60)).toBe('support');
    expect(reconcileStance('mixed', -90)).toBe('mixed');
  });
});

describe('GameStateSchema', () => {
  it('rejects an independent player party in the MVP', () => {
    const r = GameStateSchema.shape.player.safeParse({ name: 'Alex', party: 'I', termsServed: 0, generation: 0, isPresident: false });
    expect(r.success).toBe(false);
  });
});
