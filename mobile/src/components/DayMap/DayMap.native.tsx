import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { WebView } from "react-native-webview";
import type { Item } from "@travel-guide/shared";
import { api } from "../../api/client";
import { buildAmapHtml } from "../../utils/amapHtml";
import { getAmapJsKey } from "../../api/config";
import { peekCachedAccuracy, peekCachedLocation } from "../../utils/location";
import type { AppStackParamList } from "../../navigation/types";
import type { RouteMode } from "../../utils/routeMode";
import { colors } from "../../theme";

type Props = {
  tripId: string;
  dayId?: string;
  items: Item[];
  height?: number;
  title?: string;
  /** 路线规划模式（transit/walking/driving），按攻略交通偏好传入 */
  routeMode?: RouteMode;
};

export function DayMap({
  tripId,
  dayId,
  items,
  height = 260,
  title,
  routeMode = "transit",
}: Props) {
  const navigation =
    useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const [loading, setLoading] = useState(false);
  /** 多段折线：无真实路线数据的段之间保持断开 */
  const [routePolylines, setRoutePolylines] = useState<number[][][]>([]);
  const amapKey = getAmapJsKey();

  const markers = useMemo(
    () =>
      items.filter(
        (it) =>
          it.selected && it.location?.lng != null && it.location?.lat != null,
      ),
    [items],
  );

  const mapMarkers = useMemo(
    () =>
      markers.map((m) => ({
        lng: m.location!.lng,
        lat: m.location!.lat,
        name: m.name,
      })),
    [markers],
  );

  const markerKey = useMemo(
    () => mapMarkers.map((m) => `${m.lng},${m.lat}`).join("|"),
    [mapMarkers],
  );

  useEffect(() => {
    if (!dayId || markers.length < 2) {
      setRoutePolylines([]);
      return;
    }
    // 先用条目自带折线立即渲染；缺数据的段断开，不画直线
    const cached: number[][][] = [];
    let cur: number[][] = [];
    markers.slice(0, -1).forEach((m) => {
      const poly = m.transport_to_next?.polyline;
      if (poly && poly.length >= 2) {
        cur = cur.length ? cur.concat(poly.slice(1)) : poly;
        return;
      }
      if (cur.length >= 2) cached.push(cur);
      cur = [];
    });
    if (cur.length >= 2) cached.push(cur);
    setRoutePolylines(cached);

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await api.trips.getDayRoutes(tripId, dayId, routeMode);
        if (cancelled) return;
        // 只保留真实规划段；mode=direct 是后端无数据时的直线兜底，不画
        const groups = (data.segments || [])
          .filter(
            (s) =>
              s.mode !== "direct" && s.polyline && s.polyline.length >= 2,
          )
          .map((s) => s.polyline);
        setRoutePolylines(groups);
      } catch {
        /* keep cached */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // markerKey 稳定时不因 items 引用变化重复请求
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, dayId, routeMode, markerKey]);

  function openFull() {
    if (!mapMarkers.length) return;
    const cached = peekCachedLocation();
    navigation.navigate("MapFull", {
      title: title || "当日路线地图",
      markers: mapMarkers,
      polylines: routePolylines,
      userLocation: cached
        ? { ...cached, accuracy: peekCachedAccuracy() }
        : undefined,
    });
  }

  if (!markers.length) {
    return (
      <View style={[styles.box, { height, justifyContent: "center" }]}>
        <Text style={styles.hint}>暂无带坐标的景点</Text>
      </View>
    );
  }

  if (!amapKey) {
    return (
      <View style={[styles.box, { height, justifyContent: "center" }]}>
        <Text style={styles.hint}>
          地图未配置：请确认 mobile/.env 有 EXPO_PUBLIC_AMAP_JS_KEY，并执行{" "}
          npx expo start --clear 重启
        </Text>
      </View>
    );
  }

  const html = buildAmapHtml({
    key: amapKey,
    markers: mapMarkers,
    polylines: routePolylines,
    interactive: false,
  });

  return (
    <View style={[styles.mapWrap, { height }]}>
      {/* 预览关闭地图手势，避免与页面滚动冲突；点击整块进入全屏 */}
      <WebView
        originWhitelist={["*"]}
        source={{ html, baseUrl: "https://webapi.amap.com" }}
        style={StyleSheet.absoluteFill}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        pointerEvents="none"
        setSupportMultipleWindows={false}
        androidLayerType="hardware"
      />
      <Pressable style={StyleSheet.absoluteFill} onPress={openFull}>
        <View style={styles.tapHint}>
          <Text style={styles.tapHintText}>点击放大地图</Text>
        </View>
      </Pressable>
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.card,
    padding: 14,
    borderRadius: 22, borderCurve: "continuous",
    borderWidth: 1,
    borderColor: colors.line,
  },
  mapWrap: {
    borderRadius: 22, borderCurve: "continuous",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: "#f3f4f6",
  },
  hint: {
    fontSize: 12,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 18,
  },
  tapHint: {
    position: "absolute",
    right: 10,
    bottom: 10,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 24, borderCurve: "continuous",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  tapHintText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  loading: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.35)",
  },
});
