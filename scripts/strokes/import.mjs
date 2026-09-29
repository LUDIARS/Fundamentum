import { mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Foundation } from '../../dist/index.js';
import { importStrokeData, exportStrokeData, strokeHubItems } from '../../dist/stroke-data/index.js';
import { readLock, locales, sourceFor, verifiedFile } from './source-files.mjs';

const [lockPath, cachePath, storePath, exportPath] = process.argv.slice(2);
if (!lockPath || !cachePath || !storePath || !exportPath) throw Error('Usage: node scripts/strokes/import.mjs <lock> <cache> <store> <export-directory>');
const lock=await readLock(lockPath), root=resolve(exportPath), fm=Foundation.onDisk(resolve(storePath));
await mkdir(root,{recursive:true});
const summary=[];
async function atomicFile(path,data) {
  const tmp=path+'.'+randomUUID()+'.partial';
  try {await writeFile(tmp,data,{flag:'wx'});await rename(tmp,path);}
  finally {await rm(tmp,{force:true});}
}
// Each collection is an independent immutable catalog. No automatic hub push or service startup.
for(const file of lock.files.filter(f=>Object.hasOwn(locales,f.path))) {
  const source=await sourceFor(lock,cachePath,file), data=await verifiedFile(cachePath,file);
  const catalog=await importStrokeData(fm,data,source);
  const bundle=await exportStrokeData(fm,catalog.id);
  const filename=source.collection+'-'+lock.revision+'.json';
  await atomicFile(join(root,filename),JSON.stringify(bundle));
  // JSONL items are portable input for the existing datahub-kit push API; author is supplied by caller.
  await atomicFile(join(root,filename+'.hub.jsonl'),strokeHubItems(bundle).map(x=>JSON.stringify(x)).join('\n')+'\n');
  const record={catalog:catalog.name,id:catalog.id,locale:source.locale,collection:source.collection,glyphs:bundle.glyphs.length,file:filename};
  summary.push(record);process.stdout.write(JSON.stringify(record)+'\n');
}
await atomicFile(join(root,'catalogs-'+lock.revision+'.json'),JSON.stringify(summary,null,2));
