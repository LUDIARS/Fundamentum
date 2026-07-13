// render_model — API レスポンス → 表示行 (純関数)。panel.mjs はこれを描画するだけ。
// level: "ok" | "warn" | "error"

export function healthLine(health) {
  const llm = `LLM: 競合=${health.llm?.conflict ? "有効" : "無効"} / 検査=${health.llm?.sensitive ? "有効" : "無効"}`;
  return {
    level: health.ok ? "ok" : "error",
    text: `接続 OK — headRev=${health.headRev} / records=${health.records} / authors=${health.authors} (${llm})`,
  };
}

export function pushResponseLines(response) {
  const lines = [];
  for (const r of response.results ?? []) {
    const target = `${r.kind}/${r.id}`;
    switch (r.status) {
      case "committed":
        lines.push({ level: "ok", text: `push ${target} → rev ${r.rev} を受領` });
        break;
      case "unchanged":
        lines.push({ level: "ok", text: `push ${target} → 変更なし (rev ${r.rev})` });
        break;
      case "resolved-incoming":
        lines.push({
          level: "warn",
          text: `push ${target} → 競合を自動解決 (こちらを採用, rev ${r.rev}, ${r.resolution?.mode}): ${r.resolution?.reason}`,
        });
        break;
      case "resolved-current":
        lines.push({
          level: "warn",
          text: `push ${target} → 競合を自動解決 (hub 側を維持, head rev ${r.headRev}, ${r.resolution?.mode}): ${r.resolution?.reason}。pull して取り込んでください`,
        });
        break;
      case "conflict":
        lines.push({
          level: "error",
          text: `push ${target} → 自動解決不能 (${r.reason})。手動解決が必要: ${r.conflictId}`,
        });
        break;
      case "rejected-sensitive":
        lines.push({
          level: "error",
          text: `push ${target} → センシティブ検査で遮断 [${r.category}] ${r.reason}`,
        });
        break;
      default:
        lines.push({ level: "error", text: `push ${target} → エラー: ${r.error ?? r.status}` });
    }
  }
  lines.push({ level: "ok", text: `hub headRev = ${response.headRev}` });
  return lines;
}

export function pullResponseLines(response, since) {
  const records = response.records ?? [];
  const lines = [
    {
      level: "ok",
      text: `pull since=${since} → ${records.length} 件の差分 (headRev=${response.headRev})`,
    },
  ];
  for (const rec of records) {
    const resolved = rec.resolution ? ` [競合解決: ${rec.resolution.mode}/${rec.resolution.winner}]` : "";
    lines.push({
      level: "ok",
      text: `  rev ${rec.rev}: ${rec.kind}/${rec.id} (${rec.payload?.format}) by ${rec.author.slice(0, 8)}…${resolved}`,
    });
  }
  return lines;
}

export function conflictLines(conflicts) {
  return (conflicts ?? []).map((c) => ({
    level: "error",
    text: `pending ${c.conflictId}: ${c.kind}/${c.id} (baseRev=${c.baseRev}, head=${c.headRev}) — ${c.reason}`,
  }));
}

export function errorLine(error) {
  return { level: "error", text: String(error?.message ?? error) };
}

/** author uuid → 表示名の突き合わせ (台帳に無ければ短縮 uuid) */
export function authorDisplayName(authors, uuid) {
  const hit = (authors ?? []).find((a) => a.author === uuid);
  return hit?.name ?? `${uuid.slice(0, 8)}…`;
}
