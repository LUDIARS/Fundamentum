# SPEC-FM-STROKE-DATA — Shared stroke-order catalog

Value: FM-STROKE-DATA-001. Supporting domain: stroke-data-catalog.

## Purpose and ownership

neco approved Fundamentum ownership on 2026-09-29. Fm acquires, preserves and distributes
shared writing data. Pictor renders supplied geometry; Lw and Cocoiru own learning and presentation.
The generic Foundation storage layer remains schema agnostic. The optional `fundamentum/stroke-data`
adapter owns this dataset contract. Personal learning history does not belong here.

## First source and coverage

AnimCJK is pinned by full Git commit in `data-sources/animcjk.lock.json`.
Import `graphicsJa`, `graphicsJaKana`, `graphicsKo`, `graphicsZhHans`, `graphicsZhHant`.
Ko means hanja, NOT Hangul coverage. Neither these collections nor their union mean all Unicode.
Latin letters, digits, Hangul and other scripts remain explicit acquisition backlog.
Do not generate guessed stroke orders and label them verified.

The `graphics*` text files use the Arphic Public License according to upstream COPYING.
Preserve COPYRIGHT/COPYING, APL and accompanying LGPL notices verbatim; do not relabel data
under the code license. Raw files remain in the cache and can be reacquired by immutable URLs.
Exported sources disclose the JSON representation conversion; geometry/order are unchanged.

## Contract and invariants

- Source includes provider, repository, revision, locale, collection, original file hash, license
  text and modification notice. Source is itself content-addressed.
- Glyph includes a Unicode scalar, codepoint key, source content ID and ordered outline/median pairs.
- Coordinates are **Make Me a Hanzi graphics coordinates**, preserved verbatim, not AnimCJK SVG
  coordinates. Consumers must implement this coordinate convention explicitly.
- Outlines are SVG path DATA only, never executable SVG markup. No upstream scripts run.
- Catalog name includes provider/revision/locale/collection. Same codepoint in different languages
  remains separate. No silent language fallback, font-shape substitution or language merging.
- Checksum, strict UTF-8, scalar validity, finite median points, stroke counts, duplicate characters
  and resource bounds are validated before storage. This is not a complete SVG rendering parser.
- Exact reimport is idempotent. Redefining an existing source revision is rejected. Concurrent
  writers for the same catalog must be serialized by the caller (existing CatalogStore contract).
- A catalog becomes visible after all source/glyph objects exist. Failed imports may leave
  unreachable immutable objects; they do not publish a partial collection.
- Offline bundle exports retain source notices once per collection. Consumer lookup uses exact
  catalog ID and codepoint; absence is an explicit missing entry.
- Hub items use content IDs as record IDs and separate source/glyph kinds, preventing editions
  from competing for the same mutable record. Push is explicit via the existing datahub client.
  This change does not start datahub or publish to other PCs.

## Reproducible acquisition and local import

```sh
npm ci --ignore-scripts
npm run build
node scripts/strokes/fetch.mjs data-sources/animcjk.lock.json <cache-directory>
node scripts/strokes/import.mjs data-sources/animcjk.lock.json <cache-directory> <store-directory> <export-directory>
```

Data and exports are deployment artifacts, not committed into the source repository. The import
prints exact collection counts and catalog IDs and writes a summary only after all collections
succeed. Keep exported filenames/version locked in consumers. Raw license files travel with cache;
the exported bundle embeds license texts. Do not distribute only naked glyph files.

## Verification plan

Implementation responsibilities:

- `src/stroke-data/animcjk.ts`: `validateStrokeSource`, `glyph`, `parseAnimCjk`, `digest`
  validate provenance and convert original ordered geometry without inference.
- `src/stroke-data/catalog.ts`: `importStrokeData`, `exportStrokeData`, `strokeCatalogName`
  store and resolve immutable collection snapshots.
- `src/stroke-data/distribution.ts`: `strokeHubItems` constructs bounded content-addressed distribution items.
- `scripts/strokes/source-files.mjs`: `readLock`, `verifiedFile`, `sourceFor`, `checksum`
  enforce the source manifest and retain verified notices.
- `scripts/strokes/fetch.mjs` downloads pinned files; `scripts/strokes/import.mjs` performs
  local ingestion and writes complete export artifacts.

Review tests: checksum failure before write, duplicate/scalar rejection, locale separation,
median/outline mismatch, unchanged reimport, license retention in export, immutable hub IDs.
Actual acquisition/import records collection counts; this is not a visual-rendering test.
Lw reuse and Pictor/Cocoiru animation integration are subsequent consumer changes.

## Acquisition record — 2026-09-29

Upstream revision: `ec5e17cca76c87587790bcbce5ea0b4d4fb753d6`.
All five graphics files passed checksum, UTF-8 and structural validation and were imported
into the local Fm store. Counts: ja kanji 7,007; ja kana 177; ko hanja 535;
zh-Hans 8,014; zh-Hant 1,013. Total 16,746 language/collection entries, **not unique Unicode characters**.
Original files and licenses are under `.fundamentum-data/stroke-sources/`; catalogs under
`.fundamentum-data/strokes/`; offline bundles and hub JSONL under `.fundamentum-data/stroke-exports/`.
These local datasets are intentionally git-ignored. Regenerate them with the pinned lock.
TypeScript build passed. Unit tests are provided for Revisor; this session did not run tests.
No live hub publication, consumer installation or visual animation verification was performed.
