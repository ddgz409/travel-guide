import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { api } from "../../api/client";
import { buildAmapHtml } from "../../utils/amapHtml";
import { getAmapJsKey } from "../../api/config";
import { useMapLocation } from "../../hooks/useMapLocation";
import { colors } from "../../theme";
import {
  DISMISS_X,
  MODE_TABS,
  SCREEN_W,
  fmtKm,
  fmtMin,
  modeLabel,
  type Mode,
} from "./helpers";
import { styles } from "./styles";

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
  const webRef = useRef<WebView>(null);
  const mapReadyRef = useRef(false);

  const translateX = useSharedValue(0);

  const inject = useCallback((js: string) => {
    webRef.current?.injectJavaScript(`${js}; true;`);
  }, []);

  const { locating, requestAndShowLocation } = useMapLocation(
    inject,
    mapReadyRef,
    "路线地图",
  );

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
    mapReadyRef.current = false;
    return buildAmapHtml({
      key: amapKey,
      markers,
      polyline: data.polyline || [],
      interactive: true,
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
                    {data.to_name ? ` -> ${data.to_name}` : " -> 下一站"}
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
                    ref={webRef}
                    originWhitelist={["*"]}
                    source={{ html, baseUrl: "https://webapi.amap.com" }}
                    style={StyleSheet.absoluteFill}
                    javaScriptEnabled
                    domStorageEnabled
                    scrollEnabled={false}
                    setSupportMultipleWindows={false}
                    androidLayerType="hardware"
                    onMessage={(e) => {
                      try {
                        const msg = JSON.parse(e.nativeEvent.data);
                        if (msg?.type === "ready") mapReadyRef.current = true;
                      } catch {
                        /* ignore */
                      }
                    }}
                    onLoadEnd={() => {
                      setTimeout(() => {
                        mapReadyRef.current = true;
                      }, 800);
                    }}
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
                {amapKey && html ? (
                  <View style={styles.mapControls} pointerEvents="box-none">
                    <Pressable
                      style={styles.ctrlBtn}
                      onPress={() => inject("window.zoomIn && window.zoomIn()")}
                    >
                      <Text style={styles.ctrlText}>＋</Text>
                    </Pressable>
                    <Pressable
                      style={styles.ctrlBtn}
                      onPress={() =>
                        inject("window.zoomOut && window.zoomOut()")
                      }
                    >
                      <Text style={styles.ctrlText}>－</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.ctrlBtn, styles.locateBtn]}
                      onPress={() => void requestAndShowLocation()}
                      disabled={locating}
                    >
                      {locating ? (
                        <ActivityIndicator color="#1a66ff" />
                      ) : (
                        <Text style={styles.locateText}>定位</Text>
                      )}
                    </Pressable>
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
                            .join(" -> ")}
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

// silence unused import warning for fmtMin (kept for potential future use)
void fmtMin;
