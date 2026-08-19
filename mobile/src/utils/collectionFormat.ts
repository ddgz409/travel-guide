/** 共享收藏夹展示文案 */

export function formatSubscriberCount(n: number): string {
  if (n >= 100) return "99+ 订阅";
  return `${n} 订阅`;
}

export function formatCollectionMeta(placeCount: number, subscriberCount: number): string {
  return `${placeCount} 地点  |  ${formatSubscriberCount(subscriberCount)}`;
}
