# ADR 003: Structured outputs plus Zod, with one repair attempt

**Status:** Accepted (Stage 10)

## Decision
Call Claude with structured outputs (`output_config.format: json_schema`) using a schema generated from the same Zod contracts the engine validates against. Validate every response with Zod; on failure, send the exact issues back once; on a second failure return a typed 502. Never guess.

## Alternatives considered
- **Prompt-only JSON:** occasional malformed output; needs retries for syntax alone.
- **Forced tool call (`tool_choice`):** works, but structured outputs are now the documented, generally available path for "respond in this shape."
- **Structured outputs alone:** guarantees shape but not our ranges, exact counts or cross-field rules, which the API does not accept as schema keywords.

## Consequences
One source of truth (Zod) feeds the prompt contract, the API schema, server validation and client validation. The converter (`claudeSchema.ts`) is unit-tested to emit no rejected keywords and to stay under the API's union limit.
