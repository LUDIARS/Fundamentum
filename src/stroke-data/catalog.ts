import type { Foundation } from "../foundation.js";
import type { Catalog } from "../types.js";
import { contentIdOf, isContentId } from "../hash/content-id.js";
import { parseAnimCjk } from "./animcjk.js";
import type { StrokeBundle, StrokeSource } from "./types.js";

/** Source revision is part of the name: language variants cannot overwrite one another. */
export function strokeCatalogName(source: StrokeSource): string {
  return `strokes/${source.provider}/${source.revision}/${source.locale}/${source.collection}`;
}

/** Validate the complete source before writes; publish the catalog only after all objects exist. */
export async function importStrokeData(fm: Foundation, data: Uint8Array, source: StrokeSource): Promise<Catalog> {
  const bundle = parseAnimCjk(data, source);
  const existing = await fm.catalog.latest(strokeCatalogName(source));
  if (existing && existing.entries["@source"] !== contentIdOf(source)) {
    throw new Error("An existing source revision must not be redefined");
  }
  const builder = fm.catalog.builder(strokeCatalogName(source));
  const provenance = await fm.master.put(bundle.source);
  builder.set("@source", provenance.id);
  for (const glyph of bundle.glyphs) {
    const stored = await fm.master.put(glyph);
    builder.set(glyph.codepoint, stored.id);
  }
  return builder.commit();
}

/** Export exact catalog content for offline consumers, retaining all license notices. */
export async function exportStrokeData(fm: Foundation, catalogId: string): Promise<StrokeBundle> {
  if (!isContentId(catalogId)) throw new Error("Invalid catalog content ID");
  const catalog = await fm.catalog.load(catalogId);
  if (!catalog) throw new Error("Stroke catalog not found");
  const sourceId = catalog.entries["@source"];
  if (!sourceId || !isContentId(sourceId)) throw new Error("Missing stroke provenance");
  const source = await fm.master.get(sourceId);
  if (!source || typeof source !== "object" || Array.isArray(source) || source.schema !== "fm.stroke-source.v1" || contentIdOf(source) !== sourceId) {
    throw new Error("Invalid stroke source record");
  }
  const glyphs: StrokeBundle["glyphs"] = [];
  for (const key of Object.keys(catalog.entries).sort()) {
    if (key === "@source") continue;
    if (!isContentId(catalog.entries[key])) throw new Error("Invalid glyph content ID");
    const record = await fm.master.get(catalog.entries[key]);
    if (!record || typeof record !== "object" || Array.isArray(record) ||
        record.schema !== "fm.stroke-glyph.v1" || record.source !== sourceId || record.codepoint !== key ||
        contentIdOf(record) !== catalog.entries[key]) {
      throw new Error(`Missing or invalid glyph: ${key}`);
    }
    glyphs.push(record as StrokeBundle["glyphs"][number]);
  }
  return { schema: "fm.stroke-bundle.v1", source: source as StrokeSource, glyphs };
}
