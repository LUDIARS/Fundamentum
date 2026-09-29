# SPEC-FM-FULL-JAPANESE-STROKES — 日本語収録全体の固定版取り込み

価値ID FM-FULL-JA-001。Fmが原典・権利・固定版カタログを所有し、利用側が配布向けに小分けにする。
AnimCJK ec5e17cca76c87587790bcbce5ea0b4d4fb753d6 の svgsJa 7007文字と svgsJaKana 177文字、計7184文字を対象とする。Unicode全体ではない。

`data-sources/animcjk-japanese.lock.json` はアーカイブSHA-256、各SVGの相対パス・長さ・SHA-256と全文字選択を固定する。
`scripts/strokes/local-tracing-source.mjs` の `localTracingSource` はディレクトリから読むSVGの版・パス・サイズ・内容を検証し、欠損や改変をエラーにする。
`scripts/strokes/import-tracing.mjs` の第6・第7引数に原典ディレクトリとmanifestを指定すると、既存の正規化・不変カタログ保存を全量に適用する。従来のネットワーク取得も明示的に選択可能。

原典入手: https://codeload.github.com/parsimonhi/animCJK/tar.gz/ec5e17cca76c87587790bcbce5ea0b4d4fb753d6
固定SHA-256: a14501be93d89a27d7b8d62af4a0b3a98e2367a68597762eb8337bcb0170fea1
展開時は svgsJa と svgsJaKana の数値名SVGのみを扱う。Lwの実行時はFmネットワークへ依存しない。

取り込み例: `node scripts/strokes/import-tracing.mjs data-sources/animcjk-japanese.lock.json data-sources/animcjk.lock.json <license-cache> <store> <export.json> <svg-root> data-sources/animcjk-japanese.lock.json`

ライセンス、画番号、原典SVG保持は SPEC-FM-TRACING-GROUPS に従う。原典全文字で正規化を完了し、欠落を許さない。検証: 固定版7184文字で取り込み・カタログ化し、出力数を照合する。画面体験は利用側で別途検証する。
