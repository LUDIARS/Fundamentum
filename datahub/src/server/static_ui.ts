/**
 * server/static_ui — /ui の静的配信。datahub-kit のテストコンソール (ui/) と
 * kit 本体 (src/) を datahub と同一オリジンで配る (file:// では ES モジュールが
 * 動かないため、hub 経由で開くのが正式経路)。
 *   /ui/<file>      → <repo>/packages/datahub-kit/ui/<file>
 *   /ui/kit/<file>  → <repo>/packages/datahub-kit/src/<file>
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import type { ServerResponse } from "node:http";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

export class StaticUi {
  private readonly uiDir: string;
  private readonly kitDir: string;

  constructor(repoRootDir: string) {
    this.uiDir = resolve(repoRootDir, "packages", "datahub-kit", "ui");
    this.kitDir = resolve(repoRootDir, "packages", "datahub-kit", "src");
  }

  /** /ui 配下のリクエストを処理したら true */
  serve(urlPath: string, res: ServerResponse): boolean {
    if (urlPath === "/ui" || urlPath === "/ui/") {
      res.writeHead(302, { location: "/ui/index.html" });
      res.end();
      return true;
    }
    if (!urlPath.startsWith("/ui/")) return false;

    const rel = decodeURIComponent(urlPath.slice("/ui/".length));
    const file = rel.startsWith("kit/")
      ? this.safeJoin(this.kitDir, rel.slice("kit/".length))
      : this.safeJoin(this.uiDir, rel);
    if (!file || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: { code: "not-found", message: urlPath } }));
      return true;
    }
    res.writeHead(200, {
      "content-type": CONTENT_TYPES[extname(file)] ?? "application/octet-stream",
    });
    res.end(readFileSync(file));
    return true;
  }

  /** パストラバーサル防止: root の外へ出る解決結果は拒否 */
  private safeJoin(root: string, rel: string): string | null {
    const abs = normalize(join(root, rel));
    return abs === root || abs.startsWith(root + sep) ? abs : null;
  }
}
