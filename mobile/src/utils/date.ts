/** 跨屏共享的日期工具，合并自 GenerateScreen 与 TripsScreen */

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function plusDaysISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 解析 "YYYY-MM-DD"（本地时区，正午避夏令时漂移） */
export function parseDate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s.includes("T") ? s : `${s}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 解析 "YYYY-MM-DD" 为本地 Date（GenerateScreen 用的版本，失败回退今天） */
export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d);
}

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatDisplayDate(iso: string): string {
  const date = parseISODate(iso);
  if (Number.isNaN(date.getTime())) return iso || "选择日期";
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

/** "MM.DD" 简短显示，TripsScreen 用 */
export function fmtMd(s: string): string {
  const d = parseDate(s);
  if (!d) return s || "-";
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${m}.${day}`;
}
