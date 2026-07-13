/**
 * server/routes — HTTP ルーティングと各エンドポイントの入出力整形。
 * 契約の正本: spec/interface/datahub-api.md。ビジネスロジックは各層 (store/conflict/
 * sensitive/backup) と push_handler に置き、ここは検証と JSON 整形のみ。
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { isUuidV4 } from "../store/record.js";
import type { Store } from "../store/store.js";
import type { AuthorRegistry } from "../store/authors.js";
import type { OpLog } from "../store/oplog.js";
import type { ConflictLog } from "../conflict/conflict_log.js";
import type { BackupManager } from "../backup/backup.js";
import type { PushHandler, PushRequest } from "./push_handler.js";
import { vgWrite } from "../obs/vestigium.js";

export interface RouteDeps {
  store: Store;
  authors: AuthorRegistry;
  oplog: OpLog;
  conflictLog: ConflictLog;
  backup: BackupManager;
  pushHandler: PushHandler;
  llmStatus: { conflict: boolean; sensitive: boolean };
  maxBodyBytes: number;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function handleApi(
  deps: RouteDeps,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const route = `${req.method} ${url.pathname}`;
  try {
    switch (route) {
      case "GET /v1/health":
        return json(res, 200, {
          ok: true,
          service: "fundamentum-datahub",
          headRev: deps.store.headRev,
          records: deps.store.recordCount,
          authors: deps.authors.list().length,
          llm: deps.llmStatus,
        });
      case "GET /v1/authors":
        return json(res, 200, { authors: deps.authors.list() });
      case "POST /v1/authors": {
        const body = await readJsonBody<{ author?: string; name?: string }>(req, deps.maxBodyBytes);
        if (typeof body.author !== "string" || !isUuidV4(body.author)) {
          throw new HttpError(400, "bad-author", "author は UUIDv4 であること");
        }
        if (typeof body.name !== "string" || !body.name.trim()) {
          throw new HttpError(400, "bad-name", "name (表示名) は空でない文字列であること");
        }
        const entry = deps.authors.upsert(body.author, body.name);
        deps.oplog.append({ op: "authors", author: body.author, note: `name=${entry.name}` });
        return json(res, 200, { ok: true, author: entry.author, name: entry.name });
      }
      case "POST /v1/push": {
        const body = await readJsonBody<PushRequest>(req, deps.maxBodyBytes);
        if (typeof body.author !== "string" || !isUuidV4(body.author)) {
          throw new HttpError(400, "bad-author", "author は UUIDv4 であること");
        }
        if (!deps.authors.has(body.author)) {
          throw new HttpError(
            400,
            "unknown-author",
            "author 未登録です。先に POST /v1/authors で表示名を登録してください",
          );
        }
        if (!Array.isArray(body.items) || body.items.length === 0) {
          throw new HttpError(400, "bad-items", "items は 1 件以上の配列であること");
        }
        return json(res, 200, await deps.pushHandler.handle(body));
      }
      case "GET /v1/pull": {
        const since = parseIntParam(url, "since", 0);
        const kind = url.searchParams.get("kind") ?? undefined;
        const records = deps.store.pullSince(since, kind);
        deps.oplog.append({ op: "pull", sinceRev: since, items: records.length, headRev: deps.store.headRev });
        return json(res, 200, { headRev: deps.store.headRev, records });
      }
      case "GET /v1/records":
        return json(res, 200, {
          headRev: deps.store.headRev,
          records: deps.store.heads(url.searchParams.get("kind") ?? undefined),
        });
      case "GET /v1/conflicts":
        return json(res, 200, { conflicts: deps.conflictLog.listPending() });
      case "POST /v1/conflicts/resolve": {
        const body = await readJsonBody<{ conflictId?: string; winner?: string }>(
          req,
          deps.maxBodyBytes,
        );
        if (body.winner !== "incoming" && body.winner !== "current") {
          throw new HttpError(400, "bad-winner", 'winner は "incoming" | "current"');
        }
        const pending = deps.conflictLog.getPending(String(body.conflictId));
        if (!pending) {
          throw new HttpError(404, "not-found", `pending conflict がありません: ${body.conflictId}`);
        }
        let assignedRev: number | undefined;
        if (body.winner === "incoming") {
          const rec = deps.store.commit({
            kind: pending.kind,
            id: pending.id,
            author: pending.author,
            payload: pending.incomingPayload,
            resolution: {
              mode: "manual",
              winner: "incoming",
              againstRev: pending.headRev,
              reason: "手動解決",
            },
          });
          assignedRev = rec.rev;
        }
        deps.conflictLog.logManualResolved(pending.conflictId, body.winner, assignedRev);
        deps.oplog.append({
          op: "resolve",
          note: `${pending.conflictId} -> ${body.winner}`,
          headRev: deps.store.headRev,
        });
        vgWrite("info", "conflict manual-resolved", { conflictId: pending.conflictId, winner: body.winner });
        return json(res, 200, {
          kind: pending.kind,
          id: pending.id,
          status: body.winner === "incoming" ? "resolved-incoming" : "resolved-current",
          ...(assignedRev !== undefined ? { rev: assignedRev } : { headRev: pending.headRev }),
          resolution: { mode: "manual", winner: body.winner, reason: "手動解決" },
        });
      }
      case "GET /v1/log":
        return json(res, 200, { entries: deps.oplog.recent(parseIntParam(url, "limit", 50)) });
      case "POST /v1/backup": {
        const info = deps.backup.run();
        deps.oplog.append({ op: "backup", note: info.dir, headRev: info.headRev });
        return json(res, 200, { ok: true, ...info });
      }
      case "GET /v1/backups":
        return json(res, 200, { backups: deps.backup.list() });
      default:
        if (url.pathname.startsWith("/v1/")) {
          throw new HttpError(404, "not-found", `未知のエンドポイント: ${route}`);
        }
        return false;
    }
  } catch (e) {
    if (e instanceof HttpError) {
      return json(res, e.status, { error: { code: e.code, message: e.message } });
    }
    console.error(`[datahub] ${route} で内部エラー:`, e);
    vgWrite("error", "internal error", { route, message: (e as Error).message });
    return json(res, 500, {
      error: { code: "internal", message: (e as Error).message },
    });
  }
}

function json(res: ServerResponse, status: number, body: unknown): true {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
  return true;
}

function parseIntParam(url: URL, name: string, fallback: number): number {
  const raw = url.searchParams.get(name);
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new HttpError(400, "bad-param", `${name} は 0 以上の整数であること: ${raw}`);
  }
  return value;
}

function readJsonBody<T>(req: IncomingMessage, maxBytes: number): Promise<T> {
  return new Promise((resolvePromise, rejectPromise) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        rejectPromise(new HttpError(413, "too-large", `body が上限 ${maxBytes} bytes を超過`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolvePromise(JSON.parse(Buffer.concat(chunks).toString("utf8")) as T);
      } catch {
        rejectPromise(new HttpError(400, "bad-json", "body が JSON として parse できません"));
      }
    });
    req.on("error", (err) => rejectPromise(new HttpError(400, "bad-body", err.message)));
  });
}
