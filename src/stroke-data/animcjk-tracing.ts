import type { JsonValue } from "../types.js";
import { tracingPathPoints } from "./tracing-path-points.js";

export interface TracingStroke extends Record<string, JsonValue> {
  number: number;
  parts: string[];
  median: number[][];
}
export interface TracingGlyph extends Record<string, JsonValue> {
  schema: "fm.stroke-tracing-glyph.v1";
  character: string;
  coordinateSystem: "animcjk-svg";
  strokes: TracingStroke[];
  originalSvg: string;
}

/** @implements SPEC-FM-TRACING-GROUPS */
/** Interpret only the pinned AnimCJK SVG data subset; do not execute styles/scripts. @implements SPEC-FM-TRACING-GROUPS */
export function parseAnimCjkTracing(svg: string, character: string): TracingGlyph {
  if([...character].length!==1 || svg.length>1024*1024 || /<!DOCTYPE|<!ENTITY|<script\b/i.test(svg)) throw new Error("Invalid tracing SVG");
  const code=character.codePointAt(0);
  if(code===undefined || code>=0xd800&&code<=0xdfff) throw new Error("Invalid scalar");
  if(!svg.includes('viewBox="0 0 1024 1024"')) throw new Error("Unexpected SVG coordinates");
  const groups=new Map<number,{parts:string[]; primary:string|null}>();
  for(const match of svg.matchAll(/<path\b([^>]+)\/?\s*>/g)) {
    const attributes=match[1];
    const clip=/\bclip-path="url\(#z(\d+)c(\d+)([a-z]?)\)"/.exec(attributes);
    if(!clip) {if(attributes.includes("clip-path=")) throw new Error("Unsupported clip reference"); continue;}
    const [,id,rank,suffix]=clip;
    if(Number(id)!==code) throw new Error("Wrong character in SVG");
    const number=Number(rank);
    if(!Number.isSafeInteger(number)||number<1||number>256) throw new Error("Invalid stroke number");
    const path=/(?:^|\s)d="([^"]+)"/.exec(attributes)?.[1];
    if(!path) throw new Error("Missing median path");
    const group=groups.get(number)??{parts:[],primary:null};
    const part=rank+suffix;
    if(group.parts.includes(part)) throw new Error("Duplicate SVG part");
    group.parts.push(part);
    if(!suffix || suffix==="a") {
      if(group.primary!==null) throw new Error("Ambiguous primary median");
      group.primary=path;
    }
    groups.set(number,group);
  }
  if(!groups.size) throw new Error("No tracing groups");
  const strokes:TracingStroke[]=[];
  for(const [number,group] of [...groups].sort(([a],[b])=>a-b)) {
    if(number!==strokes.length+1 || !group.primary) throw new Error("Missing primary stroke or number gap");
    strokes.push({number,parts:group.parts,median:tracingPathPoints(group.primary)});
  }
  return {schema:"fm.stroke-tracing-glyph.v1",character,coordinateSystem:"animcjk-svg",strokes,originalSvg:svg};
}
