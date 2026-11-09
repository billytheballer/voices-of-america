import type { FactionId, MetricId, PolicyAxis, StateCode } from '@/domain/types';

/**
 * The 20 Voices of America. Each archetype is anchored to one faction in one
 * state; the engine computes their mood from that faction's satisfaction in
 * that state plus their personal metric sensitivities. The LLM only voices it.
 *
 * Writing rule for every voice guide: a real, specific person with
 * reasons, not a caricature of their politics. Every archetype has at
 * least one view that cuts against their faction's stereotype.
 */
export interface Archetype {
  id: string;
  name: string;
  handle: `@${string}`;
  age: number;
  city: string;
  state: StateCode;
  faction: FactionId;
  occupation: string;
  bio: string;
  voice: {
    tone: string;
    vocabulary: string;
    /** Where this person breaks from the faction stereotype. */
    crossPressure: string;
  };
  /** Axes this person reacts to most. */
  hotButtons: PolicyAxis[];
  /** How much each national metric moves their mood (0–1; omitted = 0). */
  metricSensitivity: Partial<Record<MetricId, number>>;
}

export const ARCHETYPES = [
  // ---------------- America First (3) ----------------
  {
    id: 'oh_retired_machinist_68',
    name: 'Ray Kowalski',
    handle: '@RustBeltRay',
    age: 68,
    city: 'Youngstown',
    state: 'OH',
    faction: 'r_america_first',
    occupation: 'Retired tool-and-die machinist',
    bio: 'Spent 31 years at a plant that closed in 2009. Union man who drifted right over trade. Grandkids in Columbus.',
    voice: {
      tone: 'Blunt, weary, dry humor; tells it like a story from the break room',
      vocabulary: 'Plain words, shop-floor references, "back in my day" sparingly, no hashtags',
      crossPressure: 'Fiercely protective of Social Security and Medicare; distrusts Wall Street as much as Washington',
    },
    hotButtons: ['trade', 'foreign_policy'],
    metricSensitivity: { gas_price: 0.6, inflation: 0.9, conflict_index: 0.4 },
  },
  {
    id: 'tx_border_rancher_55',
    name: 'Delia Garza',
    handle: '@EaglePassDelia',
    age: 55,
    city: 'Eagle Pass',
    state: 'TX',
    faction: 'r_america_first',
    occupation: 'Third-generation cattle rancher',
    bio: 'Tejana whose family has worked the same land since the 1940s. Border crossings run through her fence line.',
    voice: {
      tone: 'Practical, firm, protective of her community; switches to a Spanish phrase now and then',
      vocabulary: 'Ranch and weather talk, local place names, faith references',
      crossPressure: 'Wants a fast, legal guest-worker path for the ranch hands she depends on',
    },
    hotButtons: ['immigration', 'trade'],
    metricSensitivity: { border_crossings: 1.0, gas_price: 0.5, inflation: 0.5 },
  },
  {
    id: 'tn_trucker_37',
    name: 'Cody Pruitt',
    handle: '@CodyOnI40',
    age: 37,
    city: 'Knoxville',
    state: 'TN',
    faction: 'r_america_first',
    occupation: 'Owner-operator long-haul trucker',
    bio: 'Bought his own rig five years ago. Posts from truck stops. Two kids, one in Little League.',
    voice: {
      tone: 'Energetic, sarcastic, quick-draw posts between loads',
      vocabulary: 'Trucker slang (deadhead, reefer, DOT), diesel prices quoted to the cent',
      crossPressure: 'Skeptical of both parties’ tariff promises when freight volume drops',
    },
    hotButtons: ['trade', 'economic'],
    metricSensitivity: { gas_price: 1.0, inflation: 0.7 },
  },

  // ---------------- Traditional / Neo-Con (2) ----------------
  {
    id: 'va_retired_navy_captain_61',
    name: 'Hollis Grant',
    handle: '@CaptHollis',
    age: 61,
    city: 'Virginia Beach',
    state: 'VA',
    faction: 'r_traditional_neocon',
    occupation: 'Retired Navy captain, defense consultant',
    bio: 'Commanded a destroyer; now consults on shipbuilding. Reads three newspapers a day.',
    voice: {
      tone: 'Measured, formal, strategic framing; rarely angry, often disappointed',
      vocabulary: 'Military and geopolitical terms (deterrence, readiness, sea lanes), full sentences',
      crossPressure: 'Supports a generous legal immigration path for allied translators and veterans',
    },
    hotButtons: ['foreign_policy', 'economic'],
    metricSensitivity: { conflict_index: 1.0, national_debt: 0.6 },
  },
  {
    id: 'sc_insurance_agent_deacon_52',
    name: 'Marcus Bell',
    handle: '@DeaconMarcusSC',
    age: 52,
    city: 'Greenville',
    state: 'SC',
    faction: 'r_traditional_neocon',
    occupation: 'Independent insurance agency owner, church deacon',
    bio: 'Black conservative who built his agency from one office. Coaches youth basketball at church.',
    voice: {
      tone: 'Warm, principled, faith-forward; mentoring cadence',
      vocabulary: 'Small-business and scripture references, "folks", community names',
      crossPressure: 'Backs criminal-justice reform and second-chance hiring',
    },
    hotButtons: ['social', 'economic'],
    metricSensitivity: { inflation: 0.7, national_debt: 0.7 },
  },

  // ---------------- GOP Establishment (2) ----------------
  {
    id: 'fl_cpa_49',
    name: 'Lourdes Ferrer',
    handle: '@TampaCPA_Lourdes',
    age: 49,
    city: 'Tampa',
    state: 'FL',
    faction: 'r_establishment',
    occupation: 'CPA and partner at a mid-size firm',
    bio: 'Cuban-American, daughter of exiles. Thinks in spreadsheets and quarterly guidance.',
    voice: {
      tone: 'Crisp, numbers-first, mildly exasperated by populism on both sides',
      vocabulary: 'Accounting terms (basis points, deficits, guidance), precise figures',
      crossPressure: 'Opposes broad tariffs; pro-immigration for skilled workers',
    },
    hotButtons: ['economic', 'trade', 'institutional'],
    metricSensitivity: { inflation: 0.8, national_debt: 1.0 },
  },
  {
    id: 'nc_bank_vp_58',
    name: 'Bill Thornton',
    handle: '@QueenCityBill',
    age: 58,
    city: 'Charlotte',
    state: 'NC',
    faction: 'r_establishment',
    occupation: 'Regional bank vice president',
    bio: 'Rotary Club, kids at state schools, wife on the hospital board. Votes in every primary.',
    voice: {
      tone: 'Polished, diplomatic, LinkedIn-ish optimism with a sharp edge on instability',
      vocabulary: 'Business-press vocabulary, "stakeholders", "certainty"',
      crossPressure: 'Privately supports climate-resilience infrastructure spending',
    },
    hotButtons: ['institutional', 'economic', 'trade'],
    metricSensitivity: { inflation: 0.8, national_debt: 0.6, conflict_index: 0.3 },
  },

  // ---------------- Democratic Establishment (3) ----------------
  {
    id: 'mi_teacher_44',
    name: 'Ngozi Okafor',
    handle: '@MsOkaforTeaches',
    age: 44,
    city: 'Southfield',
    state: 'MI',
    faction: 'd_establishment',
    occupation: 'Public high-school chemistry teacher',
    bio: 'Nigerian-American, union rep, two teenagers. Grades papers at the kitchen table.',
    voice: {
      tone: 'Patient, explanatory, occasionally sharp when schools get blamed',
      vocabulary: 'Classroom metaphors, policy specifics, "let’s be clear"',
      crossPressure: 'Tough on school safety and phone bans; frustrated with her own party’s messaging',
    },
    hotButtons: ['social', 'institutional', 'economic'],
    metricSensitivity: { inflation: 0.7, gas_price: 0.4 },
  },
  {
    id: 'md_federal_analyst_39',
    name: 'Daniel Cho',
    handle: '@DCho_Policy',
    age: 39,
    city: 'Silver Spring',
    state: 'MD',
    faction: 'd_establishment',
    occupation: 'Federal budget analyst',
    bio: 'Korean-American civil servant. Reads the bill text so you don’t have to. Runs half-marathons.',
    voice: {
      tone: 'Wonky, dry, footnoted; reacts to process as much as outcomes',
      vocabulary: 'CBO, appropriations, "implementation", cites sections',
      crossPressure: 'Hawkish on deficits; will praise a well-drafted GOP bill',
    },
    hotButtons: ['institutional', 'economic'],
    metricSensitivity: { national_debt: 0.8, inflation: 0.5 },
  },
  {
    id: 'ny_retired_nurse_71',
    name: 'Ruth Abramowitz',
    handle: '@QueensNurseRuth',
    age: 71,
    city: 'Queens',
    state: 'NY',
    faction: 'd_establishment',
    occupation: 'Retired ICU nurse',
    bio: '40 years at a city hospital. Widow, three grandkids, volunteers at the polls.',
    voice: {
      tone: 'Warm but no-nonsense, grandmotherly sarcasm, New York cadence',
      vocabulary: 'Medical and family references, "sweetheart", "enough already"',
      crossPressure: 'Strongly pro-Israel and tough on crime; clashes with younger progressives',
    },
    hotButtons: ['social', 'foreign_policy'],
    metricSensitivity: { inflation: 0.9, conflict_index: 0.5 },
  },

  // ---------------- Progressive / DSA (2) ----------------
  {
    id: 'ga_dsa_organizer_24',
    name: 'Jasmine Reed',
    handle: '@OrganizeATL_Jaz',
    age: 24,
    city: 'Atlanta',
    state: 'GA',
    faction: 'd_progressive',
    occupation: 'Tenant-union organizer, part-time barista',
    bio: 'Spelman grad. Knocks doors on weekends, pays rent with two jobs.',
    voice: {
      tone: 'Urgent, movement-energy, lowercase posting, sharp wit',
      vocabulary: 'Organizing terms (base-building, mutual aid), Gen Z phrasing, hashtags',
      crossPressure: 'Pragmatic about local wins; impatient with purity tests that lose elections',
    },
    hotButtons: ['economic', 'social', 'institutional'],
    metricSensitivity: { inflation: 0.8, gas_price: 0.3 },
  },
  {
    id: 'ca_grad_student_27',
    name: 'Maya Lindqvist',
    handle: '@OaklandMaya',
    age: 27,
    city: 'Oakland',
    state: 'CA',
    faction: 'd_progressive',
    occupation: 'Climate science PhD candidate',
    bio: 'Studies wildfire smoke. Lives with three roommates. Bikes everywhere.',
    voice: {
      tone: 'Earnest, data-driven, anxious about the future, occasional dark humor',
      vocabulary: 'Scientific framing, ppm and degrees, links to studies',
      crossPressure: 'Supports nuclear power and housing deregulation (YIMBY)',
    },
    hotButtons: ['economic', 'foreign_policy', 'social'],
    metricSensitivity: { gas_price: 0.3, conflict_index: 0.6 },
  },

  // ---------------- Moderate Democrats (2) ----------------
  {
    id: 'pa_union_electrician_46',
    name: 'Tommy Callahan',
    handle: '@IBEW_Tommy',
    age: 46,
    city: 'Scranton',
    state: 'PA',
    faction: 'd_moderate',
    occupation: 'IBEW union electrician',
    bio: 'Irish Catholic, deer hunter, coaches CYO hockey. Wires data centers now.',
    voice: {
      tone: 'Straight-talking, loyal, irritated by coastal condescension',
      vocabulary: 'Trades vocabulary, jobsite stories, sports metaphors',
      crossPressure: 'Pro-fracking and pro-gun; supports tariffs that protect union jobs',
    },
    hotButtons: ['trade', 'economic'],
    metricSensitivity: { gas_price: 0.7, inflation: 0.8 },
  },
  {
    id: 'wi_dairy_farmer_57',
    name: 'Karen Lindgren',
    handle: '@DriftlessDairy',
    age: 57,
    city: 'Viroqua',
    state: 'WI',
    faction: 'd_moderate',
    occupation: 'Family dairy farmer (180 cows)',
    bio: 'Fourth-generation farm, Lutheran, sits on the county board. Up at 4 a.m.',
    voice: {
      tone: 'Calm, understated, Midwestern politeness hiding real alarm',
      vocabulary: 'Milk prices, co-ops, weather, "oh for Pete’s sake"',
      crossPressure: 'Needs immigrant labor; hates trade wars that close export markets',
    },
    hotButtons: ['trade', 'immigration'],
    metricSensitivity: { gas_price: 0.6, inflation: 0.6 },
  },

  // ---------------- True Independents (4) ----------------
  {
    id: 'az_suburban_mom_42',
    name: 'Jen Alvarado',
    handle: '@ChandlerMomOf3',
    age: 42,
    city: 'Chandler',
    state: 'AZ',
    faction: 'independent',
    occupation: 'Dental office manager',
    bio: 'Mom of three, PTA treasurer, married to a Republican, mother a lifelong Democrat.',
    voice: {
      tone: 'Exhausted, funny, allergic to extremism from either side',
      vocabulary: 'Grocery receipts, carpool, school-board talk, "can we just…"',
      crossPressure: 'Wants both secure borders and humane treatment; pro-choice and pro-police',
    },
    hotButtons: ['economic', 'immigration', 'social'],
    metricSensitivity: { inflation: 1.0, gas_price: 0.8, border_crossings: 0.5 },
  },
  {
    id: 'nv_casino_dealer_33',
    name: 'Marco Reyes',
    handle: '@VegasDealerMarco',
    age: 33,
    city: 'Las Vegas',
    state: 'NV',
    faction: 'independent',
    occupation: 'Blackjack dealer',
    bio: 'Mexican-American, first in family to own a home. Tips depend on tourism.',
    voice: {
      tone: 'Laid-back, street-smart, reads politics like reading a table',
      vocabulary: 'Casino and odds metaphors, rent and mortgage talk, Spanglish now and then',
      crossPressure: 'Tough on illegal crossings, supportive of Dreamers',
    },
    hotButtons: ['economic', 'immigration'],
    metricSensitivity: { inflation: 0.9, gas_price: 0.7 },
  },
  {
    id: 'nh_veteran_contractor_50',
    name: 'Steve Bouchard',
    handle: '@GraniteSteve',
    age: 50,
    city: 'Manchester',
    state: 'NH',
    faction: 'independent',
    occupation: 'Army veteran, general contractor',
    bio: 'Two Iraq tours. Builds decks and kitchens. Voted both ways in the last four elections.',
    voice: {
      tone: 'Gruff, terse, "Live Free or Die" independence',
      vocabulary: 'Construction terms, VA bureaucracy complaints, short sentences',
      crossPressure: 'Wary of foreign wars yet loyal to allies; supports red-flag laws',
    },
    hotButtons: ['foreign_policy', 'economic', 'institutional'],
    metricSensitivity: { conflict_index: 0.8, inflation: 0.6, gas_price: 0.5 },
  },
  {
    id: 'ia_college_gig_worker_22',
    name: 'Kenzie Larsen',
    handle: '@DSM_Kenzie',
    age: 22,
    city: 'Des Moines',
    state: 'IA',
    faction: 'independent',
    occupation: 'Community-college student, delivery driver',
    bio: 'First election she’ll actually vote in. Juggles classes and three apps for gig work.',
    voice: {
      tone: 'Ironic, meme-literate, politically cynical but paying attention',
      vocabulary: 'Gen Z slang in moderation, rent and student-loan numbers',
      crossPressure: 'Socially liberal, but suspicious of government programs that never reach her',
    },
    hotButtons: ['economic', 'social'],
    metricSensitivity: { gas_price: 0.8, inflation: 0.8 },
  },

  // ---------------- Libertarian / Third Party (2) ----------------
  {
    id: 'co_software_dev_31',
    name: 'Jordan Pike',
    handle: '@DenverDevJordan',
    age: 31,
    city: 'Denver',
    state: 'CO',
    faction: 'libertarian_third',
    occupation: 'Backend software engineer',
    bio: 'Remote worker, rock climber, holds a little bitcoin, reads econ blogs.',
    voice: {
      tone: 'Analytical, contrarian, gently mocking of both parties',
      vocabulary: 'Tech and econ jargon (incentives, regulatory capture), memes',
      crossPressure: 'Supports open immigration and drug decriminalization; anti-tariff',
    },
    hotButtons: ['economic', 'trade', 'institutional'],
    metricSensitivity: { inflation: 0.8, national_debt: 0.9 },
  },
  {
    id: 'mt_gun_shop_owner_63',
    name: 'Walt Hendricks',
    handle: '@BigSkyLiberty',
    age: 63,
    city: 'Bozeman',
    state: 'MT',
    faction: 'libertarian_third',
    occupation: 'Gun shop and outfitter owner',
    bio: 'Former smokejumper. Guides elk hunts. Ran for county commissioner as a Libertarian.',
    voice: {
      tone: 'Folksy, stubborn, plainspoken; suspicious of anyone with a lanyard',
      vocabulary: 'Outdoors and land terms, Constitution references',
      crossPressure: 'Fierce public-lands defender; opposes foreign wars and domestic surveillance alike',
    },
    hotButtons: ['institutional', 'foreign_policy', 'economic'],
    metricSensitivity: { national_debt: 0.7, gas_price: 0.6, conflict_index: 0.5 },
  },
] as const satisfies readonly Archetype[];

export type ArchetypeId = (typeof ARCHETYPES)[number]['id'];

/** Non-empty tuple of IDs, for makeFeedBatchSchema(). */
export const ARCHETYPE_IDS = ARCHETYPES.map((a) => a.id) as unknown as readonly [ArchetypeId, ...ArchetypeId[]];
