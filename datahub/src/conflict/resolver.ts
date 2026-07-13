/**
 * conflict/resolver — コンフリクト解決パイプライン:
 * ①決定的スーパーセット → ②LLM 判定 → ③pending。
 * 自動解決は必ず ConflictLog へ記録する (spec/feature の原則 4)。
 */
import type { CommitRecord, Payload } from "../store/record.js";
import { decideSuperset } from "./superset.js";
import type { ConflictJudge } from "./llm_judge.js";
import type { ConflictLog, PendingConflict } from "./conflict_log.js";

export interface ConflictItem {
  kind: string;
  id: string;
  baseRev: number;
  author: string;
  payload: Payload;
}

export type ConflictOutcome =
  | {
      type: "auto";
      winner: "incoming" | "current";
      mode: "superset" | "llm";
      reason: string;
    }
  | { type: "pending"; pending: PendingConflict };

export class ConflictResolver {
  constructor(
    private readonly judge: ConflictJudge | null,
    private readonly log: ConflictLog,
  ) {}

  /** 呼び出し前提: head が存在し、baseRev < head.rev かつ payload が head と異なる */
  async resolve(item: ConflictItem, head: CommitRecord): Promise<ConflictOutcome> {
    const bySuperset = decideSuperset(head.payload, item.payload);
    if (bySuperset) {
      return {
        type: "auto",
        winner: bySuperset,
        mode: "superset",
        reason:
          bySuperset === "incoming"
            ? "incoming が current の全情報を包含 (決定的判定)"
            : "current が incoming の全情報を包含 (決定的判定)",
      };
    }

    if (!this.judge) {
      return { type: "pending", pending: this.addPending(item, head, "llm-unavailable") };
    }

    let verdict;
    try {
      verdict = await this.judge({
        kind: item.kind,
        id: item.id,
        current: { rev: head.rev, author: head.author, payload: head.payload },
        incoming: { author: item.author, payload: item.payload },
      });
    } catch (e) {
      // LLM 実行失敗は握りつぶさず pending + 理由として観測可能にする
      console.error(`[datahub/conflict] LLM 判定失敗 (${item.kind}/${item.id}):`, e);
      return {
        type: "pending",
        pending: this.addPending(item, head, `llm-error: ${(e as Error).message.slice(0, 200)}`),
      };
    }

    if (verdict.winner === "undecidable") {
      return {
        type: "pending",
        pending: this.addPending(item, head, `undecidable: ${verdict.reason}`),
      };
    }
    return { type: "auto", winner: verdict.winner, mode: "llm", reason: verdict.reason };
  }

  /** 自動解決の確定をログへ記録 (incoming 勝ちは commit 後に assignedRev 付きで呼ぶ) */
  recordAuto(
    item: ConflictItem,
    head: CommitRecord,
    outcome: Extract<ConflictOutcome, { type: "auto" }>,
    assignedRev?: number,
  ): void {
    this.log.logAutoResolved({
      kind: item.kind,
      id: item.id,
      baseRev: item.baseRev,
      headRev: head.rev,
      author: item.author,
      mode: outcome.mode,
      winner: outcome.winner,
      reason: outcome.reason,
      ...(assignedRev !== undefined ? { assignedRev } : {}),
    });
  }

  private addPending(item: ConflictItem, head: CommitRecord, reason: string): PendingConflict {
    return this.log.addPending({
      kind: item.kind,
      id: item.id,
      baseRev: item.baseRev,
      headRev: head.rev,
      author: item.author,
      reason,
      incomingPayload: item.payload,
    });
  }
}
