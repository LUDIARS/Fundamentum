/**
 * cli — datahub の CLI。
 *   serve                          hub を起動 (Excubitor から呼ばれる想定)
 *   author [--name <表示名>]       PC の Author UUID 表示 / 表示名登録
 *   push <file> --kind K [--id I]  ファイルを 1 レコードとして push
 *   pull [--since N] [--kind P]    差分取得 (JSON を stdout へ)
 * 接続先: --url > FUNDAMENTUM_DATAHUB_URL > config の port (正本は Excubitor catalog)。
 * 診断はすべて stderr へ (stdout はデータ専用)。
 */
import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { loadConfig } from "./config.js";
import { createDatahub } from "./server/http.js";
import { initVestigium, installCrashLogging, vgShutdown } from "./obs/vestigium.js";
import { loadOrCreateIdentity, saveIdentity } from "./author_identity.js";
import type { PayloadFormat } from "./store/record.js";

interface Args {
  command: string;
  positional: string[];
  options: Map<string, string>;
}

function parseArgs(argv: string[]): Args {
  const [command = "", ...rest] = argv;
  const positional: string[] = [];
  const options = new Map<string, string>();
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === undefined) continue;
    if (arg.startsWith("--")) {
      const value = rest[i + 1];
      if (value === undefined || value.startsWith("--")) {
        options.set(arg.slice(2), "true");
      } else {
        options.set(arg.slice(2), value);
        i++;
      }
    } else {
      positional.push(arg);
    }
  }
  return { command, positional, options };
}

function baseUrl(args: Args): string {
  const explicit = args.options.get("url") ?? process.env.FUNDAMENTUM_DATAHUB_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  return `http://127.0.0.1:${loadConfig().port}`;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = (await res.json()) as T & { error?: { code: string; message: string } };
  if (!res.ok) {
    throw new Error(`[datahub-cli] ${url} -> ${res.status}: ${body.error?.message ?? "不明"}`);
  }
  return body;
}

function inferFormat(file: string, explicit?: string): PayloadFormat {
  if (explicit) {
    if (!["json", "graph", "csv", "text"].includes(explicit)) {
      throw new Error(`--format は json|graph|csv|text: ${explicit}`);
    }
    return explicit as PayloadFormat;
  }
  const ext = extname(file).toLowerCase();
  if (ext === ".json") return "json";
  if (ext === ".csv") return "csv";
  return "text";
}

async function cmdServe(): Promise<void> {
  initVestigium();
  installCrashLogging();
  const hub = createDatahub({ periodicBackup: true });
  const port = await hub.listen();
  console.log(`[datahub] listening on http://127.0.0.1:${port} (headRev=${hub.store.headRev})`);
  const shutdown = async (): Promise<void> => {
    console.log("[datahub] shutdown...");
    await hub.close();
    await vgShutdown();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

async function cmdAuthor(args: Args): Promise<void> {
  const identity = loadOrCreateIdentity();
  const name = args.options.get("name");
  if (name) {
    await api(`${baseUrl(args)}/v1/authors`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ author: identity.author, name }),
    });
    identity.name = name;
    saveIdentity(identity);
    console.error(`[datahub-cli] 表示名を登録しました: ${name}`);
  }
  console.log(JSON.stringify({ author: identity.author, name: identity.name ?? null }));
}

async function cmdPush(args: Args): Promise<void> {
  const file = args.positional[0];
  if (!file) throw new Error("push <file> --kind <kind> [--id <id>] [--format f] [--base-rev N]");
  const kind = args.options.get("kind");
  if (!kind) throw new Error("--kind は必須です (例 anatomia.domain / discutere.persona)");
  const identity = loadOrCreateIdentity();
  if (!identity.name) {
    throw new Error("表示名が未登録です。先に `datahub author --name <表示名>` を実行してください");
  }
  const format = inferFormat(file, args.options.get("format"));
  const raw = readFileSync(file, "utf8");
  const data: unknown = format === "json" || format === "graph" ? JSON.parse(raw) : raw;
  const id = args.options.get("id") ?? basename(file);
  const baseRev = Number(args.options.get("base-rev") ?? "0");

  const response = await api(`${baseUrl(args)}/v1/push`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      author: identity.author,
      items: [{ kind, id, baseRev, payload: { format, data } }],
    }),
  });
  console.log(JSON.stringify(response, null, 2));
}

async function cmdPull(args: Args): Promise<void> {
  const identity = loadOrCreateIdentity();
  const since = Number(args.options.get("since") ?? identity.lastRev ?? 0);
  const kind = args.options.get("kind");
  const query = new URLSearchParams({ since: String(since) });
  if (kind) query.set("kind", kind);
  const response = await api<{ headRev: number }>(`${baseUrl(args)}/v1/pull?${query}`);
  identity.lastRev = response.headRev;
  saveIdentity(identity);
  console.log(JSON.stringify(response, null, 2));
}

const COMMANDS: Record<string, (args: Args) => Promise<void>> = {
  serve: cmdServe,
  author: cmdAuthor,
  push: cmdPush,
  pull: cmdPull,
};

const args = parseArgs(process.argv.slice(2));
const run = COMMANDS[args.command];
if (!run) {
  console.error("usage: fundamentum-datahub <serve|author|push|pull> [options]");
  process.exit(2);
}
run(args).catch((e: Error) => {
  console.error(e.message);
  process.exit(1);
});
