import { useState } from 'react';
import { DEPARTMENT_IDS } from '@/domain/constants';
import type { DepartmentId, FactionId } from '@/domain/types';
import type { BillAnalysis } from '@/domain/schemas/billAnalysis.schema';
import { DEPARTMENTS, LEVEL_LABEL, type DirectiveSpec } from '@/data/departments';
import { FACTIONS } from '@/data/factions';
import { GAME_LOOP } from '@/data/balance.config';
import {
  currentWork,
  departmentAnalysis,
  departmentBudget,
  departmentRejection,
  findDirective,
  type DepartmentAction,
  type DepartmentRejection,
} from '@/engine/government/departments';
import { slotsLeft } from '@/engine/loop/actions';
import { capitalCost } from '@/engine/legislature/politicalCapital';
import { executiveOrderSurvival, forecastPassage } from '@/engine/legislature/passage';
import type { GameState, SubmitBillResult } from '@/engine/loop/types';
import { Button } from '@/components/ui/Button';
import { selectCongress } from '@/store/selectors';
import { useGameStore } from '@/store/gameStore';
import { pct } from '@/lib/format';
import { OUTCOME_TEXT, REJECTION_TEXT } from '@/features/bill-drafting/copy';

const DEPT_REFUSAL: Record<Exclude<DepartmentRejection, keyof typeof REJECTION_TEXT>, string> = {
  abolished: 'This department has been eliminated. Ask Congress to re-establish it first.',
  not_abolished: 'The department still exists.',
  not_abolishable: 'This is a core constitutional function. You can cut it, but not eliminate it.',
  at_max_level: 'The budget is already at its maximum expansion.',
  at_min_level: 'The budget is already at its deepest cut.',
  unknown_directive: 'Unknown order.',
  directive_active: 'This order is already in force.',
  no_directive: 'No order is in force here.',
};

const refusalText = (why: DepartmentRejection) => (why in REJECTION_TEXT ? REJECTION_TEXT[why as keyof typeof REJECTION_TEXT] : DEPT_REFUSAL[why as keyof typeof DEPT_REFUSAL]);

/**
 * The executive branch. Each department shows what it is working on; a
 * president can redirect it by executive order, ask Congress to grow or cut
 * its budget, or try to eliminate it.
 */
export function GovernmentPanel({ game }: { game: GameState }) {
  const [selected, setSelected] = useState<DepartmentId>('dhs');
  const president = game.player.isPresident;
  const slots = slotsLeft(game);

  return (
    <section aria-labelledby="gov-h">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 id="gov-h" className="font-semibold">The executive branch</h2>
          <p className="mt-1 text-sm text-ink-2">
            {president
              ? 'Redirect a department by executive order, or ask Congress to grow, cut or eliminate it.'
              : 'What the federal government is doing today. You take charge of it if you win.'}
          </p>
        </div>
        {president && (
          <dl className="flex gap-5 text-sm" aria-label="Actions left this quarter">
            <Slot label="Bills" left={slots.bill} max={GAME_LOOP.maxBillsPerTurn} />
            <Slot label="Executive orders" left={slots.order} max={GAME_LOOP.maxOrdersPerTurn} />
            <Slot label="Budget requests" left={slots.budget} max={GAME_LOOP.maxBudgetRequestsPerTurn} />
          </dl>
        )}
      </div>

      <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        {DEPARTMENT_IDS.map((id) => {
          const spec = DEPARTMENTS[id];
          const st = game.departments[id];
          const on = id === selected;
          return (
            <li key={id}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => setSelected(id)}
                className={`h-full w-full rounded-md border p-2.5 text-left text-sm transition-colors ${on ? 'border-ink bg-white' : 'border-rule bg-panel hover:border-ink/40'} ${st.abolished ? 'opacity-70' : ''}`}
              >
                <span className="block font-semibold leading-tight">{spec.short}</span>
                <span className="mt-1 block text-xs tabular-nums text-ink-2">
                  {st.abolished ? 'Eliminated' : `$${Math.round(departmentBudget(spec, st))}B · ${LEVEL_LABEL[st.level]}`}
                </span>
                {st.directive && <span className="mt-1 block truncate text-xs text-brass-dark">Order in force</span>}
              </button>
            </li>
          );
        })}
      </ul>

      <DepartmentDetail key={selected} game={game} dept={selected} />
    </section>
  );
}

function Slot({ label, left, max }: { label: string; left: number; max: number }) {
  return (
    <div>
      <dt className="text-ink-2">{label}</dt>
      <dd className="mt-1 flex gap-1" aria-label={`${left} of ${max} left`}>
        {Array.from({ length: max }, (_, i) => (
          <span key={i} className={`h-3 w-3 rounded-sm ${i < left ? 'bg-brass' : 'border border-ink/25'}`} />
        ))}
      </dd>
    </div>
  );
}

/** The factions that like and dislike something most. */
function reactionSummary(bill: BillAnalysis) {
  const rows = (Object.keys(bill.faction_modifiers) as FactionId[]).map((f) => ({ f, d: bill.faction_modifiers[f].delta }));
  const pos = rows.filter((r) => r.d > 0).sort((a, b) => b.d - a.d).slice(0, 2);
  const neg = rows.filter((r) => r.d < 0).sort((a, b) => a.d - b.d).slice(0, 2);
  return { pos, neg };
}

function Reactions({ bill }: { bill: BillAnalysis }) {
  const { pos, neg } = reactionSummary(bill);
  return (
    <p className="mt-1 text-xs text-ink-2">
      {pos.length > 0 && <>Pleases {pos.map((r) => FACTIONS[r.f].label).join(' and ')}. </>}
      {neg.length > 0 && <>Angers {neg.map((r) => FACTIONS[r.f].label).join(' and ')}.</>}
    </p>
  );
}

function DepartmentDetail({ game, dept }: { game: GameState; dept: DepartmentId }) {
  const run = useGameStore((s) => s.department);
  const [result, setResult] = useState<{ title: string; r: SubmitBillResult } | null>(null);
  const [reconcile, setReconcile] = useState(true);
  const spec = DEPARTMENTS[dept];
  const st = game.departments[dept];
  const president = game.player.isPresident;
  const directive = findDirective(dept, st.directive);

  const go = (a: DepartmentAction, title: string) => {
    const r = run(a, { reconciliation: reconcile });
    if (r) setResult({ title, r });
  };

  return (
    <article className="mt-4 rounded-lg border border-ink/20 bg-panel p-5" aria-labelledby="dept-h">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h3 id="dept-h" className="font-serif text-xl font-bold">{spec.name}</h3>
          <p className="mt-1 text-sm text-ink-2">{spec.mission}</p>
        </div>
        <div className="text-right text-sm">
          <div className="text-2xl font-semibold tabular-nums">{st.abolished ? '$0' : `$${Math.round(departmentBudget(spec, st))}B`}</div>
          <div className="text-ink-2">a year · baseline ${spec.budget}B</div>
        </div>
      </div>

      {!st.abolished && <LevelBar level={st.level} />}

      {result && (
        <p role="status" className="mt-4 rounded-md bg-brass-tint px-3 py-2 text-sm">
          <span className="font-semibold">{OUTCOME_TEXT[result.r.outcome.status]}:</span> {result.title}.
          {'house' in result.r.outcome && ` House ${result.r.outcome.house.yes} to ${result.r.outcome.house.no}`}
          {'senate' in result.r.outcome && `; Senate ${result.r.outcome.senate.yes} to ${result.r.outcome.senate.no}.`} Spent {result.r.capitalSpent} capital.
        </p>
      )}

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div>
          <h4 className="text-sm font-semibold">Working on now</h4>
          <ul className="mt-2 space-y-1.5 text-sm">
            {currentWork(game, dept).map((w) => (
              <li key={w} className={`border-l-2 pl-2.5 ${w.startsWith('Priority') ? 'border-brass' : 'border-rule'}`}>
                {w}
              </li>
            ))}
          </ul>
          {directive && president && (
            <ActionRow game={game} action={{ type: 'rescind', dept }} label="Rescind the order" onGo={(a) => go(a, `Rescinded “${directive.title}”`)} compact />
          )}
        </div>

        <div className="space-y-5">
          {!st.abolished && (
            <div>
              <h4 className="text-sm font-semibold">Executive orders</h4>
              <p className="text-xs text-ink-3">Take effect immediately, unless the courts strike them down. One order in force per department.</p>
              <ul className="mt-2 space-y-2">
                {spec.directives.map((d) => (
                  <DirectiveRow key={d.id} game={game} dept={dept} d={d} active={st.directive === d.id} onGo={(a) => go(a, d.title)} />
                ))}
              </ul>
            </div>
          )}

          <div>
            <h4 className="text-sm font-semibold">Ask Congress</h4>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {st.abolished ? (
                <ActionRow game={game} action={{ type: 'restore', dept }} label="Re-establish the department" onGo={(a) => go(a, `Re-establish the ${spec.short}`)} />
              ) : (
                <>
                  <ActionRow game={game} action={{ type: 'expand', dept }} label="Expand the budget 15%" reconcile={reconcile} onGo={(a) => go(a, `Expand the ${spec.short} budget`)} />
                  <ActionRow game={game} action={{ type: 'cut', dept }} label="Cut the budget 15%" reconcile={reconcile} onGo={(a) => go(a, `Cut the ${spec.short} budget`)} />
                  {spec.abolishable && (
                    <ActionRow game={game} action={{ type: 'abolish', dept }} label="Eliminate the department" onGo={(a) => go(a, `Eliminate the ${spec.short}`)} />
                  )}
                </>
              )}
            </div>
            {!st.abolished && president && (
              <label className="mt-2 flex items-center gap-2 text-xs text-ink-2">
                <input type="checkbox" checked={reconcile} onChange={(e) => setReconcile(e.target.checked)} className="accent-[var(--color-brass)]" />
                Pass budget changes through reconciliation (51 Senate votes instead of 60)
              </label>
            )}
            {!spec.abolishable && <p className="mt-2 text-xs text-ink-3">{DEPT_REFUSAL.not_abolishable}</p>}
          </div>
        </div>
      </div>
    </article>
  );
}

function LevelBar({ level }: { level: number }) {
  return (
    <div className="mt-4" aria-label={`Budget level: ${LEVEL_LABEL[level]}`}>
      <div className="flex gap-1" aria-hidden>
        {[-2, -1, 0, 1, 2].map((l) => (
          <span key={l} className={`h-2 flex-1 rounded-sm ${l === level ? 'bg-ink' : l === 0 ? 'bg-ink-3/40' : 'bg-rule'}`} />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-ink-3">
        <span>Deep cuts</span>
        <span>{LEVEL_LABEL[level]}</span>
        <span>Major expansion</span>
      </div>
    </div>
  );
}

function DirectiveRow({ game, dept, d, active, onGo }: { game: GameState; dept: DepartmentId; d: DirectiveSpec; active: boolean; onGo: (a: DepartmentAction) => void }) {
  const action: DepartmentAction = { type: 'directive', dept, directive: d.id };
  const bill = departmentAnalysis(game, action);
  const why = departmentRejection(game, action);
  return (
    <li className={`rounded-md border p-3 ${active ? 'border-brass bg-brass-tint/50' : 'border-rule'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-medium leading-snug">{d.title}</div>
          <p className="mt-0.5 text-xs text-ink-2">{d.summary}</p>
          <Reactions bill={bill} />
        </div>
        <div className="text-right text-xs text-ink-2">
          <div>
            <span className="font-semibold text-ink tabular-nums">{capitalCost(bill)}</span> capital
          </div>
          <div>{pct(executiveOrderSurvival(bill))} survives court</div>
        </div>
      </div>
      {game.player.isPresident && (
        <div className="mt-2 flex items-center gap-3">
          <Button variant={active ? 'secondary' : 'primary'} disabled={why !== null} onClick={() => onGo(action)} className="px-3 py-1.5">
            {active ? 'In force' : 'Sign the order'}
          </Button>
          {why && why !== 'directive_active' && <span className="text-xs text-ink-2">{refusalText(why)}</span>}
        </div>
      )}
    </li>
  );
}

function ActionRow({
  game,
  action,
  label,
  reconcile = false,
  compact = false,
  onGo,
}: {
  game: GameState;
  action: DepartmentAction;
  label: string;
  reconcile?: boolean;
  compact?: boolean;
  onGo: (a: DepartmentAction) => void;
}) {
  const bill = departmentAnalysis(game, action);
  const why = departmentRejection(game, action, { reconciliation: reconcile });
  const isOrder = bill.instrument === 'executive_order';
  const { house, senate } = selectCongress(game);
  const odds = isOrder
    ? executiveOrderSurvival(bill)
    : forecastPassage(bill, game.player.party, house, senate, {
        reconciliation: reconcile && bill.flags.reconciliation_eligible,
        playerHoldsVP: game.incumbentParty === game.player.party,
      }).overall;

  if (!game.player.isPresident) {
    return compact ? null : (
      <div className="rounded-md border border-rule p-3 text-sm">
        <div className="font-medium">{label}</div>
        <Reactions bill={bill} />
      </div>
    );
  }
  return (
    <div className={`rounded-md border border-rule p-3 text-sm ${compact ? 'mt-3' : ''}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium">{label}</span>
        <span className="text-xs whitespace-nowrap text-ink-2 tabular-nums">
          {capitalCost(bill)} capital · {pct(odds)} {isOrder ? 'holds up' : 'passes'}
        </span>
      </div>
      {!compact && <Reactions bill={bill} />}
      <Button className="mt-2 w-full px-3 py-1.5" disabled={why !== null} onClick={() => onGo(action)}>
        {action.type === 'rescind' ? 'Rescind' : isOrder ? 'Sign' : 'Send to Congress'}
      </Button>
      {why && <p className="mt-1.5 text-xs text-ink-2">{refusalText(why)}</p>}
    </div>
  );
}
