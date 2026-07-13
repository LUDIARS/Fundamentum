// panel — <fm-datahub-panel> custom element。
// push/pull を実行し、そのレスポンス (採番 rev / 競合解決 / 遮断 / エラー) を逐次表示する。
// ホストアプリは configure() で client と payload の取得/適用コールバックを渡す。
// 表示行の生成は render_model.mjs (純関数) に分離。

import {
  authorDisplayName,
  conflictLines,
  errorLine,
  healthLine,
  pullResponseLines,
  pushResponseLines,
} from "./render_model.mjs";

const STYLE = `
  :host { display: block; font: 12px/1.6 system-ui, sans-serif; color: #ddd;
          background: #22252a; border: 1px solid #3a3f46; border-radius: 8px; }
  .head { padding: 8px 10px; border-bottom: 1px solid #3a3f46; display: flex;
          align-items: center; gap: 8px; flex-wrap: wrap; }
  .head b { color: #fff; }
  .status { flex: 1 1 100%; color: #9ab; }
  input[type=text] { background: #16181c; color: #eee; border: 1px solid #3a3f46;
          border-radius: 6px; padding: 4px 8px; width: 10em; }
  button { background: #31363e; color: #eee; border: 1px solid #4a505a;
          border-radius: 6px; padding: 4px 10px; cursor: pointer; }
  button:hover { background: #3c424c; }
  button.primary { background: #2b5e9c; border-color: #3a76bd; }
  button:disabled { opacity: .5; cursor: wait; }
  .log { max-height: 220px; overflow-y: auto; padding: 8px 10px; margin: 0;
         list-style: none; }
  .log li { white-space: pre-wrap; word-break: break-all; }
  .log .ok { color: #9fd49f; }
  .log .warn { color: #e6c46a; }
  .log .error { color: #ef8f8f; }
  .log .ts { color: #778; margin-right: .5em; }
  .conflicts { border-top: 1px solid #3a3f46; padding: 6px 10px; }
  .conflicts:empty { display: none; }
  .conflicts .row { display: flex; gap: 6px; align-items: center; margin: 2px 0; }
  .conflicts .row span { flex: 1; color: #ef8f8f; }
`;

export class FmDatahubPanel extends HTMLElement {
  #client = null;
  #getPayloadItems = null;
  #applyRecords = null;
  /** (kind\nid) → 既知 rev。push の baseRev をここから埋める */
  #revMap = new Map();
  #sinceRev = 0;

  /**
   * @param {{client: import("./client.mjs").DatahubClient,
   *          getPayloadItems: () => Promise<Array<{kind,id,payload}>>,
   *          applyRecords?: (records: Array<object>) => void}} options
   */
  configure(options) {
    if (!options?.client || typeof options.getPayloadItems !== "function") {
      throw new Error("[fm-datahub-panel] configure({client, getPayloadItems}) が必要です");
    }
    this.#client = options.client;
    this.#getPayloadItems = options.getPayloadItems;
    this.#applyRecords = options.applyRecords ?? null;
    if (this.isConnected) this.#init();
  }

  connectedCallback() {
    if (!this.shadowRoot) {
      const root = this.attachShadow({ mode: "open" });
      root.innerHTML = `
        <style>${STYLE}</style>
        <div class="head">
          <b>datahub 同期</b>
          <input type="text" id="name" placeholder="表示名" />
          <button id="register">名前登録</button>
          <button id="push" class="primary">Push</button>
          <button id="pull">Pull</button>
          <button id="refresh">状態更新</button>
          <div class="status" id="status">未接続</div>
        </div>
        <ul class="log" id="log"></ul>
        <div class="conflicts" id="conflicts"></div>
      `;
      root.getElementById("register").addEventListener("click", () => this.#registerName());
      root.getElementById("push").addEventListener("click", () => this.#push());
      root.getElementById("pull").addEventListener("click", () => this.#pull());
      root.getElementById("refresh").addEventListener("click", () => this.#refresh());
    }
    if (this.#client) this.#init();
  }

  #init() {
    const nameInput = this.shadowRoot.getElementById("name");
    if (this.#client.name) nameInput.value = this.#client.name;
    void this.#refresh();
  }

  async #refresh() {
    await this.#busy(async () => {
      const health = await this.#client.health();
      this.shadowRoot.getElementById("status").textContent = healthLine(health).text;
      this.#appendLines([healthLine(health)]);
      const { conflicts } = await this.#client.conflicts();
      this.#renderConflicts(conflicts);
    });
  }

  async #registerName() {
    const name = this.shadowRoot.getElementById("name").value.trim();
    if (!name) {
      this.#appendLines([{ level: "error", text: "表示名を入力してください" }]);
      return;
    }
    await this.#busy(async () => {
      await this.#client.registerAuthor(name);
      this.#appendLines([{ level: "ok", text: `表示名を登録: ${name} (${this.#client.author.slice(0, 8)}…)` }]);
    });
  }

  async #push() {
    await this.#busy(async () => {
      const items = await this.#getPayloadItems();
      if (!Array.isArray(items) || items.length === 0) {
        this.#appendLines([{ level: "error", text: "push するデータがありません" }]);
        return;
      }
      const withBase = items.map((item) => ({
        baseRev: this.#revMap.get(`${item.kind}\n${item.id}`) ?? 0,
        ...item,
      }));
      const response = await this.#client.push(withBase);
      for (const r of response.results) {
        if (typeof r.rev === "number") this.#revMap.set(`${r.kind}\n${r.id}`, r.rev);
      }
      this.#appendLines(pushResponseLines(response));
      const { conflicts } = await this.#client.conflicts();
      this.#renderConflicts(conflicts);
    });
  }

  async #pull() {
    await this.#busy(async () => {
      const since = this.#sinceRev;
      const response = await this.#client.pull(since);
      for (const rec of response.records) {
        this.#revMap.set(`${rec.kind}\n${rec.id}`, rec.rev);
      }
      this.#sinceRev = response.headRev;
      this.#appendLines(pullResponseLines(response, since));
      if (this.#applyRecords && response.records.length > 0) {
        this.#applyRecords(response.records);
      }
    });
  }

  async #resolve(conflictId, winner) {
    await this.#busy(async () => {
      const result = await this.#client.resolveConflict(conflictId, winner);
      this.#appendLines(pushResponseLines({ results: [result], headRev: result.rev ?? result.headRev }));
      const { conflicts } = await this.#client.conflicts();
      this.#renderConflicts(conflicts);
    });
  }

  #renderConflicts(conflicts) {
    const box = this.shadowRoot.getElementById("conflicts");
    box.innerHTML = "";
    const lines = conflictLines(conflicts);
    conflicts.forEach((conflict, i) => {
      const row = document.createElement("div");
      row.className = "row";
      const label = document.createElement("span");
      label.textContent = lines[i].text;
      row.appendChild(label);
      for (const winner of ["incoming", "current"]) {
        const btn = document.createElement("button");
        btn.textContent = winner === "incoming" ? "push 側を採用" : "hub 側を維持";
        btn.addEventListener("click", () => this.#resolve(conflict.conflictId, winner));
        row.appendChild(btn);
      }
      box.appendChild(row);
    }
  }

  #appendLines(lines) {
    const log = this.shadowRoot.getElementById("log");
    const ts = new Date().toLocaleTimeString();
    for (const line of lines) {
      const li = document.createElement("li");
      li.className = line.level;
      const tsSpan = document.createElement("span");
      tsSpan.className = "ts";
      tsSpan.textContent = ts;
      li.appendChild(tsSpan);
      li.appendChild(document.createTextNode(line.text));
      log.prepend(li);
    }
  }

  async #busy(fn) {
    const buttons = this.shadowRoot.querySelectorAll("button");
    buttons.forEach((b) => (b.disabled = true));
    try {
      await fn();
    } catch (e) {
      console.error("[fm-datahub-panel]", e);
      this.#appendLines([errorLine(e)]);
    } finally {
      buttons.forEach((b) => (b.disabled = false));
    }
  }
}

// authorDisplayName は台帳表示拡張用に re-export (ツリーシェイク非前提の素朴な公開)
export { authorDisplayName };

if (typeof customElements !== "undefined" && !customElements.get("fm-datahub-panel")) {
  customElements.define("fm-datahub-panel", FmDatahubPanel);
}
