/** 从完整分享链接或裸 token 中提取 share token */
const SHARE_TOKEN_RE = /\/share\/([A-Za-z0-9_-]+)/;

export function extractShareToken(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  const m = SHARE_TOKEN_RE.exec(text);
  if (m) return m[1];
  // 裸 token（URL-safe base64 风格）
  if (/^[A-Za-z0-9_-]{8,}$/.test(text)) return text;
  return null;
}
