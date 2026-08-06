/** 从高德 tel 字段提取可拨打号码 */

export function firstDialablePhone(tel?: string | null): string | null {
  if (!tel) return null;
  const part = tel.split(/[;,|/]/)[0]?.trim();
  if (!part || part === "-" || part === "暂无") return null;
  const digits = part.replace(/[^\d+]/g, "");
  if (digits.length < 7) return null;
  return part;
}

export function telDialUri(tel: string): string {
  const digits = tel.replace(/[^\d+]/g, "");
  return `tel:${digits}`;
}
