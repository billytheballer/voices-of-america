import { describe, expect, it } from 'vitest';
import { ArchetypeMoodInputSchema } from '@/domain/schemas/feedBatch.schema';
import { ARCHETYPES } from '@/data/archetypes';
import { INITIAL_METRICS } from '@/data/initialState';
import { buildInitialElectorate } from '../electorate/initElectorate';
import { shockFaction } from '../electorate/applyModifiers';
import { allMoods, archetypeMood, type MoodContext } from '../sentiment/archetypeMood';
import { NO_AXES } from './fixtures';

const base: MoodContext = {
  electorate: buildInitialElectorate(),
  metrics: INITIAL_METRICS,
  turn: 0,
  eventId: 'border_surge',
  law: null,
};
const who = (id: string) => ARCHETYPES.find((a) => a.id === id)!;

describe('archetype moods', () => {
  it('produces 20 valid mood inputs, neutral when nothing has happened', () => {
    const moods = allMoods(base);
    expect(moods.length).toBe(20);
    for (const m of moods) {
      expect(ArchetypeMoodInputSchema.safeParse(m).success).toBe(true);
      expect(Math.abs(m.mood)).toBeLessThanOrEqual(5);
    }
  });

  it('follows the faction’s satisfaction in the archetype’s own state', () => {
    const happierOhio = { ...base, electorate: shockFaction(base.electorate, 'r_america_first', ['OH'], 20) };
    expect(archetypeMood(who('oh_retired_machinist_68'), happierOhio).mood).toBe(40);
    expect(archetypeMood(who('tn_trucker_37'), happierOhio).mood).toBe(0); // same faction, other state
  });

  it('metric stress hits the people who feel it', () => {
    const pricey = { ...base, metrics: { ...INITIAL_METRICS, gas_price: 6.5 } };
    const trucker = archetypeMood(who('tn_trucker_37'), pricey);
    const analyst = archetypeMood(who('md_federal_analyst_39'), pricey);
    expect(trucker.mood).toBeLessThan(analyst.mood);
    expect(trucker.top_concerns[0]).toBe('gas prices');
    expect(trucker.triggering_items.some((t) => t.type === 'metric')).toBe(true);
  });

  it('a law moves people along their hot-button issues', () => {
    const law = { id: 'border-act', title: 'Border Act', policy_vector: { ...NO_AXES, immigration: 9 } };
    const withLaw = { ...base, law };
    expect(archetypeMood(who('tx_border_rancher_55'), withLaw).mood).toBeGreaterThan(0);
    expect(archetypeMood(who('az_suburban_mom_42'), withLaw).triggering_items[0]!.type).toBe('bill');
    // The Oakland grad student doesn't have immigration as a hot button: no bill trigger.
    expect(archetypeMood(who('ca_grad_student_27'), withLaw).triggering_items.some((t) => t.type === 'bill')).toBe(false);
  });
});
