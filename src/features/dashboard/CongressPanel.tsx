import { SplitBar } from '@/components/ui/SplitBar';
import type { GameState } from '@/engine/loop/types';
import { selectCongress } from '@/store/selectors';
import { PARTY_COLOR_VAR, PARTY_NAME } from '@/lib/format';

export function CongressPanel({ game }: { game: GameState }) {
  const { house, senate } = selectCongress(game);
  const me = game.player.party;
  const them = me === 'R' ? 'D' : 'R';
  const yours = `${PARTY_NAME[me]}s`;
  const theirs = `${PARTY_NAME[them]}s`;
  const controlHouse = house.player >= 218;
  const controlSenate = senate.player > 50 || (senate.player === 50 && game.incumbentParty === me);

  return (
    <section aria-labelledby="congress-h" className="space-y-5">
      <h2 id="congress-h" className="font-semibold">Congress</h2>
      <div>
        <div className="mb-2 text-sm text-ink-2">House of Representatives: {controlHouse ? 'your party holds the majority' : 'the opposition holds the majority'}</div>
        <SplitBar
          left={house.player}
          right={house.opposition}
          leftColor={PARTY_COLOR_VAR[me]}
          rightColor={PARTY_COLOR_VAR[them]}
          leftLabel={yours}
          rightLabel={theirs}
          markers={[{ at: 218, label: '218 for a majority' }]}
        />
      </div>
      <div>
        <div className="mb-2 text-sm text-ink-2">Senate: {controlSenate ? 'your party controls it' : 'the opposition controls it'}</div>
        <SplitBar
          left={senate.player}
          right={senate.opposition}
          leftColor={PARTY_COLOR_VAR[me]}
          rightColor={PARTY_COLOR_VAR[them]}
          leftLabel={yours}
          rightLabel={theirs}
          markers={[
            { at: 51, label: '51 for a majority' },
            { at: 60, label: '60 to break a filibuster' },
          ]}
        />
      </div>
    </section>
  );
}
