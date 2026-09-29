import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {checksum} from './source-files.mjs';

/** Validate local SVGs against the committed complete Japanese manifest. @implements SPEC-FM-FULL-JAPANESE-STROKES */
export async function localTracingSource(directory,manifestPath,revision){
 const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
 if(manifest.schema!=='fm.animcjk-japanese-lock.v1'||manifest.revision!==revision||!Array.isArray(manifest.files)||manifest.files.length!==7184)throw Error('Invalid full Japanese manifest');
 const files=new Map();
 for(const file of manifest.files){
  if(!/^svgsJa(?:Kana)?\/\d+\.svg$/.test(file.path)||!Number.isSafeInteger(file.bytes)||file.bytes<1||file.bytes>1024*1024||!/^[a-f0-9]{64}$/.test(file.sha256)||files.has(file.path))throw Error('Invalid Japanese SVG lock');
  files.set(file.path,file);
 }
 return async path=>{
  const file=files.get(path);if(!file)throw Error('SVG absent from pinned manifest: '+path);
  const bytes=await readFile(join(directory,path));
  if(bytes.length!==file.bytes||checksum(bytes)!==file.sha256)throw Error('SVG checksum mismatch: '+path);
  return bytes;
 };
}
