import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { WebView } from "react-native-webview";
import type { RouteStep, TransportToNext } from "@travel-guide/shared";
import { ApiError } from "@travel-guide/shared";
import { api } from "../api";
import { buildAmapHtml } from "../amapHtml";
import { getAmapJsKey } from "../config";
import { colors } from "../theme";

type Mode = "transit" | "walking" | "driving";

const MODE_TABS: { id: Mode; label: string }[] = [
  { id: "transit", label: "公交地铁" },
  { id: "walking", label: "步行" },
  { id: "driving", label: "驾车" },
];

const SCREEN_W = Dimensions.get("window").width;
const DISMISS_X = Math.min(120, SCREEN_W * 0.28);

function modeLabel(mode: string) {
  if (mode === "walking") return "步行";
  if (mode === "driving") return "驾车";
  return "公交地铁";
}

function fmtMin(s: number) {
  const m = Math.max(1, Math.round(s / 60));
  if (m < 60) return `${m}分钟`;
  return `${Math.floor(m / 60)}小时${m % 60}分`;
}

function fmtKm(m: number) {
  if (m < 1000) return `${m}米`;
  return `${(m / 1000).toFixed(1)}公里`;
}

type Props = {
  tripId: string;
  itemId: string;
  fromName: string;
  transport: TransportToNext;
  onUpdated?: (t: TransportToNext) => void;
};

export function TransportRouteSheet({
  tripId,
  itemId,
  fromName,
  transport,
  onUpdated,
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>(
    (transport.mode as Mode) || "transit",
  );
  const [data, setData] = useState<TransportToNext>(transport);
  const [error, setError] = useState<string | null>(null);
  const amapKey = getAmapJsKey();

  const translateX = useSharedValue(0);

  function closeSheet() {
    setOpen(false);
    translateX.value = 0;
  }

  function openSheet() {
    translateX.value = 0;
    setOpen(true);
  }

  useEffect(() => {
    setData(transport);
    setMode((transport.mode as Mode) || "transit");
  }, [transport]);

  async function load(m: Mode, forceReplan = false) {
    setLoading(true);
    setError(null);
    try {
      const res =
        forceReplan || m !== (data.mode as Mode)
          ? await api.trips.updateItemRoute(tripId, itemId, {
              mode: m,
              scheme_index: 0,
            })
          : await api.trips.getItemRoute(tripId, itemId, m);
      const next = res as TransportToNext;
      setData(next);
      setMode((next.mode as Mode) || m);
      onUpdated?.(next);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "路线加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    if (!data.detail?.length || !data.polyline?.length) {
      void load(mode, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const edgeBack = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX(12)
        .failOffsetY([-24, 24])
        .hitSlop({ left: 0, width: 28, top: 0, bottom: 0 })
        .onUpdate((e) => {
          translateX.value = Math.max(0, e.translationX);
        })
        .onEnd((e) => {
          const shouldClose =
            e.translationX > DISMISS_X || e.velocityX > 900;
          if (shouldClose) {
            translateX.value = withTiming(SCREEN_W, { duration: 180 }, () => {
              runOnJS(closeSheet)();
            });
          } else {
            translateX.value = withSpring(0, { damping: 22, stiffness: 260 });
          }
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: 1 - Math.min(1, translateX.value / SCREEN_W) * 0.85,
  }));

  const steps = (data.detail || []) as RouteStep[];
  const min = Math.round((data.duration_s || 0) / 60);

  const markers = useMemo(() => {
    const list: { lng: number; lat: number; name: string }[] = [];
    if (data.from_location?.lng != null && data.from_location?.lat != null) {
      list.push({
        lng: data.from_location.lng,
        lat: data.from_location.lat,
        name: data.from_name || fromName,
      });
    }
    if (data.to_location?.lng != null && data.to_location?.lat != null) {
      list.push({
        lng: data.to_location.lng,
        lat: data.to_location.lat,
        name: data.to_name || "下一站",
      });
    }
    return list;
  }, [data, fromName]);

  const html = useMemo(() => {
    if (!amapKey) return "";
    return buildAmapHtml({
      key: amapKey,
      markers,
      polyline: data.polyline || [],
    });
  }, [amapKey, markers, data.polyline]);

  return (
    <>
      <Pressable style={styles.card} onPress={openSheet}>
        <View style={styles.cardTop}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {data.mode === "walking"
                ? "步"
                : data.mode === "driving"
                  ? "车"
                  : "交"}
            </Text>
          </View>
          <Text style={styles.cardSummary}>
            约 {min || "?"} 分钟 · {fmtKm(data.distance_m || 0)} ·{" "}
            {modeLabel(data.mode)}
          </Text>
          <Text style={styles.cardCta}>查看线路 ›</Text>
        </View>
        <Text style={styles.cardSub} numberOfLines={1}>
          从「{fromName}」前往
          {data.to_name ? `「${data.to_name}」` : "下一站"}
        </Text>
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={closeSheet}>
        <GestureHandlerRootView style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet}>
            <Animated.View style={[styles.backdrop, backdropStyle]} />
          </Pressable>

          <GestureDetector gesture={edgeBack}>
            <Animated.View style={[styles.sheet, sheetStyle]}>
              {/* 左侧热区提示条：侧滑返回 */}
              <View style={styles.edgeHint} pointerEvents="none" />

              <View style={styles.sheetHead}>
                <Pressable
                  onPress={closeSheet}
                  hitSlop={12}
                  style={styles.backBtn}
                >
                  <Text style={styles.backChevron}>‹</Text>
                  <Text style={styles.backText}>返回</Text>
                </Pressable>
                <View style={{ flex: 1, marginHorizontal: 8 }}>
                  <Text style={styles.sheetTitle}>路线规划</Text>
                  <Text style={styles.sheetSub} numberOfLines={1}>
                    {fromName}
                    {data.to_name ? ` → ${data.to_name}` : " → 下一站"}
                  </Text>
                </View>
                <Pressable onPress={closeSheet} hitSlop={12}>
                  <Text style={styles.close}>关闭</Text>
                </Pressable>
              </View>
              <Text style={styles.swipeTip}>从左缘向右滑可返回</Text>

              <View style={styles.tabs}>
                {MODE_TABS.map((t) => {
                  const on = mode === t.id;
                  return (
                    <Pressable
                      key={t.id}
                      style={[styles.tab, on && styles.tabOn]}
                      disabled={loading}
                      onPress={() => {
                        setMode(t.id);
                        void load(t.id, true);
                      }}
                    >
                      <Text style={[styles.tabText, on && styles.tabTextOn]}>
                        {t.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.mapBox}>
                {amapKey && html ? (
                  <WebView
                    originWhitelist={["*"]}
                    source={{ html, baseUrl: "https://webapi.amap.com" }}
                    style={StyleSheet.absoluteFill}
                    javaScriptEnabled
                    domStorageEnabled
                    scrollEnabled={false}
                  />
                ) : (
                  <View style={styles.mapFallback}>
                    <Text style={styles.mapFallbackText}>
                      地图 Key 未注入，下方仍可查看文字路线
                    </Text>
                  </View>
                )}
                {loading ? (
                  <View style={styles.mapLoading}>
                    <ActivityIndicator color="#1a66ff" />
                  </View>
                ) : null}
              </View>

              <ScrollView
                style={styles.steps}
                contentContainerStyle={{ paddingBottom: 24 }}
              >
                {error ? <Text style={styles.error}>{error}</Text> : null}
                {loading && !steps.length ? (
                  <Text style={styles.hint}>加载路线中…</Text>
                ) : null}
                {steps.map((step, i) => {
                  const isWalk = step.type === "walk" || step.type === "drive";
                  return (
                    <View key={i} style={styles.stepRow}>
                      <Text style={styles.stepTitle}>
                        {isWalk
                          ? step.type === "drive"
                            ? "驾车"
                            : "步行"
                          : step.line_name || "公交"}
                        {step.distance_m
                          ? ` · ${fmtKm(step.distance_m)}`
                          : ""}
                      </Text>
                      {step.instruction ? (
                        <Text style={styles.stepDesc}>{step.instruction}</Text>
                      ) : null}
                      {step.departure_stop || step.arrival_stop ? (
                        <Text style={styles.stepDesc}>
                          {[step.departure_stop, step.arrival_stop]
                            .filter(Boolean)
                            .join(" → ")}
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
                {!loading && !steps.length && !error ? (
                  <Text style={styles.hint}>暂无详细路段</Text>
                ) : null}
              </ScrollView>
            </Animated.View>
          </GestureDetector>
        </GestureHandlerRootView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d6e4ff",
    backgroundColor: "#f0f7ff",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  badge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#1a66ff",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  cardSummary: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    color: "#1a66ff",
  },
  cardCta: { fontSize: 12, fontWeight: "700", color: "#1a66ff" },
  cardSub: { marginTop: 4, fontSize: 11, color: colors.muted },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    maxHeight: "92%",
    backgroundColor: "#fff",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    overflow: "hidden",
  },
  edgeHint: {
    position: "absolute",
    left: 0,
    top: 80,
    bottom: 80,
    width: 3,
    borderRadius: 2,
    backgroundColor: "rgba(26,102,255,0.35)",
    zIndex: 2,
  },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 4,
  },
  backChevron: {
    fontSize: 28,
    lineHeight: 28,
    fontWeight: "300",
    color: colors.brandHot,
    marginTop: -2,
  },
  backText: { fontSize: 15, fontWeight: "700", color: colors.brandHot },
  sheetTitle: { fontSize: 16, fontWeight: "800", color: colors.ink },
  sheetSub: { marginTop: 2, fontSize: 12, color: colors.muted },
  close: { fontSize: 14, fontWeight: "700", color: colors.muted },
  swipeTip: {
    paddingHorizontal: 16,
    paddingTop: 6,
    fontSize: 11,
    color: colors.muted,
  },
  tabs: { flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingTop: 8 },
  tab: {
    flex: 1,
    borderRadius: 20,
    paddingVertical: 8,
    alignItems: "center",
    backgroundColor: colors.bg,
  },
  tabOn: { backgroundColor: "#1a66ff" },
  tabText: { fontSize: 13, fontWeight: "700", color: colors.ink },
  tabTextOn: { color: "#fff" },
  mapBox: {
    marginHorizontal: 12,
    marginTop: 12,
    height: 200,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#eef2f7",
  },
  mapFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  mapFallbackText: { fontSize: 12, color: colors.muted, textAlign: "center" },
  mapLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.45)",
  },
  steps: { paddingHorizontal: 16, paddingTop: 12 },
  stepRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  stepTitle: { fontSize: 14, fontWeight: "700", color: colors.ink },
  stepDesc: { marginTop: 4, fontSize: 12, color: colors.muted, lineHeight: 18 },
  hint: { paddingVertical: 20, textAlign: "center", color: colors.muted },
  error: { color: colors.danger, marginBottom: 8 },
});
