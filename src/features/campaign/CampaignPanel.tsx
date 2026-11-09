import { useMemo, useState } from 'react';
import type { FactionId, StateCode } from '@/domain/types';
import { FACTIONS } from '@/data/factions';
import { STATES } from '@/data/states';
import { CAMPAIGN, DEBATE_STYLE_TEXT, WINGS, type DebateStyle } from '@/data/campaign';
import {
  adEffect,
  battlegrounds,
  campaignRejection,
  debateAvailable,
  debateTopics,
  fundraiseAmount,
  isCampaignPhase,
  primaryStanding,
  rallyFactor,
  type CampaignAction,
  type CampaignRejection,
} from '@/engine/campaign/campaign';
import type { GameState } from '@/engine/loop/types';
import { Button } from '@/components/ui/Button';
import { useGameStore } from '@/store/gameStore';
import { PARTY_ADJ, PARTY_COLOR_VAR, pct, signed } from '@/lib/format';
import { POLICY_AXES } from '@/domain/constants';
import { RACE, WING_LABEL } from '@/data/candidates';
import { AXIS_TOPIC, FILE_LABEL } from '@/engine/campaign/campaign';
import { attackEffectiveness, attackTarget, backlashChance, recordAttackGain, weakestAxis } from '@/engine/campaign/race';

const REFUSAL: Record<CampaignRejection, string> = {
  game_over: 'This campaign has ended.',
  not_campaign_season: 'Campaigning opens in primary season and the quarter before each election.',
  no_actions_left: 'You have used all three campaign actions this quarter. End the quarter for more.',
  insufficient_funds: 'Not enough money. Hold a fundraiser first.',
  invalid_amount: `Ad buys run from $${CAMPAIGN.ads.minBuy}M to $${CAMPAIGN.ads.maxBuy}M.`,
  not_primary: 'Pledges only matter during primary season.',
  already_pledged: 'You have already made a pledge this quarter.',
  not_own_faction: 'You can only pledge to your own party’s wings.',
  no_debate_now: 'The debate is held once, in the general campaign.',
  invalid_answers: 'Choose an answer for all three questions.',
  no_successor_to_name: 'There is no successor to name.',
  invalid_name: 'Names must be 2 to 40 characters.',
  no_file: 'Nothing to release yet. Commission opposition research first.',
  file_full: 'The research file is as strong as it will get. Release it.',
  already_responding: 'Your rapid-response team is already on duty this quarter.',
};

/** Campaign headquarters: shown in campaign quarters, and whenever a successor needs a name. */
export function CampaignPanel({ game }: { game: GameState }) {
  const run = useGameStore((s) => s.campaign);
  const [result, setResult] = useState<string | null>(null);
  const act = (a: CampaignAction) => setResult(run(a));

  const needsName = !game.campaign.successorNamed && game.player.generation > 0;
  if (!isCampaignPhase(game.phase) && !needsName) return null;
  const left = CAMPAIGN.actionsPerTurn - game.campaign.actionsUsed;

  return (
    <section aria-labelledby="campaign-h" className="rounded-lg border border-ink/20 bg-panel p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 id="campaign-h" className="font-serif text-2xl font-bold">Campaign headquarters</h2>
          <p className="mt-1 text-sm text-ink-2">Three actions a quarter. The opposition campaigns in the closest states every quarter too.</p>
        </div>
        <dl className="flex gap-6 text-sm">
          <div>
            <dt className="text-ink-2">War chest</dt>
            <dd className="text-xl font-semibold tabular-nums">${Math.round(game.campaign.funds)}M</dd>
          </div>
          <div>
            <dt className="text-ink-2">Actions left</dt>
            <dd className="mt-1.5 flex gap-1" aria-label={`${left} of ${CAMPAIGN.actionsPerTurn}`}>
              {Array.from({ length: CAMPAIGN.actionsPerTurn }, (_, i) => (
                <span key={i} className={`h-3.5 w-3.5 rounded-sm ${i < left ? 'bg-brass' : 'border border-ink/25'}`} />
              ))}
            </dd>
          </div>
        </dl>
      </div>

      {result && (
        <p role="status" className="mt-4 rounded-md bg-brass-tint px-3 py-2 text-sm text-ink">
          {result}
        </p>
      )}

      <div className="mt-6 space-y-8">
        {needsName && <NameSuccessor game={game} act={act} />}
        {isCampaignPhase(game.phase) && <OpponentCard game={game} />}
        {game.phase === 'primary' && <Primary game={game} act={act} />}
        {debateAvailable(game) && <Debate game={game} act={act} />}
        {isCampaignPhase(game.phase) && <Actions game={game} act={act} />}
        {isCampaignPhase(game.phase) && <Offensive game={game} act={act} />}
        {game.campaign.recent.length > 0 && (
          <div>
            <h3 className="font-semibold">On the trail</h3>
            <ol className="mt-2 space-y-1 text-sm text-ink-2">
              {game.campaign.recent.slice(0, 5).map((r, i) => (
                <li key={`${r.turn}-${i}`}>{r.text}</li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </section>
  );
}

type Act = (a: CampaignAction) => void;

function Refusal({ why }: { why: CampaignRejection | null }) {
  return why && why !== 'no_actions_left' ? <p className="mt-2 text-xs text-ink-2">{REFUSAL[why]}</p> : null;
}

function Actions({ game, act }: { game: GameState; act: Act }) {
  const close = useMemo(() => battlegrounds(game, 50), [game]);
  const [rallyState, setRallyState] = useState<StateCode>(close[0]!);
  const [adState, setAdState] = useState<StateCode>(close[1] ?? close[0]!);
  const [amount, setAmount] = useState(20);
  const [tone, setTone] = useState<'positive' | 'negative'>('positive');
  const out = game.campaign.actionsUsed >= CAMPAIGN.actionsPerTurn;

  const stateOptions = close.map((s) => (
    <option key={s} value={s}>
      {STATES[s].name}
    </option>
  ));

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h3 className="font-semibold">This quarter’s moves</h3>
        {out && <span className="text-sm text-ink-2">{REFUSAL.no_actions_left}</span>}
      </div>
      <p className="mt-1 text-xs text-ink-3">States are listed closest race first.</p>
      <div className="mt-3 grid gap-4 md:grid-cols-3">
        <div className="rounded-md border border-rule p-4">
          <h4 className="font-medium">Hold a fundraiser</h4>
          <p className="mt-1 text-sm text-ink-2">
            Raises about ${fundraiseAmount(game)}M. Donors are {FACTIONS[WINGS[game.player.party].moderate].label} voters; your{' '}
            {FACTIONS[WINGS[game.player.party].base].label} wing notices.
          </p>
          <Button className="mt-3 w-full" disabled={out} onClick={() => act({ type: 'fundraise' })}>
            Fundraise
          </Button>
        </div>

        <div className="rounded-md border border-rule p-4">
          <h4 className="font-medium">Hold a rally</h4>
          <label className="mt-2 block text-sm">
            <span className="sr-only">Rally state</span>
            <select value={rallyState} onChange={(e) => setRallyState(e.target.value as StateCode)} className="w-full rounded border border-ink/25 bg-white px-2 py-1.5">
              {stateOptions}
            </select>
          </label>
          <p className="mt-2 text-sm text-ink-2">
            Fires up your base’s turnout there.{' '}
            {rallyFactor(game, rallyState) < 1 && `You have been here before: ${pct(rallyFactor(game, rallyState))} of the effect.`}
          </p>
          <Button className="mt-3 w-full" disabled={out} onClick={() => act({ type: 'rally', state: rallyState })}>
            Rally in {rallyState}
          </Button>
        </div>

        <div className="rounded-md border border-rule p-4">
          <h4 className="font-medium">Buy ads</h4>
          <label className="mt-2 block text-sm">
            <span className="sr-only">Ad state</span>
            <select value={adState} onChange={(e) => setAdState(e.target.value as StateCode)} className="w-full rounded border border-ink/25 bg-white px-2 py-1.5">
              {stateOptions}
            </select>
          </label>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input
              type="range"
              min={CAMPAIGN.ads.minBuy}
              max={CAMPAIGN.ads.maxBuy}
              step={5}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="flex-1 accent-[var(--color-brass)]"
              aria-label="Ad budget in millions of dollars"
            />
            <span className="w-12 text-right tabular-nums">${amount}M</span>
          </label>
          <div className="mt-2 flex gap-1.5 text-xs" role="radiogroup" aria-label="Ad tone">
            {(['positive', 'negative'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={tone === t}
                onClick={() => setTone(t)}
                className={`flex-1 rounded border px-2 py-1 ${tone === t ? 'border-ink bg-white font-semibold' : 'border-rule text-ink-2'}`}
              >
                {t === 'positive' ? 'Positive' : 'Attack ad'}
              </button>
            ))}
          </div>
          <p className="mt-1 text-sm text-ink-2">
            {tone === 'positive'
              ? `Moves persuadable voters about ${adEffect(game, adState, amount).toFixed(1)} points.`
              : `Less persuasion, but depresses ${game.race.opponent.party === 'R' ? 'Republican' : 'Democratic'} turnout there. Can backfire.`}
          </p>
          <Button className="mt-3 w-full" disabled={out || amount > game.campaign.funds} onClick={() => act({ type: 'ad', state: adState, amount, tone })}>
            Run {tone === 'negative' ? 'attack ' : ''}ads in {adState}
          </Button>
          <Refusal why={amount > game.campaign.funds ? 'insufficient_funds' : null} />
        </div>
      </div>
    </div>
  );
}

function Primary({ game, act }: { game: GameState; act: Act }) {
  const standing = primaryStanding(game);
  const wings = WINGS[game.player.party];
  const roles: { f: FactionId; note: string }[] = [
    { f: wings.base, note: 'The loudest primary voters. Pulls your platform furthest from the center.' },
    { f: wings.core, note: 'The party’s backbone. A safe pledge with a moderate pull.' },
    { f: wings.moderate, note: 'Helps in swing states later, but carries little weight in a primary.' },
  ];
  const pledged = game.campaign.pledgedThisTurn;

  return (
    <div>
      <h3 className="font-semibold">The {game.year} primary</h3>
      <p className="mt-1 text-sm text-ink-2">
        Votes are counted when Q2 ends. Projected share: <span className="font-semibold text-ink">{pct(standing.share)}</span>
        {standing.share < 0.55 ? '. This is close: your own party is restless.' : '. You are the front-runner.'}
      </p>
      <ul className="mt-3 space-y-2">
        {standing.wings.map((w) => (
          <li key={w.faction} className="grid grid-cols-[12rem_1fr_3rem] items-center gap-3 text-sm max-sm:grid-cols-[1fr_3rem]">
            <span>
              {FACTIONS[w.faction].label}
              <span className="block text-xs text-ink-3">{pct(w.weight)} of primary voters</span>
            </span>
            <span className="relative h-2 rounded-full bg-rule/60 max-sm:col-span-2 max-sm:order-3" aria-hidden>
              <span className="absolute inset-y-0 left-0 rounded-full bg-ink" style={{ width: `${w.support * 100}%` }} />
              <span className="absolute -inset-y-1 left-1/2 w-px bg-ink-3" />
            </span>
            <span className="text-right font-semibold tabular-nums">{pct(w.support)}</span>
          </li>
        ))}
      </ul>
      <h4 className="mt-5 text-sm font-semibold">Make a pledge (one per quarter, free)</h4>
      <div className="mt-2 grid gap-3 md:grid-cols-3">
        {roles.map(({ f, note }) => (
          <div key={f} className="rounded-md border border-rule p-3">
            <div className="font-medium">{FACTIONS[f].label}</div>
            <p className="mt-1 text-xs text-ink-2">{note}</p>
            <Button className="mt-2 w-full" disabled={pledged} onClick={() => act({ type: 'pledge', faction: f })}>
              Pledge to them
            </Button>
          </div>
        ))}
      </div>
      {pledged && <p className="mt-2 text-xs text-ink-2">{REFUSAL.already_pledged}</p>}
    </div>
  );
}

function Debate({ game, act }: { game: GameState; act: Act }) {
  const topics = debateTopics(game);
  const [answers, setAnswers] = useState<Record<string, DebateStyle>>({});
  const complete = topics.every((t) => answers[t.id]);
  const action = { type: 'debate' as const, answers: topics.map((t) => ({ topic: t.id, style: answers[t.id] ?? 'center' })) };

  return (
    <div>
      <h3 className="font-semibold">Debate night</h3>
      <p className="mt-1 text-sm text-ink-2">Three questions. Each answer moves the factions, and how you perform is never certain.</p>
      <ol className="mt-3 space-y-4">
        {topics.map((t, i) => (
          <li key={t.id}>
            <fieldset>
              <legend className="font-serif text-lg leading-snug">
                {i + 1}. {t.question}
              </legend>
              <div className="mt-2 grid gap-2 md:grid-cols-3">
                {(Object.keys(DEBATE_STYLE_TEXT) as DebateStyle[]).map((style) => (
                  <label
                    key={style}
                    className={`cursor-pointer rounded-md border p-2.5 text-sm ${answers[t.id] === style ? 'border-ink bg-white' : 'border-rule hover:border-ink/40'}`}
                  >
                    <input
                      type="radio"
                      name={`debate-${t.id}`}
                      value={style}
                      checked={answers[t.id] === style}
                      onChange={() => setAnswers((a) => ({ ...a, [t.id]: style }))}
                      className="sr-only"
                    />
                    <span className="font-medium">{DEBATE_STYLE_TEXT[style].label}</span>
                    <span className="mt-0.5 block text-xs text-ink-2">{DEBATE_STYLE_TEXT[style].hint}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </li>
        ))}
      </ol>
      <Button variant="primary" className="mt-4" disabled={!complete || campaignRejection(game, action) !== null} onClick={() => act(action)}>
        Take the stage
      </Button>
    </div>
  );
}

function NameSuccessor({ game, act }: { game: GameState; act: Act }) {
  const [name, setName] = useState('');
  const why = name ? campaignRejection(game, { type: 'name_successor', name }) : null;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!campaignRejection(game, { type: 'name_successor', name })) act({ type: 'name_successor', name });
      }}
    >
      <h3 className="font-semibold">Name your successor</h3>
      <p className="mt-1 text-sm text-ink-2">
        The 22nd Amendment ends your second term. Choose who carries the party into the {game.year} primary.
      </p>
      <div className="mt-2 flex gap-2">
        <label className="sr-only" htmlFor="successor">Successor name</label>
        <input
          id="successor"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          placeholder="e.g. Taylor Brooks"
          className="flex-1 rounded-md border border-ink/25 bg-white px-3 py-2"
        />
        <Button type="submit" variant="primary" disabled={!name.trim() || why !== null}>
          Name them
        </Button>
      </div>
      <Refusal why={why} />
    </form>
  );
}

function Pips({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-ink-2">{label}</span>
      <span className="flex gap-0.5" aria-label={`${n} of 5`}>
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} className={`h-2 w-3 rounded-sm ${i < n ? 'bg-ink' : 'bg-rule'}`} />
        ))}
      </span>
    </div>
  );
}

function OpponentCard({ game }: { game: GameState }) {
  const opp = game.race.opponent;
  const midterm = game.phase === 'midterm_campaign';
  const status = game.race.nominated ? `${PARTY_ADJ[opp.party]} nominee` : `${PARTY_ADJ[opp.party]} front-runner for ${game.race.cycle}`;
  const rival = game.phase === 'primary' ? game.race.rival : null;
  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_14rem]">
      <div className="rounded-md border border-rule p-4" style={{ borderLeft: `4px solid ${PARTY_COLOR_VAR[opp.party]}` }}>
        <div className="text-xs font-semibold tracking-wide text-ink-2 uppercase">{midterm ? 'Looking ahead to ' + game.race.cycle : 'Your opponent'}</div>
        <div className="mt-1 font-serif text-2xl font-bold">{opp.name}</div>
        <div className="mt-0.5 text-sm text-ink-2">
          {status} · {STATES[opp.home].name} · {WING_LABEL[opp.wing]}
        </div>
        <p className="mt-2 text-xs text-ink-3">
          {midterm
            ? 'This fall your attacks hit the other party’s candidates for Congress.'
            : `At the convention ${STATES[opp.home].name} rallies to them, and their party’s platform moves toward the ${WING_LABEL[opp.wing].toLowerCase()}.`}
          {opp.real && ' A real politician cast as a fictional opponent: nothing they say or do in this game is real.'}
        </p>
        {rival && (
          <p className="mt-3 border-t border-rule pt-2 text-sm">
            <span className="text-ink-2">Your primary rival:</span> <span className="font-semibold">{rival.name}</span> ({STATES[rival.home].name},{' '}
            {WING_LABEL[rival.wing].toLowerCase()}), splitting that wing’s vote.
          </p>
        )}
      </div>
      <div className="space-y-1.5 rounded-md border border-rule p-4">
        <Pips n={opp.charisma} label="Charisma" />
        <Pips n={opp.fundraising} label="Fundraising" />
        <Pips n={opp.discipline} label="Discipline" />
        <p className="pt-1 text-xs text-ink-3">Charisma wins debates, money buys ads, discipline blunts your attacks.</p>
      </div>
    </div>
  );
}

function Offensive({ game, act }: { game: GameState; act: Act }) {
  const out = game.campaign.actionsUsed >= CAMPAIGN.actionsPerTurn;
  const target = attackTarget(game);
  const axes = [...POLICY_AXES].map((axis) => ({ axis, gain: recordAttackGain(game, axis) })).sort((a, b) => b.gain - a.gain);
  const file = game.campaign.oppoFile;
  const risk = backlashChance(game);
  const exposed = weakestAxis(game);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">Go on the offensive</h3>
        <span className="text-xs text-ink-2">
          Backlash risk {pct(risk)} · attacks land at {pct(attackEffectiveness(game))} strength
        </span>
      </div>
      <p className="mt-1 text-xs text-ink-3">Every attack uses one of your three actions. Going negative too often makes each hit weaker and a backlash likelier; it cools off each quarter.</p>
      <div className="mt-3 grid gap-4 md:grid-cols-3">
        <div className="rounded-md border border-rule p-4 md:col-span-2">
          <h4 className="font-medium">Hit their record (${RACE.record.cost}M)</h4>
          <p className="mt-1 text-sm text-ink-2">Works where {target} is farther from independent voters than you are.</p>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {axes.map(({ axis, gain }) => (
              <li key={axis}>
                <button
                  type="button"
                  disabled={out || game.campaign.funds < RACE.record.cost}
                  onClick={() => act({ type: 'attack_record', axis })}
                  className="flex w-full items-center justify-between gap-2 rounded border border-rule px-2.5 py-1.5 text-left text-sm hover:border-ink/40 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span>{AXIS_TOPIC[axis][0]!.toUpperCase() + AXIS_TOPIC[axis].slice(1)}</span>
                  <span className={`text-xs tabular-nums ${gain > 0.2 ? 'font-semibold text-ink' : 'text-ink-3'}`}>
                    {gain > 0.05 ? `${signed(gain)} indep.` : gain < -0.05 ? 'would backfire' : 'no effect'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-4">
          <div className="rounded-md border border-rule p-4">
            <h4 className="font-medium">Opposition research</h4>
            <p className="mt-1 text-sm text-ink-2">
              File on {target}: <span className="font-semibold text-ink">{FILE_LABEL[file]}</span>
            </p>
            <div className="mt-2 flex gap-2">
              <Button className="flex-1 px-2" disabled={out || campaignRejection(game, { type: 'oppo_research' }) !== null} onClick={() => act({ type: 'oppo_research' })}>
                Dig (${RACE.research.cost}M)
              </Button>
              <Button className="flex-1 px-2" disabled={out || file === 0} onClick={() => act({ type: 'release_oppo' })}>
                Release
              </Button>
            </div>
            <p className="mt-1.5 text-xs text-ink-3">A stronger file hits harder and sharpens attack answers in the debate.</p>
          </div>
          <div className="rounded-md border border-rule p-4">
            <h4 className="font-medium">Rapid response</h4>
            <p className="mt-1 text-sm text-ink-2">
              Halves the opposition’s ads and attacks this quarter.
              {game.phase === 'general_campaign' && exposed.distance >= RACE.opponentAttack.minDistance && ` Expect them to hit you on ${AXIS_TOPIC[exposed.axis]}.`}
            </p>
            <Button className="mt-2 w-full" disabled={out || game.campaign.rapidResponse} onClick={() => act({ type: 'rapid_response' })}>
              {game.campaign.rapidResponse ? 'On duty' : 'Staff up'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
