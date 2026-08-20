import React, { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { TripStatus } from "@travel-guide/shared";
import { CityCoverImage } from "./PlaceImage";
import { landmarksFor } from "../data/landmarks";
import { colors, pastels } from "../theme";
import { fmtMd, tripDaysNights, tripPhase } from "../screens/Trips/helpers";

export type AgentTripSummary = {
  trip_id: string;
  title: string;
  destination: string;
  start_date: string;
  end_date: string;
  travelers: number;
  status: string;
};

type Props = {
  visible: boolean;
  trips: AgentTripSummary[];
  message?: string | null;
  onClose: () => void;
  onSelect: (tripId: string) => void;
};

/** Agent 查行程列表时的卡片弹窗 */
export function TripListSheet({
  visible,
  trips,
  message,
  onClose,
  onSelect,
}: Props) {
  const [filterText, setFilterText] = useState("");
  const kw = filterText.trim().toLowerCase();
  const filtered = kw
    ? trips.filter(
        (t) =>
          (t.title || "").toLowerCase().includes(kw) ||
          (t.destination || "").toLowerCase().includes(kw),
      )
    : trips;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <View style={styles.handle} />
          <Text style={styles.title}>我的行程</Text>
          <Text style={styles.sub}>
            {trips.length > 0
              ? kw
                ? `筛选出 ${filtered.length} / 共 ${trips.length} 条，点击查看详情`
                : `共 ${trips.length} 条，点击查看详情`
              : message || "暂无行程记录"}
          </Text>

          {trips.length > 0 ? (
            <View style={styles.searchBox}>
              <TextInput
                style={styles.searchInput}
                value={filterText}
                onChangeText={setFilterText}
                placeholder="搜索目的地或标题"
                placeholderTextColor="#9ca3af"
                returnKeyType="search"
                autoCorrect={false}
              />
              {filterText.length > 0 ? (
                <Pressable
                  style={styles.searchClear}
                  hitSlop={8}
                  onPress={() => setFilterText("")}
                >
                  <Text style={styles.searchClearText}>✕</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {trips.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyEmoji}>🧳</Text>
              <Text style={styles.emptyText}>
                {message || "还没有行程，去首页规划一次吧"}
              </Text>
            </View>
          ) : filtered.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyEmoji}>🔍</Text>
              <Text style={styles.emptyText}>没有找到匹配「{kw}」的行程</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.list}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {filtered.map((item, index) => {
                const listItem = {
                  id: item.trip_id,
                  title: item.title,
                  destination: item.destination,
                  start_date: item.start_date,
                  end_date: item.end_date,
                  travelers: item.travelers,
                  status: item.status as TripStatus,
                  budget_total: null,
                  created_at: "",
                };
                const phase = tripPhase(listItem);
                const { days, nights } = tripDaysNights(
                  item.start_date,
                  item.end_date,
                );
                const landmark =
                  landmarksFor(item.destination)[0] || item.destination;
                const bg = pastels[index % pastels.length];

                return (
                  <Pressable
                    key={item.trip_id}
                    style={[styles.card, { backgroundColor: bg }]}
                    onPress={() => {
                      onClose();
                      onSelect(item.trip_id);
                    }}
                  >
                    <View style={styles.cardTop}>
                      <View style={styles.cardText}>
                        <View style={styles.badgeRow}>
                          <View
                            style={[
                              styles.badgeDot,
                              phase.tone === "live" && styles.dotLive,
                              phase.tone === "busy" && styles.dotBusy,
                              phase.tone === "fail" && styles.dotFail,
                              phase.tone === "soon" && styles.dotSoon,
                            ]}
                          />
                          <Text style={styles.badgeText}>{phase.label}</Text>
                        </View>
                        <Text style={styles.cardTitle} numberOfLines={2}>
                          {item.title || `${item.destination}行程`}
                        </Text>
                        <Text style={styles.cardMeta}>
                          {fmtMd(item.start_date)} → {fmtMd(item.end_date)} ·{" "}
                          {days}天{nights > 0 ? `${nights}晚` : ""}
                        </Text>
                        <Text style={styles.cardMeta}>
                          {item.destination}
                          {item.travelers > 1 ? ` · ${item.travelers}人` : ""}
                        </Text>
                      </View>
                      <View style={styles.coverWrap}>
                        <CityCoverImage
                          city={item.destination}
                          landmark={landmark}
                          style={styles.cover}
                          resizeMode="cover"
                        />
                      </View>
                    </View>
                    <Text style={styles.openHint}>点击查看 ›</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeText}>关闭</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.38)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderCurve: "continuous",
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 24,
    maxHeight: "78%",
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E6E6E6",
    alignSelf: "center",
    marginBottom: 14,
  },
  title: { fontSize: 20, fontWeight: "800", color: colors.ink },
  sub: {
    marginTop: 6,
    marginBottom: 14,
    fontSize: 13,
    color: colors.muted,
  },
  list: { maxHeight: 420 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    borderRadius: 14,
    borderCurve: "continuous",
    paddingHorizontal: 12,
    marginBottom: 12,
    height: 40,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.ink, padding: 0 },
  searchClear: { padding: 4 },
  searchClearText: { fontSize: 14, color: colors.muted },
  card: {
    borderRadius: 22,
    borderCurve: "continuous",
    padding: 14,
    marginBottom: 10,
    overflow: "hidden",
  },
  cardTop: { flexDirection: "row", gap: 12 },
  cardText: { flex: 1 },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  badgeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.muted,
  },
  dotLive: { backgroundColor: "#22c55e" },
  dotBusy: { backgroundColor: colors.brand },
  dotFail: { backgroundColor: colors.danger },
  dotSoon: { backgroundColor: "#f59e0b" },
  badgeText: { fontSize: 11, fontWeight: "600", color: colors.muted },
  cardTitle: {
    marginTop: 6,
    fontSize: 17,
    fontWeight: "800",
    color: colors.ink,
  },
  cardMeta: {
    marginTop: 4,
    fontSize: 12,
    color: "rgba(26,26,26,0.72)",
    lineHeight: 18,
  },
  coverWrap: {
    width: 72,
    height: 72,
    borderRadius: 16,
    borderCurve: "continuous",
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.5)",
  },
  cover: { width: "100%", height: "100%" },
  openHint: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "600",
    color: colors.brandHot,
    textAlign: "right",
  },
  emptyBox: {
    alignItems: "center",
    paddingVertical: 28,
  },
  emptyEmoji: { fontSize: 36 },
  emptyText: {
    marginTop: 10,
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 20,
  },
  closeBtn: {
    marginTop: 12,
    backgroundColor: colors.brandSoft,
    borderRadius: 22,
    borderCurve: "continuous",
    paddingVertical: 12,
    alignItems: "center",
  },
  closeText: { color: colors.brandHot, fontWeight: "700", fontSize: 15 },
});
