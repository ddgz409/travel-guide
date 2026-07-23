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
import type { AppStackParamList } from "../../navigation/types";
import { colors } from "../../theme";

type Props = {
  tripId: string;
  dayId?: string;
  items: Item[];
  height?: number;
  title?: string;
};

export function DayMap({
  tripId,
  dayId,
  items,
  height = 260,
  title,
}: Props) {
  const navigation =
    useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const [mode] = useState("transit");
  const [loading, setLoading] = useState(false);
  const [polyline, setPolyline] = useState<number[][]>([]);
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
      setPolyline([]);
      return;
    }
    // 先用条目自带折线拼一条，地图立刻能画；后台再拉完整规划
    const cached = markers
      .slice(0, -1)
      .flatMap((m, i) => {
        const poly = m.transport_to_next?.polyline;
        if (poly && poly.length >= 2) {
          return i === 0 ? poly : poly.slice(1);
        }
        const next = markers[i + 1];
        const a = [m.location!.lng, m.location!.lat];
        const b = [next.location!.lng, next.location!.lat];
        return i === 0 ? [a, b] : [b];
      });
    if (cached.length >= 2) setPolyline(cached);

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await api.trips.getDayRoutes(tripId, dayId, mode);
        if (cancelled) return;
        const pts =
          data.polyline && data.polyline.length
            ? data.polyline
            : data.segments.flatMap((s) => s.polyline || []);
        if (pts.length >= 2) setPolyline(pts);
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
  }, [tripId, dayId, mode, markerKey]);

  function openFull() {
    if (!mapMarkers.length) return;
    navigation.navigate("MapFull", {
      title: title || "当日路线地图",
      markers: mapMarkers,
      polyline,
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
    polyline,
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
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  mapWrap: {
    borderRadius: 12,
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
    borderRadius: 14,
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
