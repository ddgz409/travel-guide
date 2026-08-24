import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";

type Props = {
  destination?: string;
  /** 后端建议的天数，用于预选区间 */
  suggestDays?: number;
  disabled?: boolean;
  onConfirm: (send: string) => void;
  onSkip: (send: string) => void;
};

const WEEK = ["日", "一", "二", "三", "四", "五", "六"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function iso(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setHours(12, 0, 0, 0);
  x.setDate(x.getDate() + n);
  return x;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 12, 0, 0, 0);
}

/**
 * 规划追问日历：点击两下选择出发 / 返程区间。
 * 第一次点击 = 出发日；第二次点击 = 返程日（早于出发则重新开始选）；
 * 已有完整区间时再点击 = 重新选择新的出发日。
 */
export function ChatDatePickerCard({
  destination,
  suggestDays = 3,
  disabled,
  onConfirm,
  onSkip,
}: Props) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    return d;
  }, []);

  // 预选：明天出发，按后端建议天数给出一整段区间，可直接确认也可重选
  const initialStart = useMemo(() => addDays(today, 1), [today]);
  const initialEnd = useMemo(
    () => addDays(initialStart, Math.max(2, Math.min(suggestDays, 14)) - 1),
    [initialStart, suggestDays],
  );

  const [viewMonth, setViewMonth] = useState(() => startOfMonth(today));
  const [range, setRange] = useState<{ s: Date; e: Date } | null>({
    s: initialStart,
    e: initialEnd,
  });

  const monthLabel = `${viewMonth.getFullYear()}年${viewMonth.getMonth() + 1}月`;

  const cells = useMemo(() => {
    const first = startOfMonth(viewMonth);
    const startPad = first.getDay();
    const daysInMonth = new Date(
      viewMonth.getFullYear(),
      viewMonth.getMonth() + 1,
      0,
    ).getDate();
    const out: (Date | null)[] = [];
    for (let i = 0; i < startPad; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      out.push(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), d, 12, 0, 0, 0));
    }
    return out;
  }, [viewMonth]);

  const nights =
    range && range.e.getTime() >= range.s.getTime()
      ? Math.round((range.e.getTime() - range.s.getTime()) / 86400000)
      : 0;
  const totalDays = nights + 1;
  const pickingEnd = range != null && range.s.getTime() === range.e.getTime();

  function prevMonth() {
    setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1, 12, 0, 0, 0));
  }

  function nextMonth() {
    setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1, 12, 0, 0, 0));
  }

  function handleTapDay(cell: Date) {
    if (!range || (range.s.getTime() !== range.e.getTime())) {
      // 没有选择或已有完整区间：本次点击作为新的出发日
      setViewMonth(startOfMonth(cell));
      setRange({ s: cell, e: cell });
      return;
    }
    // 正在等返程日
    if (cell.getTime() < range.s.getTime()) {
      // 点了更早的日期：视为新的出发日
      setRange({ s: cell, e: cell });
      return;
    }
    setRange({ s: range.s, e: cell });
  }

  function handleConfirm() {
    if (!range || pickingEnd) return;
    const dest = destination ? `去${destination}` : "";
    onConfirm(
      `我想 ${iso(range.s)} 出发${dest ? ` ${dest}` : ""}，玩 ${totalDays} 天（到 ${iso(range.e)}）`,
    );
  }

  function dayStyle(cell: Date) {
    if (!range) return null;
    const t = cell.getTime();
    const s = range.s.getTime();
    const e = range.e.getTime();
    if (t === s || t === e) return styles.dayEndpoint;
    if (t > s && t < e) return styles.dayInRange;
    return null;
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.monthRow}>
        <Pressable onPress={prevMonth} hitSlop={8} disabled={disabled}>
          <Text style={styles.nav}>‹</Text>
        </Pressable>
        <Text style={styles.monthLabel}>{monthLabel}</Text>
        <Pressable onPress={nextMonth} hitSlop={8} disabled={disabled}>
          <Text style={styles.nav}>›</Text>
        </Pressable>
      </View>
      <View style={styles.weekRow}>
        {WEEK.map((w) => (
          <Text key={w} style={styles.weekCell}>
            {w}
          </Text>
        ))}
      </View>
      <View style={styles.grid}>
        {cells.map((cell, i) => {
          if (!cell) return <View key={`e-${i}`} style={styles.dayCell} />;
          const past = cell.getTime() < today.getTime();
          const kind = past ? null : dayStyle(cell);
          return (
            <Pressable
              key={iso(cell)}
              style={[styles.dayCell, kind]}
              disabled={disabled || past}
              onPress={() => handleTapDay(cell)}
            >
              <Text
                style={[
                  styles.dayText,
                  kind === styles.dayEndpoint && styles.dayTextEndpoint,
                  past && styles.dayTextPast,
                ]}
              >
                {cell.getDate()}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.hint}>
        {!range
          ? "点一下选出发日，再点一下选返程日"
          : pickingEnd
            ? `出发 ${range.s.getMonth() + 1}月${range.s.getDate()}日 · 请再点返程日期`
            : `${range.s.getMonth() + 1}月${range.s.getDate()}日 – ${range.e.getMonth() + 1}月${range.e.getDate()}日 · 共 ${totalDays} 天 ${nights} 晚`}
      </Text>

      <View style={styles.actions}>
        <Pressable
          style={[styles.skipBtn, disabled && styles.disabled]}
          disabled={disabled}
          onPress={() => onSkip("出发日期暂不设置")}
        >
          <Text style={styles.skipText}>暂不设置</Text>
        </Pressable>
        <Pressable
          style={[
            styles.confirmBtn,
            (disabled || !range || pickingEnd) && styles.disabled,
          ]}
          disabled={disabled || !range || pickingEnd}
          onPress={handleConfirm}
        >
          <Text style={styles.confirmText}>
            确认{range && !pickingEnd ? `（${totalDays} 天 ${nights} 晚）` : ""}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg,
    borderRadius: 16,
    borderCurve: "continuous",
    padding: 12,
  },
  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  nav: { fontSize: 22, color: colors.ink, fontWeight: "700", paddingHorizontal: 8 },
  monthLabel: { fontSize: 15, fontWeight: "700", color: colors.ink },
  weekRow: { flexDirection: "row", marginBottom: 4 },
  weekCell: {
    flex: 1,
    textAlign: "center",
    fontSize: 11,
    color: colors.muted,
    fontWeight: "600",
  },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  dayCell: {
    width: "14.2857%",
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  dayEndpoint: {
    backgroundColor: colors.ink,
    borderRadius: 999,
  },
  dayInRange: {
    backgroundColor: colors.brandSoft ?? "#eee",
  },
  dayPast: { opacity: 0.3 },
  dayText: { fontSize: 14, color: colors.ink },
  dayTextEndpoint: { color: "#fff", fontWeight: "700" },
  dayTextPast: { color: colors.muted },
  hint: { fontSize: 12, color: colors.muted, marginTop: 6, textAlign: "center" },
  actions: { flexDirection: "row", gap: 8, marginTop: 12 },
  skipBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 22,
    borderCurve: "continuous",
    paddingVertical: 11,
    alignItems: "center",
    backgroundColor: colors.card,
  },
  skipText: { fontSize: 14, color: colors.muted, fontWeight: "600" },
  confirmBtn: {
    flex: 1,
    backgroundColor: colors.ink,
    borderRadius: 22,
    borderCurve: "continuous",
    paddingVertical: 11,
    alignItems: "center",
  },
  confirmText: { fontSize: 14, color: "#fff", fontWeight: "700" },
  disabled: { opacity: 0.45 },
});
