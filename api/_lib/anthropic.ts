import Anthropic from '@anthropic-ai/sdk';
import { LLMError } from '../../src/services/llm/types';
import type { ModelFn } from './handlers';

/**
 * The only file that talks to Anthropic. Uses structured outputs
 * (`output_config.format: json_schema`) so the response is decoded against the
 * schema, and puts the long, static system prompt behind a prompt-cache
 * breakpoint so repeat calls are cheaper and faster.
 *
 * Docs: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
 */
export function createAnthropicModel(apiKey: string, model: string): ModelFn {
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 });

  return async ({ system, turns, schema, maxTokens }) => {
    let res: Anthropic.Message;
    try {
      // The cast keeps this compiling against SDK versions whose types predate
      // `output_config`; the field itself is part of the generally available API.
      res = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages: turns,
        output_config: { format: { type: 'json_schema', schema } },
      } as unknown as Anthropic.MessageCreateParamsNonStreaming);
    } catch (e) {
      if (e instanceof Anthropic.APIError) {
        if (e.status === 429) throw new LLMError('rate_limited', 'The language model is busy. Try again in a moment.', 503);
        if (e.status === 401 || e.status === 403) throw new LLMError('not_configured', 'The server’s Anthropic API key was rejected.', 503);
        throw new LLMError('upstream_error', `The language model returned an error (${e.status ?? 'unknown'}).`, 502);
      }
      throw new LLMError('upstream_error', 'The language model could not be reached.', 502);
    }

    if (res.stop_reason === 'max_tokens') {
      throw new LLMError('model_invalid_output', 'The response was cut off before it finished.', 502);
    }
    const text = res.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text;
    if (!text) {
      throw new LLMError('model_invalid_output', 'The model declined or returned no content.', 502);
    }
    return text;
  };
}
