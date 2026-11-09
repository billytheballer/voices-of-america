import { useEffect, useState } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useGameStore } from '@/store/gameStore';
import { NewGameScreen } from '@/features/new-game/NewGameScreen';
import { Dashboard } from '@/features/dashboard/Dashboard';
import { GameOverScreen } from '@/features/dashboard/GameOverScreen';

export default function App() {
  const game = useGameStore((s) => s.game);
  const error = useGameStore((s) => s.error);
  const clearError = useGameStore((s) => s.clearError);
  // Keep the dashboard up after a losing election until the player has seen election night.
  const [acknowledgedLoss, setAcknowledgedLoss] = useState<number | null>(null);
  const showFinal = game?.gameOver && (acknowledgedLoss === game.seed || game.gameOver.reason === 'lost_primary');

  useEffect(() => {
    document.title = game
      ? `Q${game.quarter} ${game.year}, ${game.player.name}: Voices of America`
      : 'Voices of America: a political strategy simulator';
  }, [game]);

  return (
    <ErrorBoundary>
      <a href="#main" className="sr-only z-50 rounded bg-ink px-3 py-2 text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        Skip to the main content
      </a>
      {!game ? (
        <NewGameScreen />
      ) : showFinal ? (
        <GameOverScreen game={game} />
      ) : (
        <Dashboard game={game} onGameOverAcknowledged={() => setAcknowledgedLoss(game.seed)} />
      )}
      {error && (
        <div role="alert" className="fixed right-6 bottom-6 z-50 flex max-w-sm items-start gap-3 rounded-md bg-ink px-4 py-3 text-sm text-white">
          <span>{error}</span>
          <button type="button" onClick={clearError} className="text-white/70 hover:text-white" aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}
    </ErrorBoundary>
  );
}
