import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { NativeViewGestureHandler } from "react-native-gesture-handler";
import { WebView } from "react-native-webview";
import type { Item, ItemType } from "@travel-guide/shared";
import { api } from "../../api/client";
import { getAmapJsKey } from "../../api/config";
import { cityCenterFor } from "../../data/cityCenters";
import { landmarksFor } from "../../data/landmarks";
import type { AppStackParamList } from "../../navigation/types";
import { buildAmapHtml, type MapMarker } from "../../utils/amapHtml";
import { colors } from "../../theme";
import { styles } from "./styles";

type MapCategory = "all" | ItemType;

const CATEGORIES: { id: MapCategory; label: string; icon: string }[] = [
  { id: "all", label: "??", icon: "??" },
  { id: "attraction", label: "??", icon: "??" },
  { id: "meal", label: "??", icon: "??" },
  { id: "hotel", label: "??", icon: "??" },
];

type Props = {
  tripId?: string;
  dayId?: string;
  items?: Item[];
  destination?: string;
  title?: string;
  height?: number;
  fill?: boolean;
  statusTitle?: string;
  statusSubtitle?: string;
  showCategoryChips?: boolean;
  onMapGestureChange?: (active: boolean) => void;
};

function itemMarkers(items: Item[]): MapMarker[] {
  return items
    .filter(
      (it) =>
        it.selected && it.location?.lng != null && it.location?.lat != null,
    )
    .map((m) => ({
      lng: m.location!.lng,
      lat: m.location!.lat,
      name: m.name,
    }));
}

export const HeroRouteMap = forwardRef<NativeViewGestureHandler, Props>(function HeroRouteMap(
  {
    tripId,
    dayId,
    items = [],
    destination = "",
    title,
    height = 280,
    fill = false,
    statusTitle,
    statusSubtitle,
    showCategoryChips = false,
    onMapGestureChange,
  },
  ref,
) {
  const navigation =
    useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const webRef = useRef<WebView>(null);
  const mapGestureRef = useRef<NativeViewGestureHandler>(null);
  useImperativeHandle(ref, () => mapGestureRef.current as NativeViewGestureHandler);
  const [mapReady, setMapReady] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const [polyline, setPolyline] = useState<number[][]>([]);
  const [category, setCategory] = useState<MapCategory>("all");
  const [fallbackMarkers, setFallbackMarkers] = useState<MapMarker[]>(() => {
    const center = cityCenterFor(destination);
    if (center) {
      return [{ lng: center.lng, lat: center.lat, name: center.name }];
    }
    return [];
  });
  const amapKey = getAmapJsKey();

  const filteredItems = useMemo(() => {
    if (category === "all") return items;
    return items.filter((it) => it.type === category);
  }, [items, category]);

  const routeMarkers = useMemo(() => itemMarkers(filteredItems), [filteredItems]);

  const mapMarkers = useMemo<MapMarker[]>(() => {
    if (routeMarkers.length) return routeMarkers;
    return fallbackMarkers;
  }, [routeMarkers, fallbackMarkers]);

  const markerKey = useMemo(
    () => mapMarkers.map((m) => `${m.lng},${m.lat}`).join("|"),
    [mapMarkers],
  );

  useEffect(() => {
    const center = cityCenterFor(destination);
    if (center) {
      setFallbackMarkers([
        { lng: center.lng, lat: center.lat, name: center.name },
      ]);
    }
  }, [destination]);

  useEffect(() => {
    if (routeMarkers.length) return;
    const dest = destination.trim();
    if (!dest) return;
    let cancelled = false;
    const landmark = landmarksFor(dest)[0] || dest;
    void api.trips
      .searchPois(landmark, dest, 1)
      .then((list) => {
        if (cancelled) return;
        const poi = list[0];
        if (poi?.location?.lng != null && poi.location.lat != null) {
          setFallbackMarkers([
            {
              lng: poi.location.lng,
              lat: poi.location.lat,
              name: dest,
            },
          ]);
        }
      })
      .catch(() => {
        /* keep city center */
      });
    return () => {
      cancelled = true;
    };
  }, [destination, routeMarkers.length]);

  useEffect(() => {
    const sourceItems = filteredItems.filter(
      (it) =>
        it.selected && it.location?.lng != null && it.location?.lat != null,
    );
    if (!tripId || !dayId || sourceItems.length < 2) {
      const cached = sourceItems
        .slice(0, -1)
        .flatMap((m, i) => {
          const poly = m.transport_to_next?.polyline;
          if (poly && poly.length >= 2) {
            return i === 0 ? poly : poly.slice(1);
          }
          const next = sourceItems[i + 1];
          if (!next?.location) return [];
          const a = [m.location!.lng, m.location!.lat];
          const b = [next.location.lng, next.location.lat];
          return i === 0 ? [a, b] : [b];
        });
      setPolyline(cached.length >= 2 ? cached : []);
      return;
    }

    const cached = sourceItems
      .slice(0, -1)
      .flatMap((m, i) => {
        const poly = m.transport_to_next?.polyline;
        if (poly && poly.length >= 2) {
          return i === 0 ? poly : poly.slice(1);
        }
        const next = sourceItems[i + 1];
        const a = [m.location!.lng, m.location!.lat];
        const b = [next.location!.lng, next.location!.lat];
        return i === 0 ? [a, b] : [b];
      });
    if (cached.length >= 2) setPolyline(cached);

    let cancelled = false;
    void (async () => {
      setRouteLoading(true);
      try {
        const data = await api.trips.getDayRoutes(tripId, dayId, "transit");
        if (cancelled) return;
        const pts =
          data.polyline && data.polyline.length
            ? data.polyline
            : data.segments.flatMap((s) => s.polyline || []);
        if (pts.length >= 2) setPolyline(pts);
      } catch {
        /* keep cached */
      } finally {
        if (!cancelled) setRouteLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tripId, dayId, markerKey, filteredItems]);

  const bootHtml = useMemo(() => {
    if (!amapKey) return "";
    const seed = fallbackMarkers.length
      ? fallbackMarkers
      : [{ lng: 116.4074, lat: 39.9042, name: "地图" }];
    return buildAmapHtml({
      key: amapKey,
      markers: seed,
      polyline: [],
      interactive: true,
    });
  }, [amapKey, fallbackMarkers]);

  const inject = useCallback((js: string) => {
    webRef.current?.injectJavaScript(`${js}; true;`);
  }, []);

  useEffect(() => {
    if (!mapReady || !amapKey) return;
    const payload = JSON.stringify(mapMarkers);
    const line = JSON.stringify(polyline);
    inject(
      `window.updateMapData && window.updateMapData(${payload}, ${line}, true)`,
    );
  }, [mapReady, amapKey, mapMarkers, polyline, markerKey, inject]);

  function openFullMap() {
    if (!mapMarkers.length) return;
    navigation.navigate("MapFull", {
      title: title || statusTitle || destination || "路线地图",
      markers: mapMarkers,
      polyline,
    });
  }

  const rootStyle = [styles.root, fill ? styles.rootFill : { height }];

  if (!amapKey) {
    return (
      <View style={[rootStyle, styles.mapLoading]}>
        <Text style={styles.mapHint}>地图未配置</Text>
      </View>
    );
  }

  return (
    <View style={rootStyle}>
      <View style={styles.mapBox}>
        {showCategoryChips ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.categoryBar}
            contentContainerStyle={styles.categoryBarInner}
          >
            {CATEGORIES.map((c) => {
              const on = category === c.id;
              return (
                <Pressable
                  key={c.id}
                  style={[styles.categoryChip, on && styles.categoryChipOn]}
                  onPress={() => setCategory(c.id)}
                >
                  <Text style={styles.categoryIcon}>{c.icon}</Text>
                  <Text
                    style={[styles.categoryLabel, on && styles.categoryLabelOn]}
                  >
                    {c.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {!bootHtml ? (
          <View style={styles.mapLoading}>
            <ActivityIndicator color={colors.brand} />
          </View>
        ) : (
          <>
            {!mapReady ? (
              <View style={styles.mapLoading}>
                <ActivityIndicator color={colors.brand} />
              </View>
            ) : null}
            <NativeViewGestureHandler ref={mapGestureRef} disallowInterruption>
              <View style={StyleSheet.absoluteFill} collapsable={false}>
                <WebView
                  ref={webRef}
                  originWhitelist={["*"]}
                  source={{ html: bootHtml, baseUrl: "https://webapi.amap.com" }}
                  style={StyleSheet.absoluteFill}
                  javaScriptEnabled
                  domStorageEnabled
                  scrollEnabled={false}
                  setSupportMultipleWindows={false}
                  androidLayerType="hardware"
                  cacheEnabled
                  cacheMode="LOAD_CACHE_ELSE_NETWORK"
                  onMessage={(e) => {
                    try {
                      const msg = JSON.parse(e.nativeEvent.data);
                      if (msg?.type === "ready") setMapReady(true);
                      if (msg?.type === "mapGesture") {
                        onMapGestureChange?.(!!msg.payload?.active);
                      }
                    } catch {
                      /* ignore */
                    }
                  }}
                  onLoadEnd={() => setMapReady(true)}
                />
              </View>
            </NativeViewGestureHandler>
            <View style={styles.mapControls} pointerEvents="box-none">
              <Pressable
                style={styles.mapCtrlBtn}
                onPress={() => inject("window.zoomIn && window.zoomIn()")}
              >
                <Text style={styles.mapCtrlText}>＋</Text>
              </Pressable>
              <Pressable
                style={styles.mapCtrlBtn}
                onPress={() => inject("window.zoomOut && window.zoomOut()")}
              >
                <Text style={styles.mapCtrlText}>－</Text>
              </Pressable>
            </View>
            <Pressable style={styles.mapExpand} onPress={openFullMap}>
              <Text style={styles.mapTapText}>全屏</Text>
            </Pressable>
            {routeLoading ? (
              <View style={styles.routeLoading}>
                <ActivityIndicator size="small" color={colors.brand} />
              </View>
            ) : null}
          </>
        )}

        {statusTitle ? (
          <View style={styles.statusBar} pointerEvents="none">
            <View style={styles.statusChip}>
              <Text style={styles.statusIcon}>✦</Text>
              <View style={styles.statusTextWrap}>
                <Text style={styles.statusTitle} numberOfLines={1}>
                  {statusTitle}
                </Text>
                {statusSubtitle ? (
                  <Text style={styles.statusSub} numberOfLines={2}>
                    {statusSubtitle}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
});
