/**
 * util/mutex — push 処理の直列化用の簡易 async mutex。
 * rev 採番と head 判定を LLM 待ちを跨いで一貫させるために使う。
 */
export class AsyncMutex {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.tail.then(fn, fn);
    // 後続を前段の失敗で巻き込まない (エラーは run の戻り値でだけ伝播する)
    this.tail = next.catch(() => undefined);
    return next;
  }
}
