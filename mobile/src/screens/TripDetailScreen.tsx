import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share as RnShare,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as Clipboard from "expo-clipboard";
import * as Sharing from "expo-sharing";
import * as WebBrowser from "expo-web-browser";
import type {
  ExternalRefs,
  HotelCandidate,
  Item,
  RouteOption,
  TransportToNext,
  Trip,
} from "@travel-guide/shared";
import { ApiError } from "@travel-guide/shared";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";
import { DayMap } from "../components/DayMap";
import { TransportRouteSheet } from "../components/TransportRouteSheet";
import { colors } from "../theme";
import type { AppStackParamList } from "../navigation/types";

function normalizeExternalUrl(url: string, title?: string): string {
  let u = (url || "").trim();
  if (!u) return "";
  // 兼容旧版无效小红书 search_result 链接
  if (
    u.includes("xiaohongshu.com/search_result") &&
    !u.includes("type=")
  ) {
    const kw = encodeURIComponent((title || "旅游攻略").trim());
    u = `https://www.xiaohongshu.com/search_result?keyword=${kw}&type=51&source=web_search_result_notes`;
  }
  return u;
}

async function openExternal(url: string, title?: string) {
  const u = normalizeExternalUrl(url, title);
  if (!u) return;
  try {
    await WebBrowser.openBrowserAsync(u);
  } catch {
    await Linking.openURL(u);
  }
}

const GRID_GAP = 10;
type Props = NativeStackScreenProps<AppStackParamList, "TripDetail">;

const SLOT_LABEL: Record<string, string> = {
  morning: "上午",
  afternoon: "下午",
  evening: "晚上",
};
const TYPE_LABEL: Record<string, string> = {
  attraction: "景点",
  meal: "餐饮",
  hotel: "住宿",
  transport: "交通",
};

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  // btoa available on web; RN has global base64 via Buffer sometimes — use chunked
  if (typeof btoa === "function") return btoa(binary);
  // fallback
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  let output = "";
  for (let i = 0; i < binary.length; i += 3) {
    const a = binary.charCodeAt(i);
    const b = binary.charCodeAt(i + 1);
    const c = binary.charCodeAt(i + 2);
    const bitmap = (a << 16) | ((b || 0) << 8) | (c || 0);
    output +=
      chars.charAt((bitmap >> 18) & 63) +
      chars.charAt((bitmap >> 12) & 63) +
      (i + 1 < binary.length ? chars.charAt((bitmap >> 6) & 63) : "=") +
      (i + 2 < binary.length ? chars.charAt(bitmap & 63) : "=");
  }
  return output;
}

function ItemBlock({
  item,
  tripId,
  canEdit,
  onChanged,
}: {
  item: Item;
  tripId: string;
  canEdit: boolean;
  onChanged: (trip: Trip) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [localTransport, setLocalTransport] = useState<TransportToNext | null>(
    item.transport_to_next,
  );
  const alts = item.alternatives || [];

  useEffect(() => {
    setLocalTransport(item.transport_to_next);
  }, [item.transport_to_next]);

  async function toggle() {
    if (!canEdit) return;
    setBusy(true);
    try {
      onChanged(await api.trips.toggleItem(tripId, item.id, !item.selected));
    } catch (e) {
      Alert.alert("失败", e instanceof ApiError ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  async function swap(altIndex: number) {
    if (!canEdit) return;
    setBusy(true);
    try {
      onChanged(await api.trips.swapItem(tripId, item.id, altIndex));
    } catch (e) {
      Alert.alert("失败", e instanceof ApiError ? e.message : "换一个失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.item, !item.selected && styles.itemOff]}>
      <View style={styles.itemHead}>
        <Text style={styles.itemType}>
          {TYPE_LABEL[item.type] || item.type} ·{" "}
          {SLOT_LABEL[item.time_slot] || item.time_slot}
        </Text>
        {canEdit ? (
          <Pressable onPress={toggle} disabled={busy}>
            <Text style={styles.itemAction}>
              {item.selected ? "取消" : "恢复"}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.itemName}>{item.name}</Text>
      {item.description ? (
        <Text style={styles.itemDesc} numberOfLines={4}>
          {item.description}
        </Text>
      ) : null}
      <View style={styles.itemMetaRow}>
        {item.duration_min ? (
          <Text style={styles.itemMeta}>{item.duration_min} 分钟</Text>
        ) : null}
        {item.cost != null ? (
          <Text style={styles.itemMeta}>¥{item.cost}</Text>
        ) : null}
        {item.rating != null ? (
          <Text style={styles.itemMeta}>评分 {item.rating}</Text>
        ) : null}
      </View>
      {localTransport && item.selected ? (
        <TransportRouteSheet
          tripId={tripId}
          itemId={item.id}
          fromName={item.name}
          transport={localTransport}
          onUpdated={setLocalTransport}
        />
      ) : null}
      {canEdit && alts.length > 0 ? (
        <View style={styles.alts}>
          <Text style={styles.altsLabel}>换一个：</Text>
          {alts.slice(0, 3).map((a, i) => (
            <Pressable key={`${a.poi_id}-${i}`} onPress={() => swap(i)}>
              <Text style={styles.altChip}>{a.name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function TripDetailScreen({ route, navigation }: Props) {
  const { tripId } = route.params;
  const { user, isGuest } = useAuth();
  /** 登录用户与游客都可切换路线 / 编辑当日行程（游客攻略走 guest 账号） */
  const canEdit = Boolean(user) || isGuest;
  const [trip, setTrip] = useState<Trip | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeDay, setActiveDay] = useState(0);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.trips.get(tripId);
      setTrip(data);
      setError(null);
      return data;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "加载失败");
      return null;
    }
  }, [tripId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await load();
      if (cancelled || !data) return;
      if (data.status === "generating") {
        pollRef.current = setInterval(async () => {
          const next = await load();
          if (next && next.status !== "generating" && pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }, 2500);
      }
    })();
    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [load]);

  const days = trip?.days || [];
  const currentDay = days[activeDay] || days[0];
  const dayItems = currentDay?.items || [];
  const selectedItems = dayItems.filter((it) => it.selected);

  const budgetByType = useMemo(() => {
    const map: Record<string, number> = {};
    days.forEach((d) =>
      d.items.forEach((it) => {
        if (!it.selected) return;
        map[it.type] = (map[it.type] || 0) + (it.cost || 0);
      }),
    );
    return map;
  }, [days]);

  const totalCost = Object.values(budgetByType).reduce((a, b) => a + b, 0);
  const totalBudget =
    trip?.budget_total ?? (trip ? totalCost * trip.travelers : 0);
  const routeOptions = (trip?.preferences?.route_options ||
    []) as RouteOption[];
  const selectedRouteId =
    (trip?.preferences?.selected_route_id as string | undefined) ||
    routeOptions[0]?.id;

  async function onShare() {
    if (!trip || !user) {
      Alert.alert("提示", "登录后才能创建分享链接");
      return;
    }
    setActionBusy(true);
    try {
      const t = await api.trips.createShare(trip.id);
      setTrip(t);
      const token = t.share_token;
      if (!token) throw new Error("未返回分享令牌");
      const url = `http://localhost:3000/share/${token}`;
      await Clipboard.setStringAsync(url);
      setShareMsg(url);
      await RnShare.share({ message: `旅迹攻略：${t.title}\n${url}`, url });
    } catch (e) {
      Alert.alert("分享失败", e instanceof ApiError ? e.message : String(e));
    } finally {
      setActionBusy(false);
    }
  }

  async function onPdf() {
    if (!trip || !user) {
      Alert.alert("提示", "登录后才能导出 PDF");
      return;
    }
    setActionBusy(true);
    try {
      const buf = await api.trips.exportPdf(trip.id);
      if (Platform.OS === "web") {
        const blob = new Blob([buf], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        Linking.openURL(url);
        return;
      }
      const { File, Paths, EncodingType } = await import("expo-file-system");
      const safe = (trip.title || "trip").replace(/[^\w\u4e00-\u9fff-]+/g, "_");
      const file = new File(Paths.cache, `${safe}.pdf`);
      if (file.exists) file.delete();
      file.create();
      file.write(arrayBufferToBase64(buf), { encoding: EncodingType.Base64 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: "application/pdf" });
      } else {
        Alert.alert("已保存", file.uri);
      }
    } catch (e) {
      Alert.alert("导出失败", e instanceof ApiError ? e.message : String(e));
    } finally {
      setActionBusy(false);
    }
  }

  async function onSelectRoute(routeId: string) {
    if (!trip) return;
    if (!canEdit) {
      Alert.alert("提示", "当前无法切换路线");
      return;
    }
    if (routeId === selectedRouteId || actionBusy) return;
    setActionBusy(true);
    try {
      setTrip(await api.trips.selectRoute(trip.id, routeId));
      setActiveDay(0);
    } catch (e) {
      Alert.alert("失败", e instanceof ApiError ? e.message : "切换失败");
    } finally {
      setActionBusy(false);
    }
  }

  async function onRegenDay() {
    if (!canEdit || !currentDay || !trip) return;
    setActionBusy(true);
    try {
      setTrip(await api.trips.regenerateDay(trip.id, currentDay.day_index));
    } catch (e) {
      Alert.alert("失败", e instanceof ApiError ? e.message : "重新生成失败");
    } finally {
      setActionBusy(false);
    }
  }

  if (error && !trip) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
        <Pressable style={styles.retry} onPress={load}>
          <Text style={styles.retryText}>重试</Text>
        </Pressable>
      </View>
    );
  }

  if (!trip) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  if (trip.status === "generating") {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand} size="large" />
        <Text style={styles.generating}>正在生成攻略…</Text>
        <Text style={styles.hint}>通常需要一两分钟</Text>
      </View>
    );
  }

  if (trip.status === "failed") {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>生成失败</Text>
        <Text style={styles.hint}>{trip.error_msg || "请返回重试"}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{trip.title}</Text>
      <Text style={styles.meta}>
        {trip.destination} · {trip.start_date} → {trip.end_date} ·{" "}
        {trip.travelers} 人
        {trip.budget_total != null
          ? ` · 约 ¥${Math.round(trip.budget_total)}`
          : ""}
      </Text>

      <View style={styles.actions}>
        <Pressable
          style={[styles.actionBtn, styles.actionPrimary]}
          onPress={onShare}
          disabled={actionBusy}
        >
          <Text style={styles.actionPrimaryText}>分享</Text>
        </Pressable>
        <Pressable
          style={styles.actionBtn}
          onPress={onPdf}
          disabled={actionBusy}
        >
          <Text style={styles.actionText}>导出 PDF</Text>
        </Pressable>
        {trip.share_token ? (
          <Pressable
            style={styles.actionBtn}
            onPress={() =>
              navigation.navigate("Share", { token: trip.share_token! })
            }
          >
            <Text style={styles.actionText}>打开分享页</Text>
          </Pressable>
        ) : null}
      </View>
      {shareMsg ? (
        <Text style={styles.shareMsg} selectable>
          已复制：{shareMsg}
        </Text>
      ) : null}

      {routeOptions.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>路线方案</Text>
          {routeOptions.map((opt) => {
            const on = opt.id === selectedRouteId;
            return (
              <Pressable
                key={opt.id}
                style={[styles.routeCard, on && styles.routeCardOn]}
                onPress={() => onSelectRoute(opt.id)}
                disabled={!canEdit || actionBusy}
              >
                <Text style={styles.routeTitle}>{opt.title}</Text>
                <Text style={styles.routeTheme}>{opt.theme}</Text>
                {opt.tagline ? (
                  <Text style={styles.routeTag}>{opt.tagline}</Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.dayTabs}
        contentContainerStyle={{ gap: 8 }}
      >
        {days.map((d, i) => (
          <Pressable
            key={d.id}
            style={[styles.dayTab, i === activeDay && styles.dayTabOn]}
            onPress={() => setActiveDay(i)}
          >
            <Text
              style={[styles.dayTabText, i === activeDay && styles.dayTabTextOn]}
            >
              Day {d.day_index} · {d.date.slice(5)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {canEdit && currentDay ? (
        <Pressable
          style={styles.regen}
          onPress={onRegenDay}
          disabled={actionBusy}
        >
          <Text style={styles.regenText}>
            {actionBusy ? "处理中…" : "重新生成当天"}
          </Text>
        </Pressable>
      ) : null}

      {currentDay?.summary ? (
        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>当日亮点</Text>
          <Text style={styles.summaryText}>{currentDay.summary}</Text>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>
        精选行程 · {selectedItems.length} 个安排
      </Text>
      {dayItems.map((item) => (
        <ItemBlock
          key={item.id}
          item={item}
          tripId={trip.id}
          canEdit={canEdit}
          onChanged={setTrip}
        />
      ))}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>当日路线地图</Text>
        <DayMap
          tripId={trip.id}
          dayId={currentDay?.id}
          items={selectedItems}
          title={`第 ${currentDay?.day_index ?? activeDay + 1} 天路线`}
        />
      </View>

      <View style={styles.budget}>
        <Text style={styles.sectionTitle}>预算估算</Text>
        {Object.entries(budgetByType).map(([type, cost]) => (
          <View key={type} style={styles.budgetRow}>
            <Text style={styles.budgetLabel}>{TYPE_LABEL[type] || type}</Text>
            <Text style={styles.budgetVal}>¥{cost}</Text>
          </View>
        ))}
        <View style={[styles.budgetRow, styles.budgetTotal]}>
          <Text style={styles.budgetHint}>
            人均 ¥{Math.round(totalCost)} × {trip.travelers}
          </Text>
          <Text style={styles.budgetTotalVal}>
            ¥{Math.round(totalBudget)}
          </Text>
        </View>
      </View>

      <HotelNotesRow
        destination={trip.destination}
        status={trip.hotel_fetch_status}
        candidates={trip.hotel_candidates}
        refs={trip.external_refs}
      />
    </ScrollView>
  );
}

function hotelOpenUrl(h: HotelCandidate, destination: string): string {
  const raw = (h.url || "").trim();
  if (raw) return raw;
  const q = encodeURIComponent(`${destination} ${h.name}`.trim());
  return `https://hotels.ctrip.com/hotels/list?keyword=${q}`;
}

function HotelNotesRow({
  destination,
  status,
  candidates,
  refs,
}: {
  destination: string;
  status?: string;
  candidates?: HotelCandidate[];
  refs?: ExternalRefs;
}) {
  const hotels = (candidates || []).slice(0, 6);
  const tips = [...(refs?.xiaohongshu || []), ...(refs?.ctrip || [])].slice(0, 6);
  if (!hotels.length && !tips.length) return null;

  return (
    <View style={styles.section}>
      <View style={styles.parallelRow}>
        <View style={styles.parallelCol}>
          <Text style={styles.parallelTitle}>酒店候选</Text>
          {status === "amap_only" && hotels.length ? (
            <Text style={styles.parallelHint}>地图检索结果</Text>
          ) : null}
          {hotels.length ? (
            hotels.map((h, i) => (
              <Pressable
                key={`${h.name}-${i}`}
                style={styles.compactCard}
                onPress={() => {
                  void openExternal(hotelOpenUrl(h, destination));
                }}
              >
                <Text style={styles.compactTitle} numberOfLines={2}>
                  {i + 1}. {h.name}
                </Text>
                {h.nearest_attraction && typeof h.nearest_dist_m === "number" ? (
                  <Text style={styles.compactAccent} numberOfLines={1}>
                    距{h.nearest_attraction}{" "}
                    {(h.nearest_dist_m / 1000).toFixed(1)}km
                  </Text>
                ) : typeof h.avg_dist_m === "number" ? (
                  <Text style={styles.compactAccent}>
                    距景点 {(h.avg_dist_m / 1000).toFixed(1)}km
                  </Text>
                ) : null}
              </Pressable>
            ))
          ) : (
            <Text style={styles.parallelEmpty}>暂无酒店</Text>
          )}
        </View>

        <View style={styles.parallelCol}>
          <Text style={styles.parallelTitle}>参考笔记</Text>
          {tips.length ? (
            tips.map((t, i) => {
              const source = (refs?.xiaohongshu || []).some((x) => x.url === t.url)
                ? "小红书"
                : "携程";
              return (
                <Pressable
                  key={`${t.url}-${i}`}
                  style={styles.compactCard}
                  onPress={() => {
                    if (t.url) void openExternal(t.url, t.title);
                  }}
                >
                  <Text style={styles.compactSource}>{source}</Text>
                  <Text style={styles.compactTitle} numberOfLines={2}>
                    {t.title}
                  </Text>
                </Pressable>
              );
            })
          ) : (
            <Text style={styles.parallelEmpty}>暂无笔记</Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 48 },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.bg,
    padding: 24,
  },
  title: { fontSize: 24, fontWeight: "800", color: colors.ink },
  meta: { marginTop: 8, fontSize: 14, color: colors.muted, lineHeight: 20 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  actionBtn: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  actionPrimary: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  actionText: { fontSize: 13, fontWeight: "600", color: colors.ink },
  actionPrimaryText: { fontSize: 13, fontWeight: "700", color: "#fff" },
  shareMsg: { marginTop: 8, fontSize: 12, color: colors.ready },
  section: { marginTop: 22 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.ink,
    marginBottom: 10,
  },
  routeCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  routeCardOn: {
    borderColor: colors.brand,
    backgroundColor: colors.brandSoft,
  },
  routeTitle: { fontWeight: "700", color: colors.ink, fontSize: 15 },
  routeTheme: { marginTop: 2, fontSize: 12, color: colors.brand },
  routeTag: { marginTop: 4, fontSize: 12, color: colors.muted },
  dayTabs: { marginTop: 16, marginBottom: 8 },
  dayTab: {
    backgroundColor: colors.card,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.line,
  },
  dayTabOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  dayTabText: { fontSize: 13, fontWeight: "600", color: colors.ink },
  dayTabTextOn: { color: "#fff" },
  regen: { alignSelf: "flex-start", marginBottom: 10 },
  regenText: { color: colors.brand, fontWeight: "600", fontSize: 13 },
  summaryBox: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    marginBottom: 14,
  },
  summaryLabel: { fontSize: 12, color: colors.brand, fontWeight: "700" },
  summaryText: { marginTop: 4, fontSize: 14, color: colors.ink, lineHeight: 20 },
  item: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    marginBottom: 10,
  },
  itemOff: { opacity: 0.5 },
  itemHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  itemType: { fontSize: 12, color: colors.brand, fontWeight: "600" },
  itemAction: { fontSize: 12, color: colors.brandHot, fontWeight: "600" },
  itemName: { fontSize: 16, fontWeight: "700", color: colors.ink },
  itemDesc: { marginTop: 4, fontSize: 13, color: colors.muted, lineHeight: 18 },
  itemMetaRow: { flexDirection: "row", gap: 10, marginTop: 6 },
  itemMeta: { fontSize: 12, color: colors.muted },
  transport: { marginTop: 8, fontSize: 12, color: colors.muted },
  alts: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  altsLabel: { fontSize: 12, color: colors.muted, alignSelf: "center" },
  altChip: {
    fontSize: 12,
    color: colors.brandHot,
    backgroundColor: colors.brandSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: "hidden",
  },
  budget: {
    marginTop: 22,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
  },
  budgetRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  budgetLabel: { color: colors.muted, fontSize: 13 },
  budgetVal: { fontWeight: "600", color: colors.ink },
  budgetTotal: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 10,
    marginTop: 4,
    marginBottom: 0,
  },
  budgetHint: { fontSize: 12, color: colors.muted },
  budgetTotalVal: { fontSize: 22, fontWeight: "800", color: colors.brand },
  parallelRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: GRID_GAP,
  },
  parallelCol: {
    flex: 1,
    minWidth: 0,
  },
  parallelTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.ink,
    marginBottom: 8,
  },
  parallelHint: {
    fontSize: 11,
    color: colors.muted,
    marginBottom: 6,
    marginTop: -4,
  },
  parallelEmpty: {
    fontSize: 12,
    color: colors.muted,
    paddingVertical: 10,
  },
  compactCard: {
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
  },
  compactSource: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.brand,
    marginBottom: 2,
  },
  compactTitle: {
    fontWeight: "700",
    color: colors.ink,
    fontSize: 13,
    lineHeight: 18,
  },
  compactAccent: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "600",
    color: colors.ready,
  },
  generating: { marginTop: 16, fontSize: 16, fontWeight: "600", color: colors.ink },
  hint: { marginTop: 8, fontSize: 13, color: colors.muted, textAlign: "center" },
  error: { color: colors.danger, fontSize: 16, textAlign: "center" },
  retry: {
    marginTop: 16,
    backgroundColor: colors.brandSoft,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryText: { color: colors.brandHot, fontWeight: "700" },
});
