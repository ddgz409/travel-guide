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
import type { Item } from "@travel-guide/shared";
import { api } from "../../api/client";
import { getAmapJsKey } from "../../api/config";
import { cityCenterFor } from "../../data/cityCenters";
import { landmarksFor } from "../../data/landmarks";
import type { AppStackParamList } from "../../navigation/types";
import type { ExploreCategory } from "../../screens/CityDetail/helpers";
import { buildAmapHtml, type MapMarker } from "../../utils/amapHtml";
import {
  peekCachedAccuracy,
  peekCachedLocation,
} from "../../utils/location";
import type { RouteMode } from "../../utils/routeMode";
import { routeModeForTrip } from "../../utils/routeMode";
import {
  poiSheetFromMarker,
  type PoiSheetData,
} from "../../utils/poiDetailHelpers";
import { colors } from "../../theme";
import {
  fetchCategoryMarkers,
  MAX_CATEGORY_MARKERS,
  resolveTripItemId,
  tripCategoryMarkers,
  TRIP_MAP_CATEGORIES,
  VIEWPORT_MARKER_LIMIT,
  type MapCategoryFilter,
  type TripMapCategory,
} from "./mapCategories";
import { styles } from "./styles";

type Props = {
  tripId?: string;
  dayId?: string;
  /** 当日行程点（selected 且有坐标的会画路线） */
  items?: Item[];
  /** 分类筛选用的全部行程点，缺省则用 items */
  categoryItems?: Item[];
  destination?: string;
  title?: string;
  height?: number;
  fill?: boolean;
  statusTitle?: string;
  statusSubtitle?: string;
  showCategoryChips?: boolean;
  categoryBarTop?: number;
  onMapGestureChange?: (active: boolean) => void;
  onPoiPress?: (poi: PoiSheetData) => void;
  /** 地图选点模式：开启后点击地图回调 onMapPick */
  pickMode?: boolean;
  onMapPick?: (lng: number, lat: number) => void;
  /** 路线规划模式（transit/walking/driving）；调用方按攻略交通偏好传入，缺省公交 */
  routeMode?: RouteMode;
};

function itemMarkers(items: Item[]): MapMarker[] {
  return items
    .filter(
      (it) =>
        it.selected && it.location?.lng != null && it.location?.lat != null,
    )
    .map((m, i) => ({
      lng: m.location!.lng,
      lat: m.location!.lat,
      name: m.name,
      itemId: m.id,
      icon: String(i + 1),
    }));
}

/**
 * 相邻两站之间只认真实路线折线（transport_to_next.polyline）；
 * 缺数据的段直接断开成多段，绝不画 A→B 直线兜底。
 */
function polylinesFromItems(source: Item[]): number[][][] {
  const groups: number[][][] = [];
  let cur: number[][] = [];
  for (let i = 0; i < source.length - 1; i++) {
    const poly = source[i].transport_to_next?.polyline;
    if (poly && poly.length >= 2) {
      cur = cur.length ? cur.concat(poly.slice(1)) : poly.map((p) => p);
      continue;
    }
    if (cur.length >= 2) groups.push(cur);
    cur = [];
  }
  if (cur.length >= 2) groups.push(cur);
  return groups;
}

export const HeroRouteMap = forwardRef<NativeViewGestureHandler, Props>(function HeroRouteMap(
  {
    tripId,
    dayId,
    items = [],
    categoryItems,
    destination = "",
    title,
    height = 280,
    fill = false,
    statusTitle,
    statusSubtitle,
    showCategoryChips = false,
    categoryBarTop,
    onMapGestureChange,
    onPoiPress,
    pickMode = false,
    onMapPick,
    routeMode: routeModeProp,
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
  const [categoryLoading, setCategoryLoading] = useState(false);
  /** 多段折线：无真实路线数据的段之间保持断开 */
  const [routePolylines, setRoutePolylines] = useState<number[][][]>([]);
  const [category, setCategory] = useState<MapCategoryFilter>("all");
  const [categoryMarkers, setCategoryMarkers] = useState<MapMarker[]>([]);
  const lastCategoryMarkersRef = useRef<MapMarker[]>([]);
  const [viewportStats, setViewportStats] = useState({ visible: 0, total: 0 });
  const [fallbackMarkers, setFallbackMarkers] = useState<MapMarker[]>(() => {
    const center = cityCenterFor(destination);
    if (center) {
      return [{ lng: center.lng, lat: center.lat, name: center.name }];
    }
    return [];
  });
  const amapKey = getAmapJsKey();
  const poiSourceItems = categoryItems ?? items;

  const categoryActive = category !== "all";
  const activeCategoryMeta = categoryActive
    ? TRIP_MAP_CATEGORIES.find((c) => c.id === category)
    : null;

  const routeItems = useMemo(
    () => (categoryActive ? [] : items),
    [items, categoryActive],
  );

  const routeMarkers = useMemo(() => itemMarkers(routeItems), [routeItems]);

  const mapMarkers = useMemo<MapMarker[]>(() => {
    if (categoryActive) {
      const cat = category as TripMapCategory;
      if (categoryMarkers.length) return categoryMarkers;
      const tripOnly = tripCategoryMarkers(poiSourceItems, cat);
      if (tripOnly.length) return tripOnly;
      if (categoryLoading && lastCategoryMarkersRef.current.length) {
        return lastCategoryMarkersRef.current;
      }
      return fallbackMarkers;
    }
    if (routeMarkers.length) return routeMarkers;
    return fallbackMarkers;
  }, [
    categoryActive,
    category,
    categoryMarkers,
    categoryLoading,
    routeMarkers,
    fallbackMarkers,
    poiSourceItems,
  ]);

  const markerKey = useMemo(
    () => mapMarkers.map((m) => `${m.lng},${m.lat},${m.name}`).join("|"),
    [mapMarkers],
  );

  useEffect(() => {
    if (!categoryActive) setViewportStats({ visible: 0, total: 0 });
  }, [categoryActive]);

  const onCategoryPress = useCallback((id: TripMapCategory) => {
    setCategory((prev) => (prev === id ? "all" : id));
  }, []);

  const sheetCategory = useMemo((): ExploreCategory => {
    if (category === "food" || category === "drink") return "foods";
    if (category === "hotel") return "hotels";
    return "spots";
  }, [category]);

  const handleMarkerTap = useCallback(
    (payload: {
      name: string;
      lng: number;
      lat: number;
      itemId?: string | null;
    }) => {
      const itemId = resolveTripItemId(poiSourceItems, payload);
      const tripItem = itemId
        ? poiSourceItems.find((it) => it.id === itemId)
        : null;
      onPoiPress?.(
        poiSheetFromMarker(payload, tripItem, sheetCategory),
      );
    },
    [poiSourceItems, sheetCategory, onPoiPress],
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
    if (category === "all") {
      setCategoryMarkers([]);
      return;
    }
    const cat = category as TripMapCategory;
    let cancelled = false;
    setCategoryLoading(true);
    void fetchCategoryMarkers(cat, destination, poiSourceItems)
      .then((markers) => {
        if (cancelled) return;
        const next =
          markers.length > 0
            ? markers
            : tripCategoryMarkers(poiSourceItems, cat);
        setCategoryMarkers(next);
        if (next.length) lastCategoryMarkersRef.current = next;
      })
      .catch(() => {
        if (cancelled) return;
        const tripOnly = tripCategoryMarkers(poiSourceItems, cat);
        setCategoryMarkers(tripOnly);
        if (tripOnly.length) lastCategoryMarkersRef.current = tripOnly;
      })
      .finally(() => {
        if (!cancelled) setCategoryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [category, destination, poiSourceItems]);

  useEffect(() => {
    if (routeMarkers.length) return;
    if (categoryActive) return;
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
  }, [destination, routeMarkers.length, categoryActive]);

  useEffect(() => {
    if (categoryActive) {
      setRoutePolylines([]);
      return;
    }

    const sourceItems = routeItems.filter(
      (it) =>
        it.selected && it.location?.lng != null && it.location?.lat != null,
    );
    // 先用条目自带折线立即渲染；无路线数据的段保持断开，不画直线
    setRoutePolylines(polylinesFromItems(sourceItems));

    if (!tripId || !dayId || sourceItems.length < 2) return;

    let cancelled = false;
    void (async () => {
      setRouteLoading(true);
      try {
        const data = await api.trips.getDayRoutes(
          tripId,
          dayId,
          routeModeProp || "transit",
        );
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
        if (!cancelled) setRouteLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tripId, dayId, markerKey, routeItems, categoryActive, routeModeProp]);

  const bootHtml = useMemo(() => {
    if (!amapKey) return "";
    const seed = fallbackMarkers.length
      ? fallbackMarkers
      : [{ lng: 116.4074, lat: 39.9042, name: destination || "地图" }];
    return buildAmapHtml({
      key: amapKey,
      markers: seed,
      polyline: [],
      interactive: true,
    });
  }, [amapKey, fallbackMarkers, destination]);

  const inject = useCallback((js: string) => {
    webRef.current?.injectJavaScript(`${js}; true;`);
  }, []);

  useEffect(() => {
    if (!mapReady || !amapKey) return;
    inject(`window.setPickMode && window.setPickMode(${!!pickMode})`);
  }, [mapReady, amapKey, pickMode, inject]);

  useEffect(() => {
    if (!mapReady || !amapKey) return;
    if (categoryActive && categoryLoading && categoryMarkers.length === 0) {
      return;
    }
    const payload = JSON.stringify(mapMarkers.slice(0, MAX_CATEGORY_MARKERS));
    const line = JSON.stringify(routePolylines);
    const linkMarkers = !categoryActive;
    const focusCenter = categoryActive;
    const viewportLimit = categoryActive ? VIEWPORT_MARKER_LIMIT : 0;
    inject(
      `window.updateMapData && window.updateMapData(${payload}, ${line}, ${linkMarkers}, ${focusCenter}, ${viewportLimit})`,
    );
  }, [
    mapReady,
    amapKey,
    mapMarkers,
    routePolylines,
    markerKey,
    categoryActive,
    categoryLoading,
    categoryMarkers.length,
    inject,
  ]);

  function openFullMap() {
    if (!mapMarkers.length) return;
    const cached = peekCachedLocation();
    navigation.navigate("MapFull", {
      title: title || statusTitle || destination || "地图",
      markers: mapMarkers,
      polylines: categoryActive ? [] : routePolylines,
      userLocation: cached
        ? { ...cached, accuracy: peekCachedAccuracy() }
        : undefined,
    });
  }

  const rootStyle = [styles.root, fill ? styles.rootFill : { height }];
  const categoryBarStyle = [
    styles.categoryBar,
    categoryBarTop != null ? { top: categoryBarTop } : null,
  ];

  if (!amapKey) {
    return (
      <View style={[rootStyle, styles.mapLoading]}>
        <Text style={styles.mapHint}>未配置地图 Key</Text>
      </View>
    );
  }

  return (
    <View style={rootStyle} collapsable={false}>
      <View style={[styles.mapBox, fill && styles.mapBoxFill]}>
        {showCategoryChips ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={categoryBarStyle}
            contentContainerStyle={styles.categoryBarInner}
          >
            {TRIP_MAP_CATEGORIES.map((c) => {
              const on = category === c.id;
              return (
                <Pressable
                  key={c.id}
                  style={[
                    styles.categoryChip,
                    on && styles.categoryChipOn,
                    on && { backgroundColor: c.color, borderColor: c.color },
                  ]}
                  onPress={() => onCategoryPress(c.id)}
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
                      if (msg?.type === "viewportStats" && msg.payload) {
                        setViewportStats({
                          visible: msg.payload.visible ?? 0,
                          total: msg.payload.total ?? 0,
                        });
                      }
                      if (msg?.type === "markerTap" && msg.payload) {
                        handleMarkerTap(msg.payload);
                      }
                      if (msg?.type === "mapClick" && msg.payload) {
                        onMapPick?.(Number(msg.payload.lng), Number(msg.payload.lat));
                      }
                    } catch {
                      /* ignore */
                    }
                  }}
                  onLoadEnd={() => setMapReady(true)}
                />
              </View>
            </NativeViewGestureHandler>
            <Pressable style={styles.mapExpand} onPress={openFullMap}>
              <Text style={styles.mapTapText}>全屏</Text>
            </Pressable>
            {routeLoading || categoryLoading ? (
              <View style={styles.routeLoading}>
                <ActivityIndicator size="small" color={colors.brand} />
              </View>
            ) : null}
            {categoryActive && activeCategoryMeta ? (
              <View style={styles.categoryHint} pointerEvents="none">
                <Text style={styles.categoryHintText}>
                  {`${activeCategoryMeta.icon} ${activeCategoryMeta.label} · 共 ${viewportStats.total || categoryMarkers.length} 处 · 当前 ${viewportStats.visible || Math.min(VIEWPORT_MARKER_LIMIT, categoryMarkers.length)} 个${(viewportStats.total || categoryMarkers.length) > VIEWPORT_MARKER_LIMIT ? " · 缩放查看更多" : ""}`}
                </Text>
              </View>
            ) : null}
          </>
        )}

        {statusTitle ? (
          <View style={styles.statusBar} pointerEvents="none">
            <View style={styles.statusChip}>
              <Text style={styles.statusIcon}>📍</Text>
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
