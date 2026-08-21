/** 微信/浏览器打开的分享页地址（不要用 localhost）。由后端 8000 端口直接渲染 HTML 分享页 */
export const PUBLIC_SHARE_BASE =
  process.env.EXPO_PUBLIC_SHARE_BASE || "http://81.71.159.218:8000";

export function shareUrlForToken(token: string): string {
  return `${PUBLIC_SHARE_BASE.replace(/\/$/, "")}/share/${token}`;
}
