import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import type { PoiSearchResult } from "@travel-guide/shared";
import { api } from "../../api/client";
import { getAmapJsKey } from "../../api/config";
import { cityCenterFor } from "../../data/cityCenters";
import { distanceLabel } from "../../utils/geo";
import { colors } from "../../theme";
import { buildAmapHtml } from "../../utils/amapHtml";
import { styles } from "./styles";

export type PoiAddType = "attraction" | "meal" | "hotel";

const TYPE_OPTIONS: { id: PoiAddType; label: string }[] = [
  { id: "attraction", label: "景点" },
  { id: "meal", label: "美食" },
  { id: "hotel", label: "住宿" },
];

type Props = {
  visible: boolean;
  /** 有坐标=以该点为初始中心；无坐标=用目的地城市中心 */
  coords: { lng: number; lat: number } | null;
  city: string;
  dayLabel: string;
  busy: boolean;
  onSelectPoi: (poi: PoiSearchResult, type: PoiAddType) => void;
  onAddCustom: (name: string, type: PoiAddType) => void;
  onCancel: () => void;
};

export function AddSpotSheet({
  visible,
  coords,
  city,
  dayLabel,
  busy,
  onSelectPoi,
  onAddCustom,
  onCancel,
}: Props) {
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);
  const amapKey = getAmapJsKey();
  const [mapReady, setMapReady] = useState(false);
  /** 当前地图中心（大头针所指位置），拖动地图实时更新 */
  const [mapCenter, setMapCenter] = useState<{ lng: number; lat: number } | null>(null);
  const [type, setType] = useState<PoiAddType>("attraction");
  const [nearby, setNearby] = useState<PoiSearchResult[]>([]);
  const [loadingNearby, setLoadingNearby] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PoiSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const seqRef = useRef(0);
  const nearbyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** 初始中心：优先传入坐标，其次目的地城市中心，兜底北京 */
  const initialCenter = useMemo(() => {
    if (coords?.lng != null && coords.lat != null) return coords;
    const c = cityCenterFor(city);
    if (c) return { lng: c.lng, lat: c.lat };
    return { lng: 116.4074, lat: 39.9042 };
  }, [coords, city]);

  const bootHtml = useMemo(() => {
    if (!amapKey) return "";
    return buildAmapHtml({
      key: amapKey,
      markers: [],
      polyline: [],
      interactive: true,
      centerPickMode: true,
    });
  }, [amapKey]);

  const inject = useCallback((js: string) => {
    webRef.current?.injectJavaScript(`${js}; true;`);
  }, []);

  // 打开时复位（mapReady 不重置：Modal 可能保留 WebView 不重载，
  // 重载场景由 onLoadStart 重置）
  useEffect(() => {
    if (!visible) return;
    setQuery("");
    setResults([]);
    setCustomOpen(false);
    setCustomName("");
    setMapCenter(null);
    setNearby([]);
  }, [visible]);

  // 地图就绪：把中心移到初始位置，触发首次附近加载
  useEffect(() => {
    if (!mapReady || !visible) return;
    inject(`window.recenterTo && window.recenterTo(${initialCenter.lng}, ${initialCenter.lat}, 15)`);
  }, [mapReady, visible, initialCenter.lng, initialCenter.lat, inject]);

  // 地图中心变化（拖动/缩放结束）：防抖刷新附近列表
  const fetchNearby = useCallback(
    (lng: number, lat: number, t: PoiAddType) => {
      const seq = ++seqRef.current;
      setLoadingNearby(true);
      void api.trips
        .nearbyPois(lng, lat, t, 10)
        .then((list) => {
          if (seq === seqRef.current) setNearby(list);
        })
        .catch(() => {
          if (seq === seqRef.current) setNearby([]);
        })
        .finally(() => {
          if (seq === seqRef.current) setLoadingNearby(false);
        });
    },
    [],
  );

  useEffect(() => {
    if (!visible || !mapCenter) return;
    if (nearbyTimerRef.current) clearTimeout(nearbyTimerRef.current);
    nearbyTimerRef.current = setTimeout(() => {
      fetchNearby(mapCenter.lng, mapCenter.lat, type);
    }, 250);
    return () => {
      if (nearbyTimerRef.current) clearTimeout(nearbyTimerRef.current);
    };
  }, [visible, mapCenter, type, fetchNearby]);

  // 关键字即时搜索（防抖）
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      seqRef.current += 1;
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      const seq = ++seqRef.current;
      void api.trips
        .searchPois(q, city.trim() || q, 8)
        .then((list) => {
          if (seq === seqRef.current) setResults(list);
        })
        .catch(() => {
          if (seq === seqRef.current) setResults([]);
        })
        .finally(() => {
          if (seq === seqRef.current) setSearching(false);
        });
    }, 350);
    return () => clearTimeout(timer);
  }, [query, city]);

  const onMapMessage = useCallback(
    (event: { nativeEvent: { data?: string } }) => {
      const raw = event.nativeEvent.data;
      if (!raw) return;
      try {
        const msg = JSON.parse(raw) as {
          type: string;
          payload?: { lng?: number; lat?: number } | null;
        };
        if (msg.type === "ready") {
          setMapReady(true);
        } else if (
          msg.type === "mapCenter" &&
          msg.payload?.lng != null &&
          msg.payload.lat != null
        ) {
          setMapCenter({ lng: msg.payload.lng, lat: msg.payload.lat });
        }
      } catch {
        /* ignore */
      }
    },
    [],
  );

  const confirmCustom = useCallback(() => {
    const name = customName.trim();
    if (!name) return;
    onAddCustom(name, type);
  }, [customName, type, onAddCustom]);

  const q = query.trim();
  const list = q ? results : nearby;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <View style={styles.addRoot}>
        <Pressable style={styles.addBackdrop} onPress={onCancel} />
        <KeyboardAvoidingView
          behavior="padding"
          style={styles.spotKav}
          pointerEvents="box-none"
        >
          <View
            style={[
              styles.addSheet,
              spotStyles.sheet,
              { paddingBottom: Math.max(insets.bottom, 12) },
            ]}
          >
            <View style={styles.addHead}>
              <View style={styles.addHeadMain}>
                <Text style={styles.addTitle}>添加到 {dayLabel}</Text>
                <Text style={styles.addSub}>
                  拖动地图选点或搜索关键词，添加进当天行程
                </Text>
              </View>
              <Pressable style={styles.addClose} onPress={onCancel} hitSlop={12}>
                <Text style={styles.addCloseText}>✕</Text>
              </Pressable>
            </View>

            <TextInput
              style={styles.spotSearchInput}
              placeholder={city.trim() ? `在${city.trim()}搜索地点` : "输入关键字搜索地点"}
              placeholderTextColor={colors.muted}
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
            />

            {amapKey ? (
              <View style={[spotStyles.mapBox, q && spotStyles.mapBoxHidden]}>
                {!mapReady ? (
                  <View style={spotStyles.mapLoading}>
                    <ActivityIndicator color={colors.brand} />
                  </View>
                ) : null}
                <WebView
                  ref={webRef}
                  originWhitelist={["*"]}
                  source={{ html: bootHtml, baseUrl: "https://webapi.amap.com" }}
                  style={StyleSheet.absoluteFill}
                  javaScriptEnabled
                  domStorageEnabled
                  mixedContentMode="always"
                  onLoadStart={() => setMapReady(false)}
                  onMessage={onMapMessage}
                />
                <Text style={spotStyles.mapHint}>拖动地图，大头针所指位置即为选点</Text>
              </View>
            ) : null}

            <View style={styles.addTypeRow}>
              {TYPE_OPTIONS.map((o) => {
                const on = o.id === type;
                return (
                  <Pressable
                    key={o.id}
                    style={[styles.addTypeChip, on && styles.addTypeChipOn]}
                    onPress={() => setType(o.id)}
                  >
                    <Text style={[styles.addTypeText, on && styles.addTypeTextOn]}>
                      {o.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {q && searching ? (
              <View style={styles.addLoading}>
                <ActivityIndicator color={colors.brand} />
              </View>
            ) : q && !searching && results.length === 0 ? (
              <View style={styles.addEmpty}>
                <Text style={styles.addEmptyText}>
                  未找到匹配地点，换个词试试，或用下方自定义添加
                </Text>
              </View>
            ) : loadingNearby && !q ? (
              <View style={styles.addLoading}>
                <ActivityIndicator color={colors.brand} />
              </View>
            ) : list.length ? (
              <ScrollView
                style={styles.addList}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
              >
                {list.map((poi) => {
                  const anchor = q ? null : mapCenter;
                  const dist =
                    anchor && poi.location
                      ? distanceLabel(anchor, poi.location)
                      : null;
                  return (
                    <Pressable
                      key={poi.poi_id || poi.name}
                      style={styles.addRow}
                      onPress={() => {
                        // 有坐标的搜索结果：先把地图移过去，让用户确认位置
                        if (q && poi.location?.lng != null && poi.location.lat != null) {
                          inject(
                            `window.recenterTo && window.recenterTo(${poi.location.lng}, ${poi.location.lat}, 16)`,
                          );
                        }
                        onSelectPoi(poi, type);
                      }}
                      disabled={busy}
                    >
                      <View style={styles.addRowBody}>
                        <Text style={styles.addRowName} numberOfLines={1}>
                          {poi.name}
                        </Text>
                        <Text style={styles.addRowSub} numberOfLines={1}>
                          {poi.address ||
                            (city ? `${city} · ${poi.name}` : poi.name)}
                        </Text>
                      </View>
                      {dist ? (
                        <Text style={styles.addRowDist}>
                          {dist.replace("距我 ", "")}
                        </Text>
                      ) : null}
                      <Text style={styles.addRowArrow}>＋</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : (
              <View style={styles.addEmpty}>
                <Text style={styles.addEmptyText}>
                  {q
                    ? "未找到匹配地点，换个词试试，或用下方自定义添加"
                    : "大头针附近暂无这类地点，拖动地图或搜索"}
                </Text>
              </View>
            )}

            <View style={styles.addCustom}>
              {customOpen ? (
                <View style={styles.addCustomForm}>
                  <TextInput
                    style={styles.addCustomInput}
                    placeholder="输入地点名称"
                    placeholderTextColor={colors.muted}
                    value={customName}
                    onChangeText={setCustomName}
                    maxLength={40}
                    autoFocus
                  />
                  <Pressable
                    style={styles.addCustomConfirm}
                    onPress={confirmCustom}
                    disabled={busy || !customName.trim()}
                  >
                    <Text style={styles.addCustomConfirmText}>确定</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  style={styles.addCustomBtn}
                  onPress={() => setCustomOpen(true)}
                  disabled={busy}
                >
                  <Text style={styles.addCustomBtnText}>✚ 自定义名称添加</Text>
                </Pressable>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const spotStyles = StyleSheet.create({
  sheet: {
    height: "88%",
    maxHeight: "88%",
  },
  mapBox: {
    height: 210,
    borderRadius: 16,
    borderCurve: "continuous",
    overflow: "hidden",
    marginBottom: 12,
    backgroundColor: "#f3f4f6",
  },
  /** 搜索时隐藏地图但保留 WebView，避免清空搜索后地图中心被重置 */
  mapBoxHidden: { display: "none" },
  mapLoading: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  mapHint: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 8,
    textAlign: "center",
    fontSize: 11,
    color: colors.muted,
    zIndex: 3,
  },
});
