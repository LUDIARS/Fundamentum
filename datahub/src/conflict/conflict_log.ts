/**
 * conflict/conflict_log — conflicts.jsonl (自動解決の記録 + pending 台帳)。
 * pending はリプレイで再構成: pending イベントで登録し、auto/manual-resolved で解消。
 */
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { appendJsonl, readJsonl } from "../util/jsonl.js";
import type { Payload } from "../store/record.js";

export interface PendingConflict {
  conflictId: string;
  kind: string;
  id: string;
  baseRev: number;
  headRev: number;
  author: string;
  reason: string;
  incomingPayload: Payload;
  ts: string;
}

interface ConflictEvent {
  event: "auto-resolved" | "pending" | "manual-resolved";
  conflictId: string;
  ts: string;
  kind?: string;
  id?: string;
  baseRev?: number;
  headRev?: number;
  author?: string;
  mode?: "superset" | "llm";
  winner?: "incoming" | "current";
  reason?: string;
  assignedRev?: number;
  incomingPayload?: Payload;
}

export class ConflictLog {
  private pending = new Map<string, PendingConflict>();

  private constructor(
    private readonly file: string,
    private readonly clock: () => Date,
  ) {}

  static open(dataDir: string, clock: () => Date): ConflictLog {
    const log = new ConflictLog(join(dataDir, "conflicts.jsonl"), clock);
    for (const ev of readJsonl<ConflictEvent>(log.file)) {
      if (ev.event === "pending" && ev.incomingPayload) {
        log.pending.set(ev.conflictId, {
          conflictId: ev.conflictId,
          kind: ev.kind ?? "",
          id: ev.id ?? "",
          baseRev: ev.baseRev ?? 0,
          headRev: ev.headRev ?? 0,
          author: ev.author ?? "",
          reason: ev.reason ?? "",
          incomingPayload: ev.incomingPayload,
          ts: ev.ts,
        });
      } else if (ev.event === "auto-resolved" || ev.event === "manual-resolved") {
        log.pending.delete(ev.conflictId);
      }
    }
    return log;
  }

  logAutoResolved(entry: {
    kind: string;
    id: string;
    baseRev: number;
    headRev: number;
    author: string;
    mode: "superset" | "llm";
    winner: "incoming" | "current";
    reason: string;
    assignedRev?: number;
  }): string {
    const conflictId = `c-${randomUUID()}`;
    appendJsonl(this.file, {
      event: "auto-resolved",
      conflictId,
      ts: this.clock().toISOString(),
      ...entry,
    } satisfies ConflictEvent);
    return conflictId;
  }

  addPending(entry: Omit<PendingConflict, "conflictId" | "ts">): PendingConflict {
    const full: PendingConflict = {
      ...entry,
      conflictId: `c-${randomUUID()}`,
      ts: this.clock().toISOString(),
    };
    appendJsonl(this.file, { event: "pending", ...full } satisfies ConflictEvent & PendingConflict);
    this.pending.set(full.conflictId, full);
    return full;
  }

  getPending(conflictId: string): PendingConflict | undefined {
    return this.pending.get(conflictId);
  }

  listPending(): PendingConflict[] {
    return [...this.pending.values()].sort((a, b) => a.ts.localeCompare(b.ts));
  }

  logManualResolved(conflictId: string, winner: "incoming" | "current", assignedRev?: number): void {
    if (!this.pending.has(conflictId)) {
      throw new Error(`[conflicts] pending に存在しません: ${conflictId}`);
    }
    appendJsonl(this.file, {
      event: "manual-resolved",
      conflictId,
      winner,
      ...(assignedRev !== undefined ? { assignedRev } : {}),
      ts: this.clock().toISOString(),
    } satisfies ConflictEvent);
    this.pending.delete(conflictId);
  }
}
