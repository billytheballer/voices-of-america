import { useEffect, useId, useState } from 'react';
import { METRIC_IDS, POLICY_AXES } from '@/domain/constants';
import { BILL_FLAGS } from '@/domain/schemas/billAnalysis.schema';
import type { GameState } from '@/engine/loop/types';
import { Button } from '@/components/ui/Button';
import { useBillAnalysis } from '@/hooks/useBillAnalysis';
import { getLLMProvider, MAX_BILL_CHARS } from '@/services/llm';
import { selectBillImpactPreview } from '@/store/selectors';
import { useGameStore } from '@/store/gameStore';
import { PARTY_COLOR_VAR, pct, signed } from '@/lib/format';
import { EXAMPLE_DRAFTS, FLAG_TEXT, OUTCOME_TEXT, analysisErrorText, impactSentence } from './copy';
import { FactionReactions } from './FactionReactions';
import { PolicyPlacement } from './PolicyPlacement';
import { VotePanel } from './VotePanel';

const DRAFT_KEY = 'voa:draft';
const loadDraft = () => {
  try {
    return localStorage.getItem(DRAFT_KEY) ?? '';
  } catch {
    return '';
  }
};

/**
 * Write → analyze → review → send. The analysis is the LLM's interpretation;
 * everything after it (projected impact, odds, the vote) is the engine.
 */
export function BillDrafting({ game }: { game: GameState }) {
  const [text, setText] = useState(loadDraft);
  const { state, analyze, cancel, reset } = useBillAnalysis(game);
  const lastBill = useGameStore((s) => s.lastBill);
  const inputId = useId();
  const counterId = useId();

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, text);
    } catch {
      /* drafts are a convenience; ignore storage errors */
    }
  }, [text]);

  const trimmed = text.trim();
  const tooLong = text.length > MAX_BILL_CHARS;
  const stale = state.status === 'ready' && state.text !== trimmed;
  const offline = getLLMProvider().name === 'mock';
  const opp = game.player.party === 'R' ? 'D' : 'R';

  return (
    <section aria-labelledby="draft-h">
      <h2 id="draft-h" className="font-semibold">Draft legislation</h2>
      <p className="mt-1 text-sm text-ink-2">
        Describe a bill or executive order in plain English. The analyst scores it, the factions react, and you decide whether to spend
        the capital.
      </p>

      <form
        className="mt-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (trimmed && !tooLong) void analyze(trimmed);
        }}
      >
        <label htmlFor={inputId} className="sr-only">Bill text</label>
        <textarea
          id={inputId}
          aria-describedby={counterId}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          placeholder="For example: Expand the child tax credit to $3,000 per child, phasing out above $150,000 in household income."
          className="w-full resize-y rounded-md border border-ink/25 bg-white px-3 py-2.5 text-base leading-relaxed outline-none focus:border-brass"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-ink-2">Start from:</span>
            {EXAMPLE_DRAFTS.map((ex) => (
              <button
                key={ex.label}
                type="button"
                onClick={() => setText(ex.text)}
                className="rounded-full border border-rule px-2.5 py-0.5 text-ink-2 hover:border-ink/40 hover:text-ink"
              >
                {ex.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <span id={counterId} className={`text-xs tabular-nums ${tooLong ? 'font-semibold text-ink' : 'text-ink-3'}`}>
              {text.length.toLocaleString('en-US')} / {MAX_BILL_CHARS.toLocaleString('en-US')}
            </span>
            {state.status === 'analyzing' ? (
              <Button onClick={cancel}>Cancel</Button>
            ) : (
              <Button type="submit" disabled={!trimmed || tooLong}>
                {state.status === 'ready' ? 'Analyze again' : 'Analyze the bill'}
              </Button>
            )}
          </div>
        </div>
        {tooLong && <p className="mt-1 text-sm">Shorten the draft to {MAX_BILL_CHARS.toLocaleString('en-US')} characters to analyze it.</p>}
        {offline && <p className="mt-2 text-xs text-ink-3">Offline analyst: a quick keyword reading. Connect the Claude analyst for nuanced scoring.</p>}
      </form>

      <div aria-live="polite">
        {state.status === 'analyzing' && <p className="mt-6 text-sm text-ink-2">Reading the bill and polling the factions…</p>}
        {state.status === 'error' && (
          <div role="alert" className="mt-6 rounded-md border border-ink/30 bg-panel p-4 text-sm">
            {analysisErrorText(state.error)}
          </div>
        )}
      </div>

      {lastBill && state.status !== 'ready' && (
        <div role="status" className="mt-6 rounded-md bg-panel p-4 text-sm ring-1 ring-rule">
          <div className="font-semibold">{OUTCOME_TEXT[lastBill.outcome.status]}</div>
          {'house' in lastBill.outcome && (
            <div className="mt-1 text-ink-2 tabular-nums">
              House {lastBill.outcome.house.yes} to {lastBill.outcome.house.no}
              {'senate' in lastBill.outcome && `; Senate ${lastBill.outcome.senate.yes} to ${lastBill.outcome.senate.no}`}
            </div>
          )}
          <div className="mt-1 text-ink-3">Spent {lastBill.capitalSpent} political capital.</div>
        </div>
      )}

      {state.status === 'ready' && (
        <AnalysisView
          game={game}
          analysis={state.analysis}
          stale={stale}
          oppColor={PARTY_COLOR_VAR[opp]}
          onSubmitted={() => {
            setText('');
            reset();
          }}
        />
      )}
    </section>
  );
}

function AnalysisView({
  game,
  analysis,
  stale,
  oppColor,
  onSubmitted,
}: {
  game: GameState;
  analysis: Parameters<typeof selectBillImpactPreview>[1];
  stale: boolean;
  oppColor: string;
  onSubmitted: () => void;
}) {
  const preview = selectBillImpactPreview(game, analysis);
  const impacts = METRIC_IDS.map((m) => impactSentence(m, analysis.metric_impacts[m].direction, analysis.metric_impacts[m].magnitude)).filter(
    (x): x is string => x !== null,
  );
  const flags = BILL_FLAGS.filter((f) => analysis.flags[f]);
  const touches = POLICY_AXES.some((a) => analysis.policy_vector[a] !== null);

  return (
    <article className="mt-6 border-t border-rule pt-6" aria-labelledby="analysis-h">
      {stale && <p className="mb-4 rounded bg-brass-tint px-3 py-2 text-sm text-brass-dark">You have edited the draft since this analysis. Analyze again to update it.</p>}
      <p className="text-sm text-ink-2">
        {analysis.instrument === 'executive_order' ? 'Executive order' : 'Legislation'}, {analysis.policy_areas.join(', ')}
      </p>
      <h3 id="analysis-h" className="mt-1 font-serif text-2xl leading-snug font-bold">{analysis.title}</h3>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-2">{analysis.summary}</p>

      <div className="mt-6 grid gap-8 xl:grid-cols-2">
        <div className="space-y-6">
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-sm text-ink-2">Radicalism</dt>
              <dd className="text-2xl font-semibold tabular-nums">{analysis.radical_score}<span className="text-sm font-normal text-ink-3">/10</span></dd>
              <dd className="mt-1 text-xs leading-snug text-ink-2">{analysis.score_rationale.radical}</dd>
            </div>
            <div>
              <dt className="text-sm text-ink-2">How concrete</dt>
              <dd className="text-2xl font-semibold tabular-nums">{analysis.programmatic_score}<span className="text-sm font-normal text-ink-3">/10</span></dd>
              <dd className="mt-1 text-xs leading-snug text-ink-2">{analysis.score_rationale.programmatic}</dd>
            </div>
          </dl>

          <div>
            <h4 className="font-semibold">If it became law today</h4>
            <dl className="mt-2 grid grid-cols-2 gap-4">
              <div>
                <dt className="text-sm text-ink-2">National vote margin</dt>
                <dd className="text-xl font-semibold tabular-nums">{signed(preview.marginDelta)} pts</dd>
              </div>
              <div>
                <dt className="text-sm text-ink-2">Approval</dt>
                <dd className="text-xl font-semibold tabular-nums">{signed(preview.approvalDelta * 100)} pts</dd>
              </div>
            </dl>
            <p className="mt-1 text-xs text-ink-3">Immediate effect only, before the opposition responds and before the economy moves.</p>
          </div>

          {(impacts.length > 0 || flags.length > 0) && (
            <div>
              <h4 className="font-semibold">What else to expect</h4>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-2">
                {impacts.map((s) => (
                  <li key={s}>{s}</li>
                ))}
                {flags.map((f) => (
                  <li key={f}>{FLAG_TEXT[f]}</li>
                ))}
              </ul>
            </div>
          )}

          {touches && (
            <div>
              <h4 className="font-semibold">Where it sits</h4>
              <div className="mt-2">
                <PolicyPlacement
                  bill={analysis.policy_vector}
                  player={game.playerPlatform}
                  opposition={game.oppositionPlatform}
                  playerColor={PARTY_COLOR_VAR[game.player.party]}
                  oppositionColor={oppColor}
                />
              </div>
              <p className="mt-2 text-xs text-ink-3">Passing it pulls your platform toward the bill, and the opposition repositions in response.</p>
            </div>
          )}

          <VotePanel game={game} bill={analysis} onSubmitted={onSubmitted} />
        </div>

        <div>
          <h4 className="font-semibold">How the factions react</h4>
          <p className="mt-1 text-xs text-ink-2">
            Bars show the analyst’s score (−10 to +10). The number is the projected change in national satisfaction, including faction rules.
            Analyst confidence: {pct(analysis.confidence)}.
          </p>
          <div className="mt-3">
            <FactionReactions analysis={analysis} projected={preview.factionDeltas} />
          </div>
        </div>
      </div>
    </article>
  );
}
