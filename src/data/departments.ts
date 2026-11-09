import type { DepartmentId, FactionId, ImpactDirection, ImpactMagnitude, MetricId, PolicyAxis } from '@/domain/types';

/**
 * The executive branch. Each department has a budget the president can ask
 * Congress to grow, cut or eliminate, and a short menu of directives the
 * president can issue by executive order.
 *
 * Like the bill parser's output, everything here is qualitative: faction
 * reactions on the same −10..+10 scale, policy directions on the six axes,
 * and metric impacts as (direction, magnitude). The engine turns each action
 * into a BillAnalysis, so departments and directives go through exactly the
 * same vote, court and effect pipeline as a bill the player writes.
 */

type Reactions = Partial<Record<FactionId, number>>;
type Lean = Partial<Record<PolicyAxis, number>>;
type Impacts = Partial<Record<MetricId, [Exclude<ImpactDirection, 'none'>, Exclude<ImpactMagnitude, 'none'>]>>;

export interface DirectiveSpec {
  id: string;
  title: string;
  /** One line: what the order does. */
  summary: string;
  /** What the department works on while the order is in force. */
  work: string;
  radical: number;
  reactions: Reactions;
  lean: Lean;
  impacts?: Impacts;
  /** Court risk (see LEGISLATURE.courtStrikeRisk). */
  courtChallenge?: boolean;
  exceedsAuthority?: boolean;
}

export interface DepartmentSpec {
  id: DepartmentId;
  name: string;
  short: string;
  /** Approximate annual discretionary budget at baseline, $ billions. */
  budget: number;
  mission: string;
  /** What the department works on at baseline. */
  work: [string, string, string];
  /** How much each faction likes this department GROWING (−3..+3). Cuts invert it. */
  support: Reactions;
  /** Which way growing the department moves policy. */
  lean: Lean;
  /** Extra metric effects of growing it (cuts invert them). Debt is handled by size. */
  growthImpacts?: Impacts;
  size: 'small' | 'medium' | 'large';
  /** Core constitutional functions can be reshaped but not eliminated. */
  abolishable: boolean;
  directives: DirectiveSpec[];
}

export const DEPARTMENTS: Record<DepartmentId, DepartmentSpec> = {
  agriculture: {
    id: 'agriculture',
    name: 'Department of Agriculture',
    short: 'USDA',
    budget: 27,
    mission: 'Farm support, food safety, rural development and nutrition programs.',
    work: ['Running crop insurance and farm loan programs', 'Inspecting meat and poultry plants', 'Administering SNAP food assistance'],
    support: { r_america_first: 1, d_establishment: 1, d_progressive: 1, d_moderate: 1, libertarian_third: -2 },
    lean: { economic: -2, trade: 2 },
    size: 'medium',
    abolishable: true,
    directives: [
      {
        id: 'farm_tariff_aid',
        title: 'Emergency aid for farmers hit by trade wars',
        summary: 'Direct payments to growers who lost export markets to retaliatory tariffs.',
        work: 'Sending emergency payments to farmers who lost export markets',
        radical: 4,
        reactions: { r_america_first: 3, r_traditional_neocon: 1, r_establishment: -1, d_progressive: -1, d_moderate: 1, libertarian_third: -3 },
        lean: { economic: -2, trade: 5 },
        impacts: { national_debt: ['up', 'minor'] },
      },
      {
        id: 'snap_expand',
        title: 'Expand SNAP access and school meals',
        summary: 'Loosens eligibility rules and funds free school meals in high-poverty districts.',
        work: 'Enrolling more families in SNAP and school meal programs',
        radical: 5,
        reactions: { d_progressive: 4, d_establishment: 2, d_moderate: 1, r_america_first: -2, r_traditional_neocon: -2, r_establishment: -2, libertarian_third: -3 },
        lean: { economic: -6 },
        impacts: { national_debt: ['up', 'minor'] },
      },
      {
        id: 'snap_work',
        title: 'Tighten SNAP work requirements',
        summary: 'Requires able-bodied adults without children to work or train to keep benefits.',
        work: 'Enforcing new work requirements for SNAP recipients',
        radical: 5,
        reactions: { r_america_first: 2, r_traditional_neocon: 3, r_establishment: 2, libertarian_third: 2, d_establishment: -2, d_progressive: -4, d_moderate: -1 },
        lean: { economic: 5 },
        impacts: { national_debt: ['down', 'minor'] },
        courtChallenge: true,
      },
    ],
  },

  commerce: {
    id: 'commerce',
    name: 'Department of Commerce',
    short: 'Commerce',
    budget: 11,
    mission: 'Trade enforcement, export controls, the census and the weather service.',
    work: ['Enforcing export controls on sensitive technology', 'Preparing the next census', 'Running the National Weather Service'],
    support: { r_establishment: 2, d_establishment: 1, d_moderate: 1, libertarian_third: -2 },
    lean: { economic: -1, trade: 1 },
    size: 'small',
    abolishable: true,
    directives: [
      {
        id: 'chip_controls',
        title: 'Tighten export controls on advanced chips',
        summary: 'Blocks sales of cutting-edge semiconductors and chipmaking tools to strategic rivals.',
        work: 'Blocking advanced chip exports to strategic rivals',
        radical: 4,
        reactions: { r_america_first: 2, r_traditional_neocon: 3, r_establishment: -1, d_establishment: 1, d_moderate: 1, independent: 1, libertarian_third: -2 },
        lean: { trade: 5, foreign_policy: 3 },
      },
      {
        id: 'buy_american',
        title: 'Strict Buy American rules for federal purchases',
        summary: 'Raises the domestic-content requirement for everything the government buys.',
        work: 'Rewriting federal purchasing rules to favor American-made goods',
        radical: 5,
        reactions: { r_america_first: 3, r_establishment: -2, d_establishment: 1, d_progressive: 2, d_moderate: 1, independent: 1, libertarian_third: -3 },
        lean: { trade: 7 },
        impacts: { inflation: ['up', 'minor'] },
      },
    ],
  },

  defense: {
    id: 'defense',
    name: 'Department of Defense',
    short: 'Defense',
    budget: 850,
    mission: 'The armed forces, military bases at home and abroad, and weapons programs.',
    work: ['Deterring aggression in Europe and the Pacific', 'Modernizing ships, aircraft and nuclear forces', 'Recruiting and training 1.3 million troops'],
    support: { r_traditional_neocon: 3, r_establishment: 2, d_establishment: 1, d_moderate: 1, d_progressive: -3, libertarian_third: -3 },
    lean: { foreign_policy: 4 },
    growthImpacts: { conflict_index: ['down', 'minor'] },
    size: 'large',
    abolishable: false,
    directives: [
      {
        id: 'troops_border',
        title: 'Deploy troops to support the border',
        summary: 'Sends active-duty units to assist with surveillance and logistics on the southern border.',
        work: 'Supporting border operations with active-duty troops',
        radical: 7,
        reactions: { r_america_first: 4, r_traditional_neocon: 2, d_establishment: -2, d_progressive: -4, d_moderate: -1, libertarian_third: -2 },
        lean: { immigration: 7, institutional: -3 },
        impacts: { border_crossings: ['down', 'moderate'] },
        courtChallenge: true,
      },
      {
        id: 'bring_home',
        title: 'Bring troops home from overseas bases',
        summary: 'Begins withdrawing forces from bases the administration considers unnecessary.',
        work: 'Drawing down forces stationed overseas',
        radical: 6,
        reactions: { r_america_first: 2, r_traditional_neocon: -4, r_establishment: -3, d_establishment: -2, d_progressive: 3, d_moderate: -1, independent: 1, libertarian_third: 4 },
        lean: { foreign_policy: -7 },
        impacts: { conflict_index: ['up', 'minor'] },
      },
      {
        id: 'arsenal_surge',
        title: 'Surge weapons production for allies',
        summary: 'Uses wartime contracting powers to speed up munitions production.',
        work: 'Running munitions plants around the clock for allies',
        radical: 4,
        reactions: { r_traditional_neocon: 4, r_establishment: 3, d_establishment: 2, d_moderate: 1, r_america_first: -2, d_progressive: -3, independent: -1, libertarian_third: -3 },
        lean: { foreign_policy: 7 },
        impacts: { conflict_index: ['down', 'minor'], national_debt: ['up', 'minor'] },
      },
    ],
  },

  education: {
    id: 'education',
    name: 'Department of Education',
    short: 'Education',
    budget: 79,
    mission: 'Funding for low-income schools, special education and student aid.',
    work: ['Sending Title I money to high-poverty schools', 'Funding special education', 'Managing $1.6 trillion in student loans'],
    support: { r_america_first: -2, r_traditional_neocon: -1, d_establishment: 2, d_progressive: 3, d_moderate: 1, libertarian_third: -3 },
    lean: { economic: -3 },
    size: 'medium',
    abolishable: true,
    directives: [
      {
        id: 'loan_pause',
        title: 'Pause student loan payments',
        summary: 'Suspends payments and interest on federal student loans for a year.',
        work: 'Administering a pause on student loan payments',
        radical: 7,
        reactions: { d_progressive: 4, d_establishment: 2, independent: 1, r_america_first: -1, r_traditional_neocon: -2, r_establishment: -2, libertarian_third: -3 },
        lean: { economic: -6 },
        impacts: { national_debt: ['up', 'moderate'] },
        courtChallenge: true,
        exceedsAuthority: true,
      },
      {
        id: 'to_states',
        title: 'Send education programs back to the states',
        summary: 'Converts federal grant programs into flexible block grants run by the states.',
        work: 'Handing grant programs to state education agencies',
        radical: 6,
        reactions: { r_america_first: 3, r_traditional_neocon: 3, r_establishment: 1, libertarian_third: 3, d_establishment: -2, d_progressive: -3, d_moderate: -1 },
        lean: { economic: 4, institutional: -3 },
        courtChallenge: true,
      },
    ],
  },

  energy: {
    id: 'energy',
    name: 'Department of Energy',
    short: 'Energy',
    budget: 50,
    mission: 'The nuclear arsenal, national laboratories, the power grid and energy research.',
    work: ['Maintaining the nuclear weapons stockpile', 'Running 17 national laboratories', 'Managing the Strategic Petroleum Reserve'],
    support: { d_establishment: 1, d_progressive: 2, d_moderate: 1, libertarian_third: -2 },
    lean: { economic: -2 },
    growthImpacts: { gas_price: ['down', 'minor'] },
    size: 'medium',
    abolishable: true,
    directives: [
      {
        id: 'drill_permits',
        title: 'Fast-track oil, gas and pipeline permits',
        summary: 'Sets hard deadlines for energy permits and approves stalled pipeline projects.',
        work: 'Approving oil, gas and pipeline permits on a fast track',
        radical: 5,
        reactions: { r_america_first: 3, r_traditional_neocon: 2, r_establishment: 3, libertarian_third: 1, d_establishment: -1, d_progressive: -4, d_moderate: 1, independent: 1 },
        lean: { economic: 5 },
        impacts: { gas_price: ['down', 'moderate'] },
      },
      {
        id: 'clean_grid',
        title: 'Speed up clean-energy grid projects',
        summary: 'Prioritizes transmission lines and grid storage for wind, solar and nuclear power.',
        work: 'Building transmission lines for clean power',
        radical: 4,
        reactions: { d_establishment: 3, d_progressive: 3, d_moderate: 2, independent: 1, r_america_first: -2, r_traditional_neocon: -1, libertarian_third: -1 },
        lean: { economic: -3 },
        impacts: { gas_price: ['down', 'minor'], national_debt: ['up', 'minor'] },
      },
      {
        id: 'spr_release',
        title: 'Release oil from the Strategic Petroleum Reserve',
        summary: 'Sells reserve crude to bring down prices at the pump.',
        work: 'Selling crude from the Strategic Petroleum Reserve',
        radical: 3,
        reactions: { independent: 2, d_moderate: 2, d_establishment: 1, r_america_first: 1, r_traditional_neocon: -1, libertarian_third: -1 },
        lean: { economic: -1 },
        impacts: { gas_price: ['down', 'moderate'] },
      },
    ],
  },

  hhs: {
    id: 'hhs',
    name: 'Department of Health and Human Services',
    short: 'HHS',
    budget: 130,
    mission: 'Medicare, Medicaid, public health, medical research and drug safety.',
    work: ['Running Medicare and Medicaid with the states', 'Funding medical research at NIH', 'Approving new drugs at the FDA'],
    support: { d_establishment: 2, d_progressive: 3, d_moderate: 1, r_america_first: -1, r_traditional_neocon: -1, r_establishment: -1, libertarian_third: -3 },
    lean: { economic: -4 },
    size: 'large',
    abolishable: true,
    directives: [
      {
        id: 'drug_prices',
        title: 'Negotiate lower prescription drug prices',
        summary: 'Expands Medicare drug-price negotiation to dozens more medicines.',
        work: 'Negotiating lower prices for common prescription drugs',
        radical: 4,
        reactions: { d_progressive: 3, d_establishment: 3, d_moderate: 2, independent: 3, r_america_first: 2, r_traditional_neocon: -1, r_establishment: -2, libertarian_third: -2 },
        lean: { economic: -4 },
        impacts: { inflation: ['down', 'minor'] },
        courtChallenge: true,
      },
      {
        id: 'medicaid_work',
        title: 'Add work requirements to Medicaid',
        summary: 'Approves state plans requiring able-bodied adults to work, study or volunteer.',
        work: 'Approving Medicaid work requirements in the states',
        radical: 6,
        reactions: { r_america_first: 2, r_traditional_neocon: 3, r_establishment: 2, libertarian_third: 2, d_establishment: -3, d_progressive: -4, d_moderate: -1, independent: -1 },
        lean: { economic: 6 },
        impacts: { national_debt: ['down', 'minor'] },
        courtChallenge: true,
      },
    ],
  },

  dhs: {
    id: 'dhs',
    name: 'Department of Homeland Security',
    short: 'Homeland Security',
    budget: 62,
    mission: 'Border security, immigration enforcement, disaster response and cybersecurity.',
    work: ['Patrolling the borders and ports of entry', 'Processing asylum and visa cases', 'Responding to disasters through FEMA'],
    support: { r_america_first: 3, r_traditional_neocon: 2, r_establishment: 1, d_progressive: -4, d_moderate: 1, independent: 1, libertarian_third: -2 },
    lean: { immigration: 5 },
    growthImpacts: { border_crossings: ['down', 'minor'] },
    size: 'medium',
    abolishable: true,
    directives: [
      {
        id: 'mass_deport',
        title: 'Prioritize deportations and finish the wall',
        summary: 'Redirects agents to interior enforcement and restarts wall construction.',
        work: 'Running large-scale deportation operations and building the wall',
        radical: 8,
        reactions: { r_america_first: 5, r_traditional_neocon: 3, d_establishment: -3, d_progressive: -5, d_moderate: -2, libertarian_third: -2 },
        lean: { immigration: 9, institutional: -3 },
        impacts: { border_crossings: ['down', 'major'] },
        courtChallenge: true,
      },
      {
        id: 'legal_pathways',
        title: 'Expand legal pathways and asylum processing',
        summary: 'Adds parole programs and asylum officers so cases are decided in months, not years.',
        work: 'Expanding legal entry programs and speeding up asylum decisions',
        radical: 6,
        reactions: { d_progressive: 3, d_establishment: 3, d_moderate: 1, libertarian_third: 2, r_establishment: 1, r_america_first: -5, r_traditional_neocon: -3 },
        lean: { immigration: -6 },
        impacts: { border_crossings: ['up', 'minor'] },
      },
      {
        id: 'border_surge',
        title: 'Surge border officers and immigration judges',
        summary: 'Hires agents and judges to clear the case backlog and secure crossings.',
        work: 'Hiring border officers and immigration judges',
        radical: 3,
        reactions: { d_moderate: 3, d_establishment: 2, r_establishment: 2, r_traditional_neocon: 2, independent: 2, r_america_first: 1, d_progressive: -2, libertarian_third: -1 },
        lean: { immigration: 3 },
        impacts: { border_crossings: ['down', 'moderate'], national_debt: ['up', 'minor'] },
      },
    ],
  },

  hud: {
    id: 'hud',
    name: 'Department of Housing and Urban Development',
    short: 'HUD',
    budget: 70,
    mission: 'Rental assistance, public housing, mortgage insurance and fair-housing enforcement.',
    work: ['Paying rental vouchers for 2.3 million families', 'Insuring first-time buyers’ mortgages', 'Enforcing fair-housing law'],
    support: { d_establishment: 2, d_progressive: 3, d_moderate: 1, r_america_first: -1, r_traditional_neocon: -1, r_establishment: -1, libertarian_third: -3 },
    lean: { economic: -4 },
    size: 'medium',
    abolishable: true,
    directives: [
      {
        id: 'build_homes',
        title: 'Cut red tape to build more homes',
        summary: 'Ties federal grants to local zoning reform and speeds approvals on federal land.',
        work: 'Pushing cities to approve more housing',
        radical: 3,
        reactions: { r_establishment: 2, d_moderate: 3, d_establishment: 2, independent: 2, libertarian_third: 3, r_traditional_neocon: 1 },
        lean: { economic: 2, institutional: -1 },
        impacts: { inflation: ['down', 'minor'] },
      },
      {
        id: 'rent_relief',
        title: 'Federal rent relief for struggling renters',
        summary: 'Emergency rent assistance for households spending over half their income on rent.',
        work: 'Paying emergency rent assistance',
        radical: 6,
        reactions: { d_progressive: 4, d_establishment: 2, independent: 1, r_america_first: -1, r_traditional_neocon: -2, r_establishment: -2, libertarian_third: -3 },
        lean: { economic: -6 },
        impacts: { national_debt: ['up', 'moderate'], inflation: ['up', 'minor'] },
      },
    ],
  },

  interior: {
    id: 'interior',
    name: 'Department of the Interior',
    short: 'Interior',
    budget: 15,
    mission: 'National parks, federal lands, tribal relations and offshore energy leases.',
    work: ['Running 63 national parks', 'Leasing federal land and waters for energy', 'Managing water in the drought-hit West'],
    support: { d_establishment: 1, d_progressive: 2, d_moderate: 1, independent: 1, r_america_first: -1, libertarian_third: -2 },
    lean: { economic: -1 },
    size: 'small',
    abolishable: true,
    directives: [
      {
        id: 'open_lands',
        title: 'Open federal lands to drilling and mining',
        summary: 'Holds new lease sales onshore and offshore and fast-tracks critical-mineral mines.',
        work: 'Leasing federal land for drilling and mining',
        radical: 5,
        reactions: { r_america_first: 3, r_traditional_neocon: 2, r_establishment: 3, libertarian_third: 1, d_establishment: -2, d_progressive: -4 },
        lean: { economic: 5 },
        impacts: { gas_price: ['down', 'minor'] },
      },
      {
        id: 'monuments',
        title: 'Protect new national monuments',
        summary: 'Uses the Antiquities Act to protect millions of acres from development.',
        work: 'Protecting new national monuments from development',
        radical: 4,
        reactions: { d_progressive: 3, d_establishment: 3, d_moderate: 1, independent: 1, r_america_first: -2, r_traditional_neocon: -1, r_establishment: -1, libertarian_third: -1 },
        lean: { economic: -2 },
        courtChallenge: true,
      },
    ],
  },

  justice: {
    id: 'justice',
    name: 'Department of Justice',
    short: 'Justice',
    budget: 38,
    mission: 'Federal prosecutors, the FBI, the DEA, federal prisons and civil-rights enforcement.',
    work: ['Prosecuting federal crimes through 94 U.S. attorneys', 'Investigating threats through the FBI', 'Running the federal prison system'],
    support: { r_traditional_neocon: 2, r_establishment: 1, d_establishment: 1, d_moderate: 1, r_america_first: -1, d_progressive: -1, libertarian_third: -2 },
    lean: { institutional: 3 },
    size: 'small',
    abolishable: false,
    directives: [
      {
        id: 'fentanyl',
        title: 'Crack down on fentanyl trafficking',
        summary: 'Creates joint task forces targeting cartels and the networks that supply them.',
        work: 'Running task forces against fentanyl trafficking networks',
        radical: 3,
        reactions: { r_traditional_neocon: 3, r_america_first: 3, r_establishment: 2, d_moderate: 2, d_establishment: 1, independent: 2, d_progressive: -1, libertarian_third: -1 },
        lean: { immigration: 2, social: 2 },
      },
      {
        id: 'clemency',
        title: 'Clemency for nonviolent drug offenses',
        summary: 'Commutes sentences for thousands of people serving time for nonviolent drug crimes.',
        work: 'Reviewing clemency petitions for nonviolent drug offenses',
        radical: 5,
        reactions: { d_progressive: 4, libertarian_third: 4, d_establishment: 1, independent: 1, r_america_first: -1, r_traditional_neocon: -3, r_establishment: -1 },
        lean: { social: -5 },
      },
      {
        id: 'special_counsel',
        title: 'Appoint a special counsel on corruption in Washington',
        summary: 'Opens a sweeping investigation into lobbying, stock trading and influence-peddling.',
        work: 'Investigating corruption in Washington through a special counsel',
        radical: 6,
        reactions: { r_america_first: 3, r_traditional_neocon: 1, d_progressive: 1, independent: 1, libertarian_third: 1, r_establishment: -2, d_establishment: -1, d_moderate: -1 },
        lean: { institutional: -5 },
        courtChallenge: true,
      },
    ],
  },

  labor: {
    id: 'labor',
    name: 'Department of Labor',
    short: 'Labor',
    budget: 13,
    mission: 'Workplace safety, wage laws, job training and unemployment insurance.',
    work: ['Enforcing minimum-wage and overtime law', 'Inspecting workplaces through OSHA', 'Funding job training and apprenticeships'],
    support: { d_establishment: 2, d_progressive: 3, d_moderate: 1, r_america_first: 1, r_traditional_neocon: -1, r_establishment: -2, libertarian_third: -3 },
    lean: { economic: -3 },
    size: 'small',
    abolishable: true,
    directives: [
      {
        id: 'contractor_wage',
        title: 'Raise the minimum wage for federal contractors',
        summary: 'Sets a higher wage floor for everyone working on a federal contract.',
        work: 'Enforcing a higher wage floor for federal contractors',
        radical: 5,
        reactions: { d_progressive: 4, d_establishment: 2, d_moderate: 1, independent: 1, r_traditional_neocon: -2, r_establishment: -3, libertarian_third: -3 },
        lean: { economic: -5 },
        impacts: { inflation: ['up', 'minor'] },
        courtChallenge: true,
      },
      {
        id: 'apprenticeships',
        title: 'Expand apprenticeships for trades jobs',
        summary: 'Doubles federal support for registered apprenticeships in construction and manufacturing.',
        work: 'Expanding apprenticeships in the skilled trades',
        radical: 2,
        reactions: { r_america_first: 2, r_traditional_neocon: 1, r_establishment: 2, d_establishment: 2, d_moderate: 3, independent: 2, d_progressive: 1, libertarian_third: -1 },
        lean: { economic: -1 },
      },
    ],
  },

  state: {
    id: 'state',
    name: 'Department of State',
    short: 'State',
    budget: 60,
    mission: 'Diplomacy, embassies, foreign aid and passports.',
    work: ['Running 270 embassies and consulates', 'Negotiating with allies and rivals', 'Delivering foreign aid and disaster relief'],
    support: { d_establishment: 2, r_establishment: 2, r_traditional_neocon: 2, d_moderate: 1, r_america_first: -3, d_progressive: -1, independent: -1, libertarian_third: -3 },
    lean: { foreign_policy: 4 },
    size: 'medium',
    abolishable: false,
    directives: [
      {
        id: 'peace_push',
        title: 'Launch a peace push to end a major war',
        summary: 'Sends a special envoy to broker a ceasefire and convenes the parties.',
        work: 'Brokering ceasefire talks through a special envoy',
        radical: 4,
        reactions: { d_progressive: 2, libertarian_third: 3, r_america_first: 2, independent: 3, d_moderate: 1, d_establishment: 1, r_traditional_neocon: -2, r_establishment: -1 },
        lean: { foreign_policy: -4 },
        impacts: { conflict_index: ['down', 'moderate'] },
      },
      {
        id: 'aid_freeze',
        title: 'Freeze foreign aid pending review',
        summary: 'Halts most foreign aid disbursements for 90 days while programs are reviewed.',
        work: 'Reviewing every foreign aid program during a freeze',
        radical: 7,
        reactions: { r_america_first: 4, libertarian_third: 3, independent: 1, r_establishment: -2, d_establishment: -3, d_progressive: -1, d_moderate: -1 },
        lean: { foreign_policy: -6, institutional: -3 },
        impacts: { national_debt: ['down', 'minor'], conflict_index: ['up', 'minor'] },
        exceedsAuthority: true,
      },
    ],
  },

  transportation: {
    id: 'transportation',
    name: 'Department of Transportation',
    short: 'Transportation',
    budget: 27,
    mission: 'Highways, air traffic control, rail, transit and vehicle safety.',
    work: ['Funding highway and bridge repairs', 'Running air traffic control', 'Setting vehicle and pipeline safety rules'],
    support: { d_establishment: 2, d_moderate: 2, r_establishment: 1, d_progressive: 1, r_america_first: 1, independent: 1, libertarian_third: -2 },
    lean: { economic: -2 },
    size: 'small',
    abolishable: true,
    directives: [
      {
        id: 'roads_bridges',
        title: 'Fast-track road and bridge repairs',
        summary: 'Waives duplicate reviews so repair projects start within a year.',
        work: 'Fast-tracking road and bridge repairs',
        radical: 2,
        reactions: { d_moderate: 2, d_establishment: 2, r_establishment: 2, r_america_first: 1, r_traditional_neocon: 1, independent: 2 },
        lean: { economic: -1, institutional: -1 },
      },
      {
        id: 'ev_fleet',
        title: 'Electrify the federal vehicle fleet',
        summary: 'Replaces the government’s 650,000 vehicles with electric models by 2035.',
        work: 'Replacing federal vehicles with electric models',
        radical: 4,
        reactions: { d_progressive: 2, d_establishment: 2, d_moderate: 1, r_america_first: -2, r_traditional_neocon: -1, r_establishment: -1, libertarian_third: -2 },
        lean: { economic: -2 },
        impacts: { national_debt: ['up', 'minor'] },
      },
    ],
  },

  treasury: {
    id: 'treasury',
    name: 'Department of the Treasury',
    short: 'Treasury',
    budget: 15,
    mission: 'Taxes, the federal debt, sanctions and the currency.',
    work: ['Collecting taxes through the IRS', 'Selling Treasury bonds to fund the debt', 'Enforcing sanctions on hostile regimes'],
    support: { r_establishment: 1, d_establishment: 1, libertarian_third: -1 },
    lean: { institutional: 2 },
    size: 'small',
    abolishable: false,
    directives: [
      {
        id: 'oil_sanctions',
        title: 'Sanction a hostile regime’s oil exports',
        summary: 'Targets the tankers, ports and banks that move a rival’s oil.',
        work: 'Enforcing sanctions on a hostile regime’s oil trade',
        radical: 4,
        reactions: { r_traditional_neocon: 3, r_establishment: 1, d_establishment: 2, d_moderate: 1, r_america_first: 1, d_progressive: -1, libertarian_third: -2 },
        lean: { foreign_policy: 5 },
        impacts: { gas_price: ['up', 'minor'], conflict_index: ['down', 'minor'] },
      },
      {
        id: 'irs_enforcement',
        title: 'Crack down on high-income tax evasion',
        summary: 'Directs IRS auditors toward high-income earners and large corporations.',
        work: 'Auditing high-income tax evasion',
        radical: 4,
        reactions: { d_progressive: 3, d_establishment: 2, d_moderate: 1, independent: 1, r_america_first: -2, r_traditional_neocon: -2, r_establishment: -3, libertarian_third: -4 },
        lean: { economic: -4 },
        impacts: { national_debt: ['down', 'minor'] },
      },
    ],
  },

  va: {
    id: 'va',
    name: 'Department of Veterans Affairs',
    short: 'Veterans Affairs',
    budget: 135,
    mission: 'Health care, disability benefits and education benefits for 18 million veterans.',
    work: ['Running 170 VA medical centers', 'Paying disability compensation', 'Paying for veterans’ education through the GI Bill'],
    support: { r_america_first: 2, r_traditional_neocon: 3, r_establishment: 1, d_establishment: 2, d_progressive: 1, d_moderate: 2, independent: 2, libertarian_third: -1 },
    lean: { economic: -1 },
    size: 'large',
    abolishable: false,
    directives: [
      {
        id: 'va_choice',
        title: 'Let veterans see private doctors faster',
        summary: 'Lets veterans facing long VA waits book private care on the VA’s dime.',
        work: 'Paying for veterans to see private doctors when VA waits are long',
        radical: 3,
        reactions: { r_america_first: 3, r_traditional_neocon: 2, r_establishment: 2, libertarian_third: 2, d_moderate: 1, independent: 2, d_establishment: -1, d_progressive: -2 },
        lean: { economic: 3 },
      },
      {
        id: 'va_hiring',
        title: 'Hire thousands of VA doctors and nurses',
        summary: 'Fills open clinical jobs with signing bonuses and loan forgiveness.',
        work: 'Hiring doctors and nurses for VA hospitals',
        radical: 3,
        reactions: { d_establishment: 2, d_progressive: 2, d_moderate: 2, independent: 1, r_traditional_neocon: 1, r_establishment: -1, libertarian_third: -2 },
        lean: { economic: -3 },
        impacts: { national_debt: ['up', 'minor'] },
      },
    ],
  },

  epa: {
    id: 'epa',
    name: 'Environmental Protection Agency',
    short: 'EPA',
    budget: 9,
    mission: 'Clean air and water rules, chemical safety and toxic-site cleanup.',
    work: ['Setting air and water pollution limits', 'Cleaning up Superfund sites', 'Reviewing the safety of new chemicals'],
    support: { d_establishment: 2, d_progressive: 4, d_moderate: 1, r_america_first: -3, r_traditional_neocon: -1, r_establishment: -2, libertarian_third: -3 },
    lean: { economic: -3 },
    size: 'small',
    abolishable: true,
    directives: [
      {
        id: 'rollback',
        title: 'Roll back power plant and auto emissions rules',
        summary: 'Withdraws and rewrites the strictest emissions limits on cars and power plants.',
        work: 'Rewriting emissions rules for power plants and vehicles',
        radical: 6,
        reactions: { r_america_first: 3, r_establishment: 3, r_traditional_neocon: 1, libertarian_third: 2, d_establishment: -2, d_progressive: -5 },
        lean: { economic: 5 },
        impacts: { gas_price: ['down', 'minor'] },
        courtChallenge: true,
      },
      {
        id: 'forever_chemicals',
        title: 'Tighten limits on forever chemicals in water',
        summary: 'Sets enforceable limits on PFAS in drinking water and funds treatment upgrades.',
        work: 'Enforcing new limits on forever chemicals in drinking water',
        radical: 3,
        reactions: { d_progressive: 3, d_establishment: 3, d_moderate: 2, independent: 2, r_traditional_neocon: 1, r_establishment: -2, libertarian_third: -2 },
        lean: { economic: -2 },
      },
    ],
  },
};

export const DEPARTMENT_LIST = Object.values(DEPARTMENTS);

/** Tuning for budget actions. */
export const DEPARTMENT_RULES = {
  /** Each budget level is this fraction of the baseline budget. */
  levelStep: 0.15,
  /** Faction reaction per point of `support` for a one-step budget change. */
  budgetReaction: 1.5,
  /** …for eliminating the department, and for re-creating one. */
  abolishReaction: 2.5,
  restoreReaction: 2,
  /** Radical score of each kind of request. Going to ±2 is one point more radical. */
  radical: { budget: 3, budgetExtreme: 4, abolish: 9, restore: 6, rescind: 2 },
  /** Debt impact by department size. */
  debt: { small: 'minor', medium: 'minor', large: 'moderate' },
} as const;

export const LEVEL_LABEL: Record<number, string> = {
  [-2]: 'Deep cuts',
  [-1]: 'Trimmed',
  0: 'Baseline',
  1: 'Expanded',
  2: 'Major expansion',
};

/** How the department's work changes with its budget. */
export const LEVEL_WORK: Record<number, string> = {
  [-2]: 'Closing field offices and freezing hiring after deep cuts',
  [-1]: 'Trimming programs to fit a smaller budget',
  0: '',
  1: 'Hiring and expanding programs with new funding',
  2: 'Launching new programs on a much larger budget',
};
