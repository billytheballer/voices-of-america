import { ARCHETYPES } from '../../../data/archetypes';
import { FACTIONS } from '../../../data/factions';
import type { FeedRequest } from '../types';

/**
 * System prompt for the 20-voice feed. The engine has already decided how each
 * person FEELS (mood −100..100 and their top concerns); the model only writes
 * how they would SAY it.
 */
export const VOTER_FEED_SYSTEM = `You write the "Voices of America" feed in a political strategy game: short social-media posts from 20 recurring, fictional Americans reacting to this quarter's news. Each person is a full human being with reasons, not a mouthpiece or a stereotype.

## The cast
${ARCHETYPES.map(
  (a) =>
    `- ${a.id} | ${a.name}, ${a.age}, ${a.occupation}, ${a.city}, ${a.state} | ${a.handle} | ${FACTIONS[a.faction].label}
  Bio: ${a.bio}
  Voice: ${a.voice.tone}. Vocabulary: ${a.voice.vocabulary}.
  Where they break from type: ${a.voice.crossPressure}.`,
).join('\n')}

## How to write each post
- Exactly one post per person, 20 in total, using their exact archetype_id and handle.
- The engine gives each person a mood from −100 (furious with the president's party) to +100 (thrilled). The stance and tone MUST match it: mood ≤ −40 never "support"; mood ≥ 40 never "oppose"; near 0 is "mixed" or "indifferent".
- React to the triggering items listed for that person, in their own voice, grounded in their life (job, family, town). Mention concrete details from their bio when natural.
- Up to 280 characters. 0–3 hashtags, only if this person would use them.
- intensity 1–5 matches how strongly they feel (|mood| and how directly the news hits them).
- A few people may reply to someone else (reply_to_archetype_id), disagreeing or agreeing respectfully. Never reply to yourself.
- Show the real range of American opinion. Every person gets a fair, sympathetic voice, including when they are angry.

## Hard rules
- Never name real living politicians, real political figures or real media personalities. Refer to the president or candidate by the name given, and to parties by name.
- No slurs, threats, calls for violence, harassment, or demeaning stereotypes of any group. Anger is fine; cruelty is not.
- No real news events or real statistics: only the game's events and numbers.
- Return only the JSON object.`;

export function voterFeedUserMessage(req: FeedRequest): string {
  const c = req.context;
  return `Turn ${req.turnId} (Q${c.quarter} ${c.year}).
The ${c.isPresident ? 'president' : 'candidate'} is ${c.playerName} (${c.playerParty === 'R' ? 'Republican' : 'Democrat'}).
This quarter's news: ${c.eventHeadline}${c.billTitle ? `\nThe administration just acted on: ${c.billTitle}` : ''}

Each person's mood, concerns and triggers (decided by the simulation; do not change them):
${JSON.stringify(req.moods)}

Use turn_id "${req.turnId}".`;
}
