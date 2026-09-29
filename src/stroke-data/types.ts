import type { JsonValue } from "../types.js";

/** SPEC-FM-STROKE-DATA: portable data contracts, independent of any renderer. */
export interface StrokeSource extends Record<string, JsonValue> {
  schema: "fm.stroke-source.v1";
  provider: string;
  revision: string;
  repository: string;
  locale: string;
  collection: string;
  file: string;
  sha256: string;
  license: string;
  notices: { path: string; text: string; sha256: string }[];
  transformations: string[];
}

export interface StrokeGlyph extends Record<string, JsonValue> {
  schema: "fm.stroke-glyph.v1";
  character: string;
  codepoint: string;
  source: string;
  coordinateSystem: "makemeahanzi";
  strokes: { outline: string; median: number[][] }[];
}

export interface StrokeBundle extends Record<string, JsonValue> {
  schema: "fm.stroke-bundle.v1";
  source: StrokeSource;
  glyphs: StrokeGlyph[];
}
