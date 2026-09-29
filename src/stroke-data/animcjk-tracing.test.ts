import {describe,it,expect} from "vitest";
import {parseAnimCjkTracing} from "./animcjk-tracing.js";

const wrap=(paths:string):string=>`<svg viewBox="0 0 1024 1024">${paths}</svg>`;
const path=(rank:string,d="M 10,20 30,40"):string=>`<path clip-path="url(#z12354c${rank})" d="${d}"/>`;

describe("SPEC-FM-TRACING-GROUPS",()=>{
  it("keeps a split masked third stroke as one learning stroke",()=>{
    const original=wrap(path("1")+path("2")+path("3a")+path("3b","M -200,10 30,40"));
    const result=parseAnimCjkTracing(original,"あ");
    expect(result.strokes).toHaveLength(3);
    expect(result.strokes[2].parts).toEqual(["3a","3b"]);
    expect(result.strokes[2].median).toEqual([[10,20],[30,40]]);
    expect(result.originalSvg).toBe(original);
  });
  it("rejects missing or ambiguous primary paths",()=>{
    expect(()=>parseAnimCjkTracing(wrap(path("1b")),"あ")).toThrow("Missing primary");
    expect(()=>parseAnimCjkTracing(wrap(path("1")+path("1a")),"あ")).toThrow("Ambiguous");
    expect(()=>parseAnimCjkTracing(wrap(path("2")),"あ")).toThrow("number gap");
  });
  it("never clamps invalid primary points or executes SVG content",()=>{
    expect(()=>parseAnimCjkTracing(wrap(path("1","M -200,10 30,40")),"あ")).toThrow("leaves");
    expect(()=>parseAnimCjkTracing(wrap('<script>bad()</script>'+path("1")),"あ")).toThrow("Invalid tracing");
  });
});
