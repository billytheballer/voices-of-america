import { z } from 'zod';
import { CANDIDATE_WINGS, DEPARTMENT_IDS, GAME_PHASES, POLICY_AXIS_RANGE } from '../constants';
import { FactionIdSchema, MetricIdSchema, PartySchema, PolicyAxisSchema, StateCodeSchema } from './shared';

/**
 * Versioned save file. Validates the ENTIRE game state on load, so a corrupted
 * or hand-edited save fails loudly instead of crashing the game later.
 * Bump SAVE_VERSION and add a migration in services/persistence when the
 * GameState shape changes.
 */
export const SAVE_VERSION = 4;

export const DIFFICULTIES = ['realistic', 'balanced', 'hard'] as const;
export const BILL_OUTCOMES = [
  'enacted',
  'failed_house',
  'failed_senate',
  'executive_order_upheld',
  'executive_order_struck_down',
] as const;

/** Float vector (platforms drift continuously, unlike integer bill scores). */
const PlatformSchema = z.record(PolicyAxisSchema, z.number().min(POLICY_AXIS_RANGE.min).max(POLICY_AXIS_RANGE.max));

const FactionElectorateSchema = z.object({
  weight: z.number().min(0).max(1),
  baseTurnout: z.number().min(0).max(1),
  satisfaction: z.number().min(0).max(100),
  turnoutShift: z.number(),
});

const MetricsSchema = z.record(MetricIdSchema, z.number());

const BillLogSchema = z.object({
  title: z.string(),
  kind: z.enum(['bill', 'order', 'budget']).optional(),
  outcome: z.enum(BILL_OUTCOMES),
  capitalSpent: z.number().nonnegative(),
});

const CandidateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  party: PartySchema,
  home: StateCodeSchema,
  wing: z.enum(CANDIDATE_WINGS),
  real: z.boolean(),
  charisma: z.number().int().min(1).max(5),
  fundraising: z.number().int().min(1).max(5),
  discipline: z.number().int().min(1).max(5),
});

const DepartmentStateSchema = z.object({
  level: z.union([z.literal(-2), z.literal(-1), z.literal(0), z.literal(1), z.literal(2)]),
  abolished: z.boolean(),
  directive: z.string().nullable(),
});

const TurnRecordSchema = z.object({
  turn: z.number().int().nonnegative(),
  year: z.number().int(),
  quarter: z.number().int().min(1).max(4),
  phase: z.enum(GAME_PHASES),
  eventId: z.string(),
  bills: z.array(BillLogSchema),
  approval: z.number().min(0).max(1),
  metrics: MetricsSchema,
});

const ElectionRecordSchema = z.object({
  year: z.number().int(),
  kind: z.enum(['presidential', 'midterm']),
  candidate: z.string(),
  playerEV: z.number().int().min(0).max(538).optional(),
  won: z.boolean().optional(),
  popularMargin: z.number(),
  houseSeats: z.number().int().min(0).max(435),
  senateSeats: z.number().int().min(0).max(100),
  stateMargins: z.record(StateCodeSchema, z.number()),
  unitMargins: z.record(z.string(), z.number()).optional(),
  senateResults: z
    .array(z.object({ state: StateCodeSchema, winner: PartySchema, previousHolder: PartySchema }))
    .optional(),
});

export const GameStateSchema = z.object({
  version: z.literal(1),
  seed: z.number().int().nonnegative(),
  rngState: z.number().int().nonnegative(),
  difficulty: z.enum(DIFFICULTIES),
  player: z.object({
    name: z.string().min(1).max(80),
    party: PartySchema,
    termsServed: z.number().int().min(0).max(2),
    generation: z.number().int().min(0),
    isPresident: z.boolean(),
  }),
  year: z.number().int().min(2028),
  quarter: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  turn: z.number().int().nonnegative(),
  phase: z.enum(GAME_PHASES),
  electorate: z.record(StateCodeSchema, z.record(FactionIdSchema, FactionElectorateSchema)),
  calibration: z.record(StateCodeSchema, z.number()),
  metrics: MetricsSchema,
  politicalCapital: z.number().min(0).max(100),
  playerPlatform: PlatformSchema,
  oppositionPlatform: PlatformSchema,
  congress: z.object({
    house: z.record(StateCodeSchema, z.record(PartySchema, z.number().int().min(0))),
    senate: z
      .array(
        z.object({
          state: StateCodeSchema,
          senateClass: z.union([z.literal(1), z.literal(2), z.literal(3)]),
          holder: PartySchema,
        }),
      )
      .length(100),
  }),
  incumbentParty: PartySchema,
  eventHistory: z.record(z.string(), z.number().int().nonnegative()),
  currentEventId: z.string(),
  turnBills: z.array(BillLogSchema),
  log: z.array(TurnRecordSchema),
  elections: z.array(ElectionRecordSchema),
  gameOver: z.object({ reason: z.enum(['lost_presidency', 'lost_primary']), year: z.number().int() }).nullable(),
  campaign: z.object({
    funds: z.number().min(0),
    actionsUsed: z.number().int().min(0),
    pledgedThisTurn: z.boolean(),
    rallies: z.record(z.string(), z.number().int().min(0)),
    adSpend: z.record(z.string(), z.number().min(0)),
    debateYear: z.number().int().nullable(),
    primary: z.object({ year: z.number().int(), share: z.number().min(0).max(1), won: z.boolean(), candidate: z.string() }).nullable(),
    successorNamed: z.boolean(),
    recent: z.array(z.object({ turn: z.number().int(), text: z.string() })).max(20),
    oppoFile: z.number().int().min(0).max(3),
    negativity: z.number().min(0),
    rapidResponse: z.boolean(),
  }),
  departments: z.record(z.enum(DEPARTMENT_IDS), DepartmentStateSchema),
  race: z.object({
    cycle: z.number().int(),
    opponent: CandidateSchema,
    nominated: z.boolean(),
    rival: CandidateSchema.nullable(),
    used: z.array(z.string()),
  }),
});

export const SaveFileSchema = z.object({
  save_version: z.literal(SAVE_VERSION),
  saved_at: z.string(),
  state: GameStateSchema,
});

export type SaveFile = z.infer<typeof SaveFileSchema>;
