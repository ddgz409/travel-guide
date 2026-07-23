import type { Trip, TripListItem, TripStatus } from "@travel-guide/shared";
import { parseDate, fmtMd } from "../../utils/date";

export { fmtMd };

export function tripDaysNights(start: string, end: string): { days: number; nights: number } {
  const a = parseDate(start);
  const b = parseDate(end);
  if (!a || !b) return { days: 1, nights: 0 };
  const days = Math.max(1, Math.round((b.getTime() - a.getTime()) / 86400000) + 1);
  return { days, nights: Math.max(0, days - 1) };
}

export function tripPhase(item: TripListItem): {
  label: string;
  tone: "done" | "live" | "soon" | "busy" | "fail";
} {
  if (item.status === "generating") return { label: "生成中", tone: "busy" };
  if (item.status === "failed") return { label: "生成失败", tone: "fail" };
  const end = parseDate(item.end_date);
  const start = parseDate(item.start_date);
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  if (end && end < now) return { label: "行程已结束", tone: "done" };
  if (start && end && start <= now && now <= end) {
    return { label: "行程进行中", tone: "live" };
  }
  return { label: "即将出发", tone: "soon" };
}

export function statusLabel(s: TripStatus): string {
  if (s === "ready") return "已完成";
  if (s === "generating") return "生成中";
  return "失败";
}

export function tripToListItem(t: Trip): TripListItem {
  return {
    id: t.id,
    title: t.title,
    destination: t.destination,
    start_date: t.start_date,
    end_date: t.end_date,
    travelers: t.travelers,
    budget_total: t.budget_total,
    status: t.status,
    created_at: t.created_at,
  };
}
