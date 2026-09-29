import { createHash } from "node:crypto";
import { contentIdOf } from "../hash/content-id.js";
import type { StrokeBundle, StrokeGlyph, StrokeSource } from "./types.js";

const MAX_BYTES = 64 * 1024 * 1024;
const MAX_LINE = 1024 * 1024;
const COLLECTIONS: Record<string, string> = {
  "graphicsJa.txt": "ja", "graphicsJaKana.txt": "ja",
  "graphicsKo.txt": "ko", "graphicsZhHans.txt": "zh-Hans", "graphicsZhHant.txt": "zh-Hant",
};
/** @implements SPEC-FM-STROKE-DATA */
export const digest = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");

/** Validate provenance before parsing untrusted input or touching a store. @implements SPEC-FM-STROKE-DATA */
export function validateStrokeSource(source: StrokeSource): void {
  if (source.schema !== "fm.stroke-source.v1" || source.provider !== "animcjk" ||
      !/^[a-f0-9]{40}$/.test(source.revision) || !/^[a-f0-9]{64}$/.test(source.sha256) ||
      source.repository !== "https://github.com/parsimonhi/animCJK" ||
      COLLECTIONS[source.file] !== source.locale || source.collection !== source.file.replace(/\.txt$/, "") ||
      source.license !== "LicenseRef-Arphic-Public-License") throw new Error("Invalid AnimCJK provenance");
  if (!Array.isArray(source.notices) || !Array.isArray(source.transformations) ||
      source.transformations.some(item => typeof item !== "string") ||
      !source.notices.some(n => n.path === "licenses/COPYING.txt") ||
      !source.notices.some(n => n.path === "licenses/APL/english/ARPHICPL.TXT")) {
    throw new Error("Source license and copyright notices are required");
  }
  for (const notice of source.notices) {
    if (!notice.text || digest(Buffer.from(notice.text, "utf8")) !== notice.sha256) {
      throw new Error("Invalid license notice checksum");
    }
  }
}

/** Preserve source order and native coordinates; never infer missing strokes. @implements SPEC-FM-STROKE-DATA */
function glyph(value: unknown, source: string): StrokeGlyph {
  if (!value || typeof value !== "object") throw new Error("Expected graphics record");
  const row = value as Record<string, unknown>;
  if (typeof row.character !== "string" || [...row.character].length !== 1) throw new Error("Expected one Unicode scalar");
  const code = row.character.codePointAt(0)!;
  if (code >= 0xd800 && code <= 0xdfff) throw new Error("Surrogate is not a Unicode scalar");
  if (!Array.isArray(row.strokes) || row.strokes.length === 0 || row.strokes.length > 256 ||
      !Array.isArray(row.medians) || row.medians.length !== row.strokes.length) throw new Error("Stroke/median count mismatch");
  const medians: unknown[] = row.medians;
  const strokes = row.strokes.map((outline: unknown, index: number) => {
    if (typeof outline !== "string" || outline.length > 100000 || !/^\s*[Mm]/.test(outline) ||
        /[^MmLlHhVvCcSsQqTtAaZz0-9eE.,+\s-]/.test(outline)) throw new Error("Invalid SVG path data");
    const median = medians[index];
    if (!Array.isArray(median) || median.length < 2 || median.length > 4096 ||
        median.some(point => !Array.isArray(point) || point.length !== 2 ||
          point.some(n => typeof n !== "number" || !Number.isFinite(n) || Math.abs(n) > 65536))) {
      throw new Error("Invalid median coordinates");
    }
    return { outline, median: median as number[][] };
  });
  return { schema: "fm.stroke-glyph.v1", character: row.character,
    codepoint: "U+" + code.toString(16).toUpperCase().padStart(4, "0"), source,
    coordinateSystem: "makemeahanzi", strokes };
}

/** Import only checksum-verified graphics JSONL. @implements SPEC-FM-STROKE-DATA */
export function parseAnimCjk(data: Uint8Array, source: StrokeSource): StrokeBundle {
  validateStrokeSource(source);
  if (data.byteLength > MAX_BYTES || digest(data) !== source.sha256) throw new Error("Source size or checksum mismatch");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(data);
  const seen = new Set<string>();
  const glyphs: StrokeGlyph[] = [];
  const sourceId = contentIdOf(source);
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    if (line.length > MAX_LINE) throw new Error(`Line ${index + 1} too large`);
    try {
      const record = glyph(JSON.parse(line), sourceId);
      if (seen.has(record.codepoint)) throw new Error("Duplicate character");
      seen.add(record.codepoint); glyphs.push(record);
    } catch (error) { throw new Error(`Graphics line ${index + 1}: ${String(error)}`); }
  }
  if (!glyphs.length) throw new Error("Empty stroke collection");
  glyphs.sort((a, b) => a.codepoint.localeCompare(b.codepoint, "en"));
  return { schema: "fm.stroke-bundle.v1", source, glyphs };
}
