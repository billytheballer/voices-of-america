import { useState } from 'react';
import type { BillAnalysis } from '@/domain/schemas/billAnalysis.schema';
import type { GameState } from '@/engine/loop/types';
import { asExecutiveOrder, billRejection } from '@/engine/loop/actions';
import { capitalCost } from '@/engine/legislature/politicalCapital';
import { executiveOrderSurvival, forecastPassage } from '@/engine/legislature/passage';
import { Button } from '@/components/ui/Button';
import { selectCongress } from '@/store/selectors';
import { useGameStore } from '@/store/gameStore';
import { pct } from '@/lib/format';
import { REJECTION_TEXT } from './copy';

/** Cost, odds, whip and reconciliation controls, and the send/sign action. */
export function VotePanel({ game, bill: drafted, onSubmitted }: { game: GameState; bill: BillAnalysis; onSubmitted: () => void }) {
  const submit = useGameStore((s) => s.submitBill);
  const [whip, setWhip] = useState(0);
  const [reconciliation, setReconciliation] = useState(false);
  const [byOrder, setByOrder] = useState(false);
  const draftedAsOrder = drafted.instrument === 'executive_order';
  const bill = byOrder ? asExecutiveOrder(drafted) : drafted;

  const isOrder = bill.instrument === 'executive_order';
  const canReconcile = bill.flags.reconciliation_eligible && !isOrder;
  const opts = { whipCapital: isOrder ? 0 : whip, reconciliation: canReconcile && reconciliation };
  const rejection = billRejection(game, bill, opts);
  const { house, senate } = selectCongress(game);
  const forecast = forecastPassage(bill, game.player.party, house, senate, {
    ...opts,
    playerHoldsVP: game.incumbentParty === game.player.party,
  });
  const cost = capitalCost(bill) + opts.whipCapital;

  return (
    <div className="rounded-md border border-ink/20 bg-panel p-5">
      {!draftedAsOrder && (
        <fieldset className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <legend className="sr-only">How to enact it</legend>
          {[
            { v: false, label: 'Send to Congress' },
            { v: true, label: 'Sign as an executive order' },
          ].map((o) => (
            <label key={o.label} className={`cursor-pointer rounded-full border px-3 py-1 ${byOrder === o.v ? 'border-ink bg-white font-semibold' : 'border-rule text-ink-2 hover:border-ink/40'}`}>
              <input type="radio" name="instrument" className="sr-only" checked={byOrder === o.v} onChange={() => setByOrder(o.v)} />
              {o.label}
            </label>
          ))}
          {byOrder && <span className="text-xs text-ink-2">Skips Congress and costs half the capital, but the courts may strike it down.</span>}
        </fieldset>
      )}
      <dl className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <dt className="text-ink-2">Capital cost</dt>
          <dd className="text-2xl font-semibold tabular-nums">
            {cost} <span className="text-sm font-normal text-ink-3">of {Math.round(game.politicalCapital)}</span>
          </dd>
        </div>
        {isOrder ? (
          <div className="col-span-2">
            <dt className="text-ink-2">Survives the courts</dt>
            <dd className="text-2xl font-semibold tabular-nums">{pct(executiveOrderSurvival(bill))}</dd>
          </div>
        ) : (
          <>
            <div>
              <dt className="text-ink-2">Passes the House</dt>
              <dd className="text-2xl font-semibold tabular-nums">{pct(forecast.house)}</dd>
            </div>
            <div>
              <dt className="text-ink-2">Passes the Senate</dt>
              <dd className="text-2xl font-semibold tabular-nums">{pct(forecast.senate)}</dd>
            </div>
          </>
        )}
      </dl>

      {!isOrder && (
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <label className="flex items-center gap-2">
            Whip votes with
            <select value={whip} onChange={(e) => setWhip(Number(e.target.value))} className="rounded border border-ink/25 bg-white px-2 py-1">
              {[0, 10, 20, 30, 40].map((n) => (
                <option key={n} value={n}>
                  {n} extra capital
                </option>
              ))}
            </select>
          </label>
          {canReconcile && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={reconciliation} onChange={(e) => setReconciliation(e.target.checked)} className="accent-[var(--color-brass)]" />
              Use budget reconciliation (51 Senate votes)
            </label>
          )}
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-rule pt-4">
        <Button
          variant="primary"
          disabled={rejection !== null}
          onClick={() => {
            if (submit(bill, opts)) onSubmitted();
          }}
        >
          {isOrder ? 'Sign the order' : 'Send to Congress'}
        </Button>
        {!isOrder && <span className="text-sm text-ink-2">{pct(forecast.overall)} chance it becomes law</span>}
      </div>
      {rejection && <p className="mt-3 text-sm text-ink-2">{REJECTION_TEXT[rejection]}</p>}
    </div>
  );
}
