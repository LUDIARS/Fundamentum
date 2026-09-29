import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

/** @implements SPEC-FM-STROKE-DATA */
export const checksum = data => createHash('sha256').update(data).digest('hex');
export const locales = { 'graphicsJa.txt':'ja', 'graphicsJaKana.txt':'ja', 'graphicsKo.txt':'ko',
  'graphicsZhHans.txt':'zh-Hans', 'graphicsZhHant.txt':'zh-Hant' };

/** @implements SPEC-FM-STROKE-DATA */
export async function readLock(path) {
  const lock = JSON.parse(await readFile(path, 'utf8'));
  if (lock.provider !== 'animcjk' || lock.repository !== 'https://github.com/parsimonhi/animCJK' ||
      !/^[a-f0-9]{40}$/.test(lock.revision) || !Array.isArray(lock.files)) throw Error('Invalid source lock');
  const seen = new Set();
  for (const file of lock.files) {
    if (!/^(graphics(?:Ja|JaKana|Ko|ZhHans|ZhHant)\.txt|licenses\/(COPYING\.txt|LGPL\.txt|APL\/english\/ARPHICPL\.TXT))$/.test(file.path) ||
        file.local !== file.path.replaceAll('/', '__') || !/^[a-f0-9]{64}$/.test(file.sha256) ||
        !Number.isSafeInteger(file.bytes) || file.bytes <= 0 || file.bytes > 64*1024*1024 || seen.has(file.path)) {
      throw Error('Invalid source file lock');
    }
    seen.add(file.path);
  }
  for (const path of [...Object.keys(locales), 'licenses/COPYING.txt', 'licenses/APL/english/ARPHICPL.TXT']) {
    if (!seen.has(path)) throw Error('Missing required source file: '+path);
  }
  return lock;
}

/** @implements SPEC-FM-STROKE-DATA */
export async function verifiedFile(root, file) {
  const data = await readFile(join(root, file.local));
  if (data.length !== file.bytes || checksum(data) !== file.sha256) throw Error('Checksum mismatch: '+file.path);
  return data;
}

/** @implements SPEC-FM-STROKE-DATA */
export async function sourceFor(lock, root, file) {
  const notices = [];
  for (const notice of lock.files.filter(f => f.path.startsWith('licenses/'))) {
    const data = await verifiedFile(root, notice);
    notices.push({path:notice.path, text:new TextDecoder('utf-8',{fatal:true}).decode(data), sha256:notice.sha256});
  }
  return {schema:'fm.stroke-source.v1', provider:lock.provider, repository:lock.repository,
    revision:lock.revision, locale:locales[file.path], collection:file.path.replace(/\.txt$/,''),
    file:file.path, sha256:file.sha256, license:'LicenseRef-Arphic-Public-License', notices,
    transformations:['Graphics JSONL converted to fm.stroke-glyph.v1; stroke order, outline paths and median coordinates unchanged.']};
}
