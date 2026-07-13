/**
 * obs/vestigium — Vestigium (Vg) ログ統合。Anatomia の obs パターンを踏襲。
 * 明示 init (serve 時のみ)。vgWrite は init 前 / 無効時 no-op でどの層からも安全に呼べる。
 * ctx に機微情報 (payload 生データ / 検知値) を入れない (redact 原則と同根)。
 */
import { install, type Vestigium } from "@ludiars/vestigium";

let vg: Vestigium | null = null;

export function initVestigium(): void {
  if (vg) return;
  if (process.env.FUNDAMENTUM_DATAHUB_VESTIGIUM === "0" || process.env.NODE_ENV === "test") {
    return;
  }
  try {
    vg = install({
      serviceCode: "fundamentum-datahub",
      captureConsole: true,
      retentionDays: Number(process.env.VESTIGIUM_RETENTION_DAYS ?? "14") || 14,
    });
  } catch (e) {
    // install 失敗 (権限/パス等) は Vg ログを諦めるが hub 本体は止めない
    console.error(`[datahub/vestigium] install 失敗; Vg ログ無効: ${(e as Error).message}`);
  }
}

export type VgLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export function vgWrite(level: VgLevel, msg: string, ctx?: Record<string, unknown>): void {
  try {
    vg?.writer.write({ level, msg, ctx });
  } catch {
    /* logging から throw しない */
  }
}

export async function vgShutdown(): Promise<void> {
  try {
    await vg?.shutdown();
  } catch {
    /* shutdown 中の失敗は握る (best-effort) */
  }
  vg = null;
}

export function installCrashLogging(): void {
  if (process.env.NODE_ENV === "test") return;
  process.on("uncaughtException", (err) => {
    vgWrite("fatal", "[datahub-crash] uncaughtException", { message: err.message, stack: err.stack });
    console.error("[fatal] uncaughtException", err);
    void vgShutdown().finally(() => process.exit(1));
  });
  process.on("unhandledRejection", (reason) => {
    vgWrite("fatal", "[datahub-crash] unhandledRejection", { reason: String(reason) });
    console.error("[fatal] unhandledRejection", reason);
    void vgShutdown().finally(() => process.exit(1));
  });
}
