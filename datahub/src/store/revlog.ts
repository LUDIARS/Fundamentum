/**
 * store/revlog — コミット台帳 (revlog.jsonl) の読み書き。
 * rev は 1 始まり・欠番なし・追記順と一致することを起動時に検証する (破れは fail-fast)。
 */
import { appendJsonl, readJsonl } from "../util/jsonl.js";
import type { CommitRecord } from "./record.js";

export class RevLog {
  constructor(private readonly file: string) {}

  loadAll(): CommitRecord[] {
    const records = readJsonl<CommitRecord>(this.file);
    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      if (!rec || rec.rev !== i + 1) {
        throw new Error(
          `[revlog] ${this.file} の rev 連番が破れています (行 ${i + 1}: rev=${rec?.rev})`,
        );
      }
    }
    return records;
  }

  append(record: CommitRecord): void {
    appendJsonl(this.file, record);
  }
}
