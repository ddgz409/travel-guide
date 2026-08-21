/** 共享收藏夹展示文案 */

export function formatSubscriberCount(n: number): string {
  if (n >= 100) return "99+ 订阅";
  return `${n} 订阅`;
}

export function formatCollectionMeta(
  placeCount: number,
  subscriberCount: number,
  likeCount = 0,
): string {
  const base = `${placeCount} 地点  |  ${formatSubscriberCount(subscriberCount)}`;
  return likeCount > 0 ? `${base}  |  ♥ ${likeCount}` : base;
}
