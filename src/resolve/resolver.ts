/**
 * Resolver — master + user overlay の実効ビュー。
 *
 * 優先順位: user 層に live な値があればそれ。user の tombstone があれば「明示的に隠す」
 * (value=null, source=user)。どちらも無ければ catalog 経由で master を引く。
 *
 * SRP: 統合ロジックのみ。各層の読み出しは MasterStore / CatalogStore / UserStore。
 */
import type { CatalogStore } from "../master/catalog.js";
import type { MasterStore } from "../master/master-store.js";
import type { Resolved } from "../types.js";
import type { UserStore } from "../user/user-store.js";

export class Resolver {
  constructor(
    private readonly master: MasterStore,
    private readonly catalog: CatalogStore,
    private readonly user: UserStore,
  ) {}

  /**
   * scope / catalog / 論理名 から実効値を解決する。
   * - user に live → source "user"
   * - user に tombstone → source "user"・value null (master を隠す)
   * - user 無し & catalog に該当 → source "master"
   * - いずれも無し → source "none"
   */
  async resolve(scope: string, catalogName: string, name: string): Promise<Resolved> {
    const userRecord = await this.user.getRecord(scope, name);
    if (userRecord) {
      return {
        key: name,
        value: userRecord.deleted ? null : userRecord.value,
        source: "user",
        id: null,
      };
    }

    const catalog = await this.catalog.latest(catalogName);
    const id = catalog?.entries[name];
    if (!id) {
      return { key: name, value: null, source: "none", id: null };
    }
    const value = await this.master.get(id);
    return { key: name, value, source: "master", id };
  }

  /**
   * catalog の全論理名 ∪ user の live key を解決して名前順に返す。
   * 「規定 + 利用側調整」の実効データセット一覧。
   */
  async resolveAll(scope: string, catalogName: string): Promise<Resolved[]> {
    const catalog = await this.catalog.latest(catalogName);
    const names = new Set<string>(catalog ? Object.keys(catalog.entries) : []);
    for (const key of await this.user.list(scope)) names.add(key);

    const out: Resolved[] = [];
    for (const name of [...names].sort()) {
      out.push(await this.resolve(scope, catalogName, name));
    }
    return out;
  }
}
