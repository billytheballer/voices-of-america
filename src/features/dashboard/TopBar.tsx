import { useState } from 'react';
import { LEGISLATURE } from '@/data/balance.config';
import { Button } from '@/components/ui/Button';
import { HowToPlay } from './HowToPlay';
import type { GameState } from '@/engine/loop/types';
import { isElectionPhase } from '@/engine/loop/calendar';
import { SAVE_SLOTS, type SaveSlot } from '@/services/persistence/saveGame';
import { selectApproval, selectTurnsUntilElection } from '@/store/selectors';
import { useGameStore } from '@/store/gameStore';
import { PARTY_COLOR_VAR, PARTY_NAME, PHASE_LABEL, pct, quarterLabel } from '@/lib/format';

/** The federal banner: who you are, when it is, and your two levers (capital and the turn). */
export function TopBar({ game }: { game: GameState }) {
  const endTurn = useGameStore((s) => s.endTurn);
  const save = useGameStore((s) => s.save);
  const quit = useGameStore((s) => s.quit);
  const [saved, setSaved] = useState<SaveSlot | null>(null);
  const approval = selectApproval(game);
  const untilElection = selectTurnsUntilElection(game);
  const electionDay = isElectionPhase(game.phase);
  const capitalShare = game.politicalCapital / LEGISLATURE.capitalMax;

  return (
    <header className="bg-ink text-white">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-8 gap-y-3 px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="h-8 w-1.5 rounded-full" style={{ background: PARTY_COLOR_VAR[game.player.party] }} aria-hidden />
          <div>
            <div className="text-lg leading-tight font-semibold">{game.player.name}</div>
            <div className="text-sm text-white/70">
              {game.player.isPresident ? 'President' : 'Candidate'}, {PARTY_NAME[game.player.party]}
            </div>
          </div>
        </div>

        <div>
          <div className="text-lg leading-tight font-semibold tabular-nums">{quarterLabel(game.year, game.quarter)}</div>
          <div className="text-sm text-white/70">
            {PHASE_LABEL[game.phase]}
            {!electionDay && untilElection > 0 && `, ${untilElection} ${untilElection === 1 ? 'quarter' : 'quarters'} to the election`}
          </div>
        </div>

        <div>
          <div className="text-lg leading-tight font-semibold tabular-nums">{pct(approval)}</div>
          <div className="text-sm text-white/70">Approval of your party</div>
        </div>

        <div className="min-w-44">
          <div className="flex items-baseline justify-between">
            <span className="text-lg leading-tight font-semibold tabular-nums">{Math.round(game.politicalCapital)}</span>
            <span className="text-sm text-white/70">Political capital</span>
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-white/15" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(game.politicalCapital)} aria-label="Political capital">
            <div className="h-full rounded-full bg-brass" style={{ width: `${capitalShare * 100}%` }} />
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <label className="sr-only" htmlFor="save-slot">Save to slot</label>
          <select
            id="save-slot"
            defaultValue=""
            onChange={(e) => {
              const slot = e.target.value as SaveSlot;
              if (!slot) return;
              save(slot);
              setSaved(slot);
              e.target.value = '';
            }}
            className="rounded-md border border-white/25 bg-transparent px-2 py-2 text-sm text-white"
          >
            <option value="" className="text-ink">{saved ? `Saved to ${saved.replace('-', ' ')}` : 'Save game'}</option>
            {SAVE_SLOTS.filter((s) => s !== 'autosave').map((s) => (
              <option key={s} value={s} className="text-ink">
                {s.replace('-', ' ')}
              </option>
            ))}
          </select>
          <HowToPlay />
          <Button variant="quiet" className="text-white/70 hover:text-white" onClick={quit}>
            Main menu
          </Button>
          <Button variant="primary" onClick={endTurn} className="px-5">
            {electionDay ? 'Count the votes' : 'End quarter'}
          </Button>
        </div>
      </div>
    </header>
  );
}
