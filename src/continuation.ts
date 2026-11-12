export function continuationText(page: number, total: number): string {
  return `${page + 1} / ${total} 段${page + 1 < total ? '　→ 次段へ接続' : ''}${page > 0 ? '　（前段からの続き）' : ''}`;
}
