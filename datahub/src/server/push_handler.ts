/**
 * server/push_handler — POST /v1/push の処理パイプライン。
 * item 検証 → センシティブ検査 → コンフリクト判定 → commit / 解決 / pending。
 * 全 item を mutex 内で直列処理し、rev 採番と head 判定の一貫性を保つ。
 */
import { AsyncMutex } from "../util/mutex.js";
import {
  KIND_RE,
  isValidPayload,
  payloadHash,
  type Payload,
} from "../store/record.js";
import type { Store } from "../store/store.js";
import type { AuthorRegistry } from "../store/authors.js";
import type { OpLog } from "../store/oplog.js";
import type { ConflictResolver } from "../conflict/resolver.js";
import type { SensitiveScreen } from "../sensitive/screen.js";
import { vgWrite } from "../obs/vestigium.js";

export interface PushItem {
  kind: string;
  id: string;
  baseRev: number;
  payload: Payload;
}

export interface PushRequest {
  author: string;
  items: PushItem[];
}

export interface PushItemResult {
  kind: string;
  id: string;
  status:
    | "committed"
    | "unchanged"
    | "resolved-incoming"
    | "resolved-current"
    | "conflict"
    | "rejected-sensitive"
    | "error";
  rev?: number;
  headRev?: number;
  conflictId?: string;
  category?: string;
  reason?: string;
  resolution?: { mode: string; winner: string; reason: string };
  error?: string;
}

export interface PushResponse {
  headRev: number;
  results: PushItemResult[];
}

export class PushHandler {
  private readonly mutex = new AsyncMutex();

  constructor(
    private readonly deps: {
      store: Store;
      authors: AuthorRegistry;
      resolver: ConflictResolver;
      screen: SensitiveScreen;
      oplog: OpLog;
      maxPayloadBytes: number;
      clock: () => Date;
    },
  ) {}

  async handle(request: PushRequest): Promise<PushResponse> {
    return this.mutex.run(async () => {
      const startedAt = this.deps.clock().getTime();
      const results: PushItemResult[] = [];
      for (const item of request.items) {
        results.push(await this.handleItem(request.author, item));
      }
      const statuses: Record<string, number> = {};
      for (const r of results) statuses[r.status] = (statuses[r.status] ?? 0) + 1;
      this.deps.oplog.append({
        op: "push",
        author: request.author,
        items: request.items.length,
        statuses,
        headRev: this.deps.store.headRev,
        durationMs: this.deps.clock().getTime() - startedAt,
      });
      vgWrite("info", "push", { author: request.author, items: request.items.length, statuses });
      return { headRev: this.deps.store.headRev, results };
    });
  }

  private async handleItem(author: string, item: PushItem): Promise<PushItemResult> {
    const base = { kind: String(item?.kind ?? ""), id: String(item?.id ?? "") };
    const invalid = this.validateItem(item);
    if (invalid) return { ...base, status: "error", error: invalid };

    const screened = await this.deps.screen.screen({ ...base, author, payload: item.payload });
    if (!screened.ok) {
      return {
        ...base,
        status: "rejected-sensitive",
        category: screened.category,
        reason: screened.reason,
      };
    }

    const head = this.deps.store.head(item.kind, item.id);
    if (!head) {
      const rec = this.deps.store.commit({ ...base, author, payload: item.payload });
      return { ...base, status: "committed", rev: rec.rev };
    }
    if (payloadHash(item.payload) === head.hash) {
      return { ...base, status: "unchanged", rev: head.rev };
    }
    if (item.baseRev === head.rev) {
      const rec = this.deps.store.commit({ ...base, author, payload: item.payload });
      return { ...base, status: "committed", rev: rec.rev };
    }

    // baseRev が古い + 内容が異なる = コンフリクト
    const conflictItem = { ...base, baseRev: item.baseRev, author, payload: item.payload };
    const outcome = await this.deps.resolver.resolve(conflictItem, head);
    if (outcome.type === "pending") {
      return {
        ...base,
        status: "conflict",
        conflictId: outcome.pending.conflictId,
        headRev: head.rev,
        reason: outcome.pending.reason,
      };
    }
    if (outcome.winner === "incoming") {
      const rec = this.deps.store.commit({
        ...base,
        author,
        payload: item.payload,
        resolution: {
          mode: outcome.mode,
          winner: "incoming",
          againstRev: head.rev,
          reason: outcome.reason,
        },
      });
      this.deps.resolver.recordAuto(conflictItem, head, outcome, rec.rev);
      return {
        ...base,
        status: "resolved-incoming",
        rev: rec.rev,
        resolution: { mode: outcome.mode, winner: "incoming", reason: outcome.reason },
      };
    }
    this.deps.resolver.recordAuto(conflictItem, head, outcome);
    return {
      ...base,
      status: "resolved-current",
      headRev: head.rev,
      resolution: { mode: outcome.mode, winner: "current", reason: outcome.reason },
    };
  }

  private validateItem(item: PushItem): string | null {
    if (!item || typeof item !== "object") return "item がオブジェクトではありません";
    if (!KIND_RE.test(item.kind ?? "")) return `kind が不正です (${KIND_RE}): ${item.kind}`;
    if (typeof item.id !== "string" || !item.id.trim() || item.id.length > 256) {
      return "id は 1〜256 文字の文字列であること";
    }
    if (!Number.isInteger(item.baseRev) || item.baseRev < 0) {
      return "baseRev は 0 以上の整数であること (新規は 0)";
    }
    if (!isValidPayload(item.payload)) {
      return "payload は {format: json|graph|csv|text, data} であること (csv/text の data は string)";
    }
    const bytes = Buffer.byteLength(JSON.stringify(item.payload), "utf8");
    if (bytes > this.deps.maxPayloadBytes) {
      return `payload が上限 ${this.deps.maxPayloadBytes} bytes を超過 (${bytes} bytes)`;
    }
    return null;
  }
}
