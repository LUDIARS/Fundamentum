import { mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { readLock, checksum, verifiedFile } from './source-files.mjs';

// No archive extraction or executable upstream code: fetch only allowlisted data files.
const [lockPath, destination] = process.argv.slice(2);
if (!lockPath || !destination) throw Error('Usage: node scripts/strokes/fetch.mjs <source-lock.json> <cache-directory>');
const lock = await readLock(lockPath), root = resolve(destination);
await mkdir(root, {recursive:true});
for (const file of lock.files) {
  try { await verifiedFile(root,file); process.stdout.write(JSON.stringify({file:file.path,cached:true})+'\n'); continue; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const response = await fetch(`https://raw.githubusercontent.com/parsimonhi/animCJK/${lock.revision}/${file.path}`, {signal:AbortSignal.timeout(120000)});
  if (!response.ok || !response.body) throw Error(`Download ${file.path}: HTTP ${response.status}`);
  const chunks=[]; let size=0;
  for await (const chunk of response.body) {
    size+=chunk.byteLength;
    if(size>file.bytes) throw Error('Download exceeded locked size: '+file.path);
    chunks.push(chunk);
  }
  const data=Buffer.concat(chunks);
  if(size!==file.bytes || checksum(data)!==file.sha256) throw Error('Download checksum mismatch: '+file.path);
  const temporary=join(root,file.local+'.'+randomUUID()+'.partial');
  try { await writeFile(temporary,data,{flag:'wx'}); await rename(temporary,join(root,file.local)); }
  finally { await rm(temporary,{force:true}); }
  process.stdout.write(JSON.stringify({file:file.path,bytes:size})+'\n');
}
