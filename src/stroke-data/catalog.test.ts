import { describe, it, expect } from "vitest";
import { Foundation } from "../foundation.js";
import { digest, parseAnimCjk } from "./animcjk.js";
import { importStrokeData, exportStrokeData } from "./catalog.js";
import { strokeHubItems } from "./distribution.js";
import type { StrokeSource } from "./types.js";

// Synthetic geometry, not redistributed upstream character data.
const line = JSON.stringify({character:"一",strokes:["M0 0L10 0Z"],medians:[[[0,0],[10,0]]]});
const data = Buffer.from(line, "utf8");
const source = (file="graphicsJa.txt",locale="ja"): StrokeSource => ({
  schema:"fm.stroke-source.v1",provider:"animcjk",revision:"a".repeat(40),
  repository:"https://github.com/parsimonhi/animCJK",file,locale,collection:file.replace(/\.txt$/,""),
  sha256:digest(data),license:"LicenseRef-Arphic-Public-License",transformations:["Synthetic test fixture"],
  notices:["licenses/COPYING.txt","licenses/APL/english/ARPHICPL.TXT"].map(path=>({path,text:"fixture",sha256:digest(Buffer.from("fixture"))})),
});

describe("SPEC-FM-STROKE-DATA",()=>{
  it("rejects hash corruption before publishing any catalog",async()=>{
    const fm=Foundation.inMemory();
    await expect(importStrokeData(fm,Buffer.from(line+" "),source())).rejects.toThrow("checksum");
    expect(await fm.catalog.names()).toEqual([]);
  });
  it("retains licenses and gives unchanged imports the same catalog",async()=>{
    const fm=Foundation.inMemory();
    const first=await importStrokeData(fm,data,source());
    expect((await importStrokeData(fm,data,source())).id).toBe(first.id);
    const exported=await exportStrokeData(fm,first.id);
    expect(exported.source.notices).toEqual(source().notices);
    expect(exported.glyphs[0].strokes[0].median).toEqual([[0,0],[10,0]]);
    expect(strokeHubItems(exported)[1].id).toBe(first.entries["U+4E00"]);
  });
  it("keeps languages apart and forbids redefining a locked source",async()=>{
    const fm=Foundation.inMemory();
    const ja=await importStrokeData(fm,data,source());
    const zh=await importStrokeData(fm,data,source("graphicsZhHans.txt","zh-Hans"));
    expect(ja.name).not.toBe(zh.name);
    await expect(importStrokeData(fm,data,{...source(),transformations:["changed"]})).rejects.toThrow("redefined");
  });
  it("rejects duplicate glyphs and invalid medians",()=>{
    const repeated=Buffer.from(line+"\n"+line);
    expect(()=>parseAnimCjk(repeated,{...source(),sha256:digest(repeated)})).toThrow("Duplicate");
    const invalid=Buffer.from(JSON.stringify({character:"一",strokes:["M0 0Z"],medians:[]}));
    expect(()=>parseAnimCjk(invalid,{...source(),sha256:digest(invalid)})).toThrow("count mismatch");
  });
});
