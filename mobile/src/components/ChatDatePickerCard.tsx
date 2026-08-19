import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";

type Props = {
  destination?: string;
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

/** 规划追问：日历 / 灵活天数选择 */
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

  const [tab, setTab] = useState<"fixed" | "flex">("fixed");
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(today));
  const [selected, setSelected] = useState<Date>(() => addDays(today, 1));
  const [flexDays, setFlexDays] = useState(Math.max(2, Math.min(suggestDays, 14)));

  const days = Math.max(2, Math.min(suggestDays, 14));
  const flexOptions = useMemo(() => {
    const base = [2, 3, 5, 7];
    if (!base.includes(days)) base.unshift(days);
    return [...new Set(base)].sort((a, b) => a - b).slice(0, 4);
  }, [days]);

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

  function prevMonth() {
    setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1, 12, 0, 0, 0));
  }

  function nextMonth() {
    setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1, 12, 0, 0, 0));
  }

  function handleConfirm() {
    if (tab === "flex") {
      const dest = destination ? `去${destination}` : "";
      onConfirm(`我想${dest}玩 ${flexDays} 天，日期灵活`.replace(/\s+/g, " ").trim());
      return;
    }
    const end = addDays(selected, days - 1);
    const dest = destination ? `去${destination}` : "";
    onConfirm(
      `我想 ${iso(selected)} 出发${dest ? ` ${dest}` : ""}，玩 ${days} 天（到 ${iso(end)}）`,
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.tabs}>
        <Pressable
          style={[styles.tab, tab === "fixed" && styles.tabActive]}
          onPress={() => setTab("fixed")}
          disabled={disabled}
        >
          <Text style={[styles.tabText, tab === "fixed" && styles.tabTextActive]}>
            具体日期
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, tab === "flex" && styles.tabActive]}
          onPress={() => setTab("flex")}
          disabled={disabled}
        >
          <Text style={[styles.tabText, tab === "flex" && styles.tabTextActive]}>
            灵活的天数
          </Text>
        </Pressable>
      </View>

      {tab === "fixed" ? (
        <>
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
              const active =
                iso(cell) === iso(selected) && cell.getTime() >= today.getTime();
              return (
                <Pressable
                  key={iso(cell)}
                  style={[
                    styles.dayCell,
                    active && styles.dayActive,
                    past && styles.dayPast,
                  ]}
                  disabled={disabled || past}
                  onPress={() => setSelected(cell)}
                >
                  <Text
                    style={[
                      styles.dayText,
                      active && styles.dayTextActive,
                      past && styles.dayTextPast,
                    ]}
                  >
                    {cell.getDate()}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.hint}>建议行程 {days} 天</Text>
        </>
      ) : (
        <View style={styles.flexRow}>
          {flexOptions.map((d) => (
            <Pressable
              key={d}
              style={[styles.flexChip, flexDays === d && styles.flexChipActive]}
              disabled={disabled}
              onPress={() => setFlexDays(d)}
            >
              <Text
                style={[
                  styles.flexChipText,
                  flexDays === d && styles.flexChipTextActive,
                ]}
              >
                {d} 天
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      <View style={styles.actions}>
        <Pressable
          style={[styles.skipBtn, disabled && styles.disabled]}
          disabled={disabled}
          onPress={() => onSkip("出发日期暂不设置")}
        >
          <Text style={styles.skipText}>暂不设置</Text>
        </Pressable>
        <Pressable
          style={[styles.confirmBtn, disabled && styles.disabled]}
          disabled={disabled}
          onPress={handleConfirm}
        >
          <Text style={styles.confirmText}>确认</Text>
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
  tabs: {
    flexDirection: "row",
    backgroundColor: "#eee",
    borderRadius: 12,
    borderCurve: "continuous",
    padding: 3,
    marginBottom: 10,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    borderCurve: "continuous",
    alignItems: "center",
  },
  tabActive: { backgroundColor: colors.card },
  tabText: { fontSize: 13, color: colors.muted, fontWeight: "600" },
  tabTextActive: { color: colors.ink, fontWeight: "700" },
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
  dayActive: {
    backgroundColor: colors.ink,
    borderRadius: 999,
  },
  dayPast: { opacity: 0.3 },
  dayText: { fontSize: 14, color: colors.ink },
  dayTextActive: { color: "#fff", fontWeight: "700" },
  dayTextPast: { color: colors.muted },
  hint: { fontSize: 12, color: colors.muted, marginTop: 6, textAlign: "center" },
  flexRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingVertical: 8 },
  flexChip: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 20,
    borderCurve: "continuous",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.card,
  },
  flexChipActive: {
    borderColor: colors.ink,
    backgroundColor: colors.ink,
  },
  flexChipText: { fontSize: 14, color: colors.ink, fontWeight: "600" },
  flexChipTextActive: { color: "#fff" },
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
