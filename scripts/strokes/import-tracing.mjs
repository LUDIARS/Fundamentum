import {readFile,writeFile,mkdir,rename,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {Foundation,contentIdOf} from '../../dist/index.js';
import {parseAnimCjkTracing} from '../../dist/stroke-data/index.js';
import {readLock,verifiedFile} from './source-files.mjs';
import {localTracingSource} from './local-tracing-source.mjs';

// @implements SPEC-FM-TRACING-GROUPS
const [selectionPath,lockPath,cachePath,storePath,outputPath,svgRoot,svgManifest]=process.argv.slice(2);
if(!outputPath) throw Error('Usage: import-tracing.mjs <characters.json> <source-lock> <cache> <store> <output>');
const selection=JSON.parse(await readFile(selectionPath,'utf8'));
const characters=selection.characters;
if(!Array.isArray(characters)||!characters.length||characters.length>10000||
   new Set(characters).size!==characters.length||characters.some(c=>typeof c!=='string'||[...c].length!==1)) throw Error('Invalid character selection');
const lock=await readLock(lockPath),cache=resolve(cachePath),fm=Foundation.onDisk(resolve(storePath));
if(Boolean(svgRoot)!==Boolean(svgManifest))throw Error('Local SVG directory and manifest must be supplied together');
const localSvg=svgRoot?await localTracingSource(resolve(svgRoot),resolve(svgManifest),lock.revision):null;
await mkdir(cache,{recursive:true});
const notices=[];
for(const file of lock.files.filter(f=>f.path.startsWith('licenses/'))){
  const bytes=await verifiedFile(cache,file);notices.push({path:file.path,text:bytes.toString('utf8'),sha256:file.sha256});
}
if(!notices.some(n=>n.path==='licenses/LGPL.txt')) throw Error('Kana tracing requires the LGPL license text');
const hash=b=>createHash('sha256').update(b).digest('hex');
const gplUrl='https://raw.githubusercontent.com/spdx/license-list-data/31ba1a50e5397e00a304dbadc76531740e89ee48/text/GPL-3.0-or-later.txt';
const gplResponse=await fetch(gplUrl,{signal:AbortSignal.timeout(30000)});
if(!gplResponse.ok) throw Error('GPL license acquisition failed');
const gpl=await gplResponse.text();
if(!gpl.includes('GNU GENERAL PUBLIC LICENSE')||!gpl.includes('Version 3')) throw Error('Unexpected GPL text');
notices.push({path:'licenses/GPL-3.0.txt',text:gpl,sha256:hash(Buffer.from(gpl)),url:gplUrl});
const glyphs=[],files=[];
for(const character of [...characters].sort((a,b)=>a.codePointAt(0)-b.codePointAt(0))){
  const cp=character.codePointAt(0),isKana=cp>=0x3040&&cp<=0x30ff;
  const path=`${isKana?'svgsJaKana':'svgsJa'}/${cp}.svg`;
  const url=`https://raw.githubusercontent.com/parsimonhi/animCJK/${lock.revision}/${path}`;
  let bytes;
  if(localSvg)bytes=await localSvg(path);
  else{
    const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
    if(!response.ok) throw Error(`SVG acquisition failed ${path}: ${response.status}`);
    bytes=Buffer.from(await response.arrayBuffer());
  }
  if(bytes.length>1024*1024) throw Error('SVG too large');
  const svg=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  let glyph;
  try {glyph=parseAnimCjkTracing(svg,character);}
  catch(error) {throw Error(`Tracing ${character} (${path}): ${String(error)}`);}
  glyphs.push(glyph);
  files.push({character,path,sha256:hash(bytes),license:isKana?'LGPL-3.0-or-later':'LicenseRef-Arphic-Public-License'});
  await writeFile(join(cache,path.replaceAll('/','__')),bytes);
}
const source={schema:'fm.stroke-tracing-source.v1',provider:'animcjk',repository:lock.repository,
  revision:lock.revision,locale:'ja',files,notices,modifiedAt:'2026-09-29',
  modifications:'Group animation parts by explicit SVG stroke number. Use unsuffixed or a primary median; retain all part IDs and original SVG. Coordinates unchanged.'};
const stored=await fm.master.put(source),builder=fm.catalog.builder(`strokes/animcjk/${lock.revision}/ja/tracing/${contentIdOf(characters).slice(4)}`);
builder.set('@source',stored.id);
for(const glyph of glyphs){glyph.source=stored.id;builder.set('U+'+glyph.character.codePointAt(0).toString(16).toUpperCase().padStart(4,'0'),(await fm.master.put(glyph)).id);}
const catalog=await builder.commit();
const bundle={schema:'fm.stroke-tracing-bundle.v1',catalogId:catalog.id,source,glyphs};
const output=resolve(outputPath),tmp=output+'.'+randomUUID()+'.partial';
try{await writeFile(tmp,JSON.stringify(bundle),{flag:'wx'});await rename(tmp,output);}
finally{await rm(tmp,{force:true});}
process.stdout.write(JSON.stringify({catalogId:catalog.id,glyphs:glyphs.length,sha256:hash(Buffer.from(JSON.stringify(bundle))),output})+'\n');
