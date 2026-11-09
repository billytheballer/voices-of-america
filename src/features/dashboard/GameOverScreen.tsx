import { Button } from '@/components/ui/Button';
import type { GameState } from '@/engine/loop/types';
import { useGameStore } from '@/store/gameStore';
import { PARTY_ADJ, signed } from '@/lib/format';

export function GameOverScreen({ game }: { game: GameState }) {
  const quit = useGameStore((s) => s.quit);
  const terms = game.elections.filter((e) => e.kind === 'presidential' && e.won).length;
  const years = game.year - 2029;
  const lastEV = game.elections.at(-1)?.playerEV ?? 0;
  const lostPrimary = game.gameOver?.reason === 'lost_primary';

  return (
    <main id="main" className="mx-auto max-w-3xl px-6 py-20">
      <p className="text-ink-2">
        {game.gameOver?.year} {lostPrimary ? `${PARTY_ADJ[game.player.party]} primary` : 'presidential election'}
      </p>
      <h1 className="mt-2 font-serif text-5xl leading-tight font-black">
        {lostPrimary
          ? `${game.player.name} loses the nomination`
          : terms === 0
            ? `${game.player.name} never made it to the White House`
            : `The ${PARTY_ADJ[game.player.party]} era ends after ${terms} ${terms === 1 ? 'term' : 'terms'}`}
      </h1>
      <p className="mt-5 text-lg text-ink-2">
        {lostPrimary
          ? `The party's own voters turned away: ${Math.round((game.campaign.primary?.share ?? 0) * 100)}% of the primary vote.${terms > 0 ? ` The ${PARTY_ADJ[game.player.party]} era ends after ${terms} ${terms === 1 ? 'term' : 'terms'}.` : ''}`
          : terms === 0
            ? `The ${game.gameOver?.year} race ended with ${lastEV} electoral votes, ${270 - lastEV} short of a majority.`
            : `${years} years in power${game.player.generation > 0 ? `, carried by ${game.player.generation + 1} candidates` : ''}.`}
      </p>

      <table className="mt-10 w-full border-collapse text-left">
        <caption className="sr-only">Election history</caption>
        <thead>
          <tr className="border-b border-ink text-sm text-ink-2">
            <th className="py-2 font-medium">Year</th>
            <th className="py-2 font-medium">Race</th>
            <th className="py-2 font-medium">Candidate</th>
            <th className="py-2 text-right font-medium">Popular vote</th>
            <th className="py-2 text-right font-medium">House</th>
            <th className="py-2 text-right font-medium">Senate</th>
          </tr>
        </thead>
        <tbody>
          {game.elections.map((e) => (
            <tr key={`${e.year}-${e.kind}`} className="border-b border-rule tabular-nums">
              <td className="py-2">{e.year}</td>
              <td className="py-2">{e.kind === 'presidential' ? (e.won ? `Won, ${e.playerEV} EV` : `Lost, ${e.playerEV} EV`) : 'Midterm'}</td>
              <td className="py-2">{e.candidate}</td>
              <td className="py-2 text-right">{signed(e.popularMargin)}</td>
              <td className="py-2 text-right">{e.houseSeats}</td>
              <td className="py-2 text-right">{e.senateSeats}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Button variant="primary" className="mt-10" onClick={quit}>
        Start a new campaign
      </Button>
    </main>
  );
}
