// config — datahub-kit の接続設定。
// ポートの正本は Excubitor catalog (fundamentum-datahub)。ここの既定値は
// datahub/config/datahub.json の port と揃えた fallback。
// 優先順: 明示指定 > localStorage 上書き > hub 同一オリジン (/ui 配信時) > 既定値。

export const DEFAULT_HUB_URL = "http://127.0.0.1:4220";

const STORAGE_KEY = "fm-datahub-base-url";

/**
 * ブラウザ実行時の base URL を解決する。
 * datahub の /ui から配信されている場合は同一オリジン ("") を使う。
 */
export function resolveBaseUrl(explicit) {
  if (explicit !== undefined && explicit !== null) return explicit;
  if (typeof location !== "undefined") {
    const stored = safeLocalStorageGet(STORAGE_KEY);
    if (stored) return stored;
    if (location.pathname.startsWith("/ui/")) return ""; // hub 同一オリジン
  }
  return DEFAULT_HUB_URL;
}

export function setStoredBaseUrl(url) {
  if (typeof localStorage === "undefined") {
    throw new Error("[datahub-kit] localStorage が使えない環境では base URL を保存できません");
  }
  localStorage.setItem(STORAGE_KEY, url);
}

function safeLocalStorageGet(key) {
  try {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(key);
  } catch {
    // file:// 等で localStorage が拒否される環境は保存なし扱い
    return null;
  }
}
