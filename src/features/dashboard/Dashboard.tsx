import { useEffect, useRef, useState } from 'react';
import type { ElectionRecord, GameState } from '@/engine/loop/types';
import { TopBar } from './TopBar';
import { MetricsStrip } from './MetricsStrip';
import { CongressPanel } from './CongressPanel';
import { CoalitionPanel } from './CoalitionPanel';
import { ForecastPanel } from './ForecastPanel';
import { CrisisBrief } from '@/features/event-ticker/CrisisBrief';
import { BillDrafting } from '@/features/bill-drafting/BillDrafting';
import { ElectionNight } from '@/features/election-night/ElectionNight';
import { MapPanel } from '@/features/map/MapPanel';
import { FeedPanel } from '@/features/voter-feed/FeedPanel';
import { CampaignPanel } from '@/features/campaign/CampaignPanel';
import { GovernmentPanel } from '@/features/government/GovernmentPanel';
import { useForecast } from '@/hooks/useForecast';

/**
 *  ┌──────────────────────── federal banner (TopBar) ─────────────────────────┐
 *  │ crisis brief (hero)                              │ forecast              │
 *  ├────────────────────── five metrics ─────────────────────────────────────┤
 *  │ campaign HQ (campaign quarters only)             │ Voices of America     │
 *  │ map                                              │                       │
 *  │ executive branch                                 │                       │
 *  │ bill drafting                                    │ (sticky, scrolls)     │
 *  │ factions │ Congress                              │                       │
 *  └──────────────────────────────────────────────────┴──────────────────────┘
 */
export function Dashboard({ game, onGameOverAcknowledged }: { game: GameState; onGameOverAcknowledged: () => void }) {
  const forecast = useForecast(game);
  const [result, setResult] = useState<ElectionRecord | null>(null);
  const seen = useRef(game.elections.length);
  useEffect(() => {
    if (game.elections.length > seen.current) setResult(game.elections.at(-1)!);
    seen.current = game.elections.length;
  }, [game.elections]);

  return (
    <div className="min-h-screen">
      <TopBar game={game} />
      <main id="main" className="mx-auto max-w-[1440px] px-6 pb-16">
        <h1 className="sr-only">
          Voices of America: {game.player.name}, Q{game.quarter} {game.year}
        </h1>
        <div className="grid gap-x-10 pt-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <CrisisBrief game={game} />
          <aside aria-label="Election forecast" className="border-b border-rule pb-6 max-lg:pt-6 lg:border-l lg:pl-8">
            <ForecastPanel game={game} forecast={forecast} />
          </aside>
        </div>

        <div className="mt-6">
          <MetricsStrip game={game} />
        </div>

        <div className="mt-8 grid gap-x-10 gap-y-12 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 space-y-12">
            <CampaignPanel game={game} />
            <MapPanel game={game} forecast={forecast} />
            <GovernmentPanel game={game} />
            <BillDrafting game={game} />
            <div className="grid gap-10 border-t border-rule pt-8 md:grid-cols-2">
              <CoalitionPanel game={game} />
              <CongressPanel game={game} />
            </div>
          </div>
          <aside aria-label="Voices of America feed" className="lg:border-l lg:border-rule lg:pl-8">
            <div className="lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto lg:pr-2">
              <FeedPanel game={game} />
            </div>
          </aside>
        </div>
      </main>
      {result && (
        <ElectionNight
          record={result}
          game={game}
          onClose={() => {
            setResult(null);
            if (game.gameOver) onGameOverAcknowledged();
          }}
        />
      )}
    </div>
  );
}
