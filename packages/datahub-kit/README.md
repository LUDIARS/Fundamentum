# @fundamentum/datahub-kit — datahub 組み込みキット

Fundamentum datahub (中央集権 push/pull hub) をアプリへ組み込むための一式。
**push/pull クライアント + レスポンス表示 UI (`<fm-datahub-panel>`) + 設定 +
Fm 用データテスト** を同梱する。依存ゼロ・ブラウザ / Node 両用。

## 同梱物

| ファイル | 役割 |
|---|---|
| `src/client.mjs` | fetch クライアント (`DatahubClient`) + ブラウザ Author identity (PC 単位 UUIDv4, localStorage) |
| `src/panel.mjs` | `<fm-datahub-panel>` — push/pull 実行 + レスポンス (採番 rev / 競合解決 / 遮断) の逐次表示 + pending 競合の手動解決 |
| `src/render_model.mjs` | レスポンス → 表示行の純関数 (パネル非依存で再利用可) |
| `src/config.mjs` | 接続先解決 (明示 > localStorage > hub 同一オリジン > 既定 4220) |
| `ui/index.html` | テストコンソール (datahub の `/ui` から配信) |
| `tests/kit.test.mjs` | Fm 用データテスト — 実サーバ起動 + 全 format の push→pull 往復検証 |

## 組み込み手順

1. **配信**: ES モジュールなので http(s) 配信が必要 (file:// 不可)。最短は datahub の
   同梱配信を使う — hub 起動後 `http://127.0.0.1:<port>/ui/` でテストコンソール、
   `/ui/kit/*.mjs` で本キットが配信される。自前アプリに置く場合はこのディレクトリを
   コピーして同一オリジンに置く。
2. **identity**: `loadBrowserIdentity()` で PC 単位の UUIDv4 を取得 (無ければ生成・保存)。
   Node 側は datahub CLI (`author` コマンド) と同じ author ファイルを使う。
3. **クライアント**: `new DatahubClient({ author, name, baseUrl? })`。
   baseUrl 省略時は `config.mjs` の解決順に従う。
4. **パネル**:

```html
<fm-datahub-panel id="sync"></fm-datahub-panel>
<script type="module">
  import { DatahubClient, loadBrowserIdentity } from "./kit/client.mjs";
  import "./kit/panel.mjs";

  const identity = loadBrowserIdentity();
  const client = new DatahubClient({ author: identity.author, name: identity.name });
  document.getElementById("sync").configure({
    client,
    // push するデータをアプリから供給する (baseRev はパネルが既知 rev から補完)
    getPayloadItems: async () => [
      { kind: "myapp.settings", id: "main", payload: { format: "json", data: getSettings() } },
    ],
    // pull した差分をアプリへ反映する
    applyRecords: (records) => records.forEach(applyRecord),
  });
</script>
```

5. **表示名**: 初回はパネルの「名前登録」で表示名を hub 台帳へ登録する
   (未登録 author の push は拒否される)。

## データテストの実行

```sh
# 事前に datahub をビルドしておく
cd ../../datahub && npm install && npm run build
cd ../packages/datahub-kit && npm test
```

## 注意

- **共有データのみ** push する。センシティブ検査対象 kind (既定 ON) は
  Haiku 検査で遮断されることがある — レスポンスの `rejected-sensitive` を見る。
- ポートの正本は Excubitor catalog (`fundamentum-datahub`)。
