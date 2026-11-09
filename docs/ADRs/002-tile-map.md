# ADR 002: Equal-area tile map instead of a geographic choropleth

**Status:** Accepted (Stage 9). Supersedes the Stage 1 plan to use `react-simple-maps` + `us-atlas`.

## Context
The dashboard needs a clickable U.S. map for the forecast, election results, and per-faction satisfaction.

## Decision
Render a 12 × 8 grid of equal tiles (`src/data/tileGrid.ts`), one per state plus DC, in the newsroom tile-map layout. Each tile shows its electoral votes.

## Why
- **Honest area.** On a geographic map, Montana outweighs New Jersey visually and rural states dominate the picture. Equal tiles give every state the same visual weight, and the EV count is printed on each tile.
- **Usable.** RI, DE and DC are as easy to click as Texas. Tiles are keyboard-navigable with arrow keys.
- **Lean.** No ~100 KB TopoJSON download and no projection library; the map is ~150 lines of SVG.

## Color
Diverging scales, each arm one hue light → dark, validated with the dataviz palette checker (monotone lightness, visible step gaps, light end ≥ 2:1 against the page). The forecast uses a gray toss-up midpoint. The results scale deliberately has **no** midpoint, because every state has a winner once votes are counted. Every lens has a legend and a "Show as a table" view.

## Consequences
`TileMap` takes a `fills` record and is agnostic to what it shows, so a geographic renderer could replace it without touching the lenses, drawer or election night.
