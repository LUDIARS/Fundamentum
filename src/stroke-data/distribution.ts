import { contentIdOf } from "../hash/content-id.js";
import type { JsonValue } from "../types.js";
import type { StrokeBundle } from "./types.js";

export interface StrokeHubItem {
  kind: string;
  id: string;
  baseRev: 0;
  payload: { format: "json"; data: JsonValue };
}

/** Immutable IDs keep editions out of the hub's conflict resolver. @implements SPEC-FM-STROKE-DATA */
export function strokeHubItems(bundle: StrokeBundle): StrokeHubItem[] {
  const item = (kind: string, data: JsonValue): StrokeHubItem => {
    if (Buffer.byteLength(JSON.stringify({format:"json",data}), "utf8") > 5 * 1024 * 1024) {
      throw new Error("Stroke record exceeds datahub item limit");
    }
    return {kind, id: contentIdOf(data), baseRev: 0, payload: { format: "json", data }};
  };
  return [item("fundamentum.stroke.source", bundle.source),
    ...bundle.glyphs.map(glyph => item("fundamentum.stroke.glyph", glyph))];
}
