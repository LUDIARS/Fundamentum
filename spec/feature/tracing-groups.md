# SPEC-FM-TRACING-GROUPS — Learning strokes from AnimCJK SVG groups

Value FM-STROKE-TRACING-001. Supports Lw's approved Fm integration.
Raw graphics JSONL is animation geometry: multiple clipped parts can represent one
handwritten stroke. Off-canvas paths in secondary parts are mask-animation aids.
Keep existing raw catalogs unchanged. A separate tracing catalog preserves explicit
`c<number><suffix>` identifiers, uses the unsuffixed or `a` primary median, and groups
all parts under their original integer stroke number. Never guess or merge by shape.

`src/stroke-data/animcjk-tracing.ts`: `parseAnimCjkTracing` and
`src/stroke-data/tracing-path-points.ts`: `tracingPathPoints` parse only the
pinned data subset, reject ambiguous/missing groups, unsupported paths and nonfinite
or off-canvas primary points. SVG is inert source text, never executed or injected as markup.
Coordinates are original AnimCJK SVG: 1024 square, y down.
`scripts/strokes/import-tracing.mjs` acquires immutable upstream SVGs for a caller-supplied
selection, stores source provenance and original SVG in the Fm immutable store, then
exports `fm.stroke-tracing-bundle.v1` for offline consumers. Full source is retained
for downstream access and modification. No application/server launch is needed.

Rights verified at upstream revision ec5e17cca76c87587790bcbce5ea0b4d4fb753d6:
https://github.com/parsimonhi/animCJK/blob/ec5e17cca76c87587790bcbce5ea0b4d4fb753d6/licenses/COPYING.txt
Kanji SVG: Arphic Public License; kana SVG: LGPL-3.0-or-later. Include unchanged APL,
LGPL, GPLv3, copyright/source notices, original SVG and dated modification notice.
Distribute derived data under applicable original terms, separately from application code.
An import must fail before catalog publication if any required source/license is missing.
This adapter currently supports Japanese selections only; it does not assert global script coverage.

Review cases: あ groups 3a/3b into one third stroke; ゐ groups 1a/1b/1c into one stroke;
reject missing a/duplicate/gapped numbers; reject outside-box primary medians; retain original SVG.
