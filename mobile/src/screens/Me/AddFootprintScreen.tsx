import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeViewGestureHandler } from "react-native-gesture-handler";
import { WebView } from "react-native-webview";
import type { PoiSearchResult } from "@travel-guide/shared";
import type { AppStackParamList } from "../../navigation/types";
import { api } from "../../api/client";
import { getAmapJsKey } from "../../api/config";
import { colors } from "../../theme";
import { buildAmapHtml, type MapMarker } from "../../utils/amapHtml";
import { buildMapUserLocationJs } from "../../utils/mapUserLocation";
import {
  getDeviceLocation,
  getFreshDeviceLocation,
  describeLocationError,
  ensureLocationAccess,
  peekCachedCity,
  peekCachedLocation,
  rememberLocation,
} from "../../utils/location";
import { addCheckIn, isCheckedIn } from "../../utils/checkInStore";
import { resolvePrefectureFromText } from "../../assets/cityToPrefecture";
import {
  clearFootprintHistory,
  listFootprintHistory,
  pushFootprintHistory,
  type FootprintHistoryItem,
} from "../../utils/footprintSearchHistory";
import { styles } from "./addFootprintStyles";

type Props = NativeStackScreenProps<AppStackParamList, "AddFootprint">;

type Picked = {
  name: string;
  address: string;
  city: string;
  lng: number;
  lat: number;
  type: string;
};

const CHIPS = [
  { q: "美食", icon: "🍴" },
  { q: "酒店", icon: "🏨" },
  { q: "景点", icon: "🏛" },
  { q: "加油站", icon: "⛽" },
];

function categoryFromType(type: string): "spots" | "foods" {
  return /餐|美食|食品|饮|咖啡|茶|小吃/.test(type) ? "foods" : "spots";
}

function cityOfPoi(poi: PoiSearchResult, fallback: string): string {
  const blob = `${poi.address || ""} ${poi.location?.address || ""} ${poi.name}`;
  return resolvePrefectureFromText(blob)?.city || fallback;
}

export function AddFootprintScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const amapKey = getAmapJsKey();
  const webRef = useRef<WebView>(null);
  const mapReadyRef = useRef(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [q, setQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<PoiSearchResult[]>([]);
  const [history, setHistory] = useState<FootprintHistoryItem[]>([]);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locCity, setLocCity] = useState(
    () => peekCachedCity()?.replace(/市$/, "") || "",
  );
  const [userLoc, setUserLoc] = useState<{ lng: number; lat: number } | null>(
    () => peekCachedLocation(),
  );
  const userLocRef = useRef(userLoc);
  userLocRef.current = userLoc;
  const locCityRef = useRef(locCity);
  locCityRef.current = locCity;

  const inject = useCallback((js: string) => {
    webRef.current?.injectJavaScript(`${js}; true;`);
  }, []);

  const bootHtml = useMemo(() => {
    if (!amapKey) return "";
    return buildAmapHtml({
      key: amapKey,
      markers: [],
      polyline: [],
      interactive: true,
      userLocation: null,
      linkMarkers: false,
    });
  }, [amapKey]);

  useEffect(() => {
    void listFootprintHistory().then(setHistory);
  }, []);

  const centerMapOn = useCallback(
    (pos: { lng: number; lat: number }) => {
      inject(
        buildMapUserLocationJs(pos.lng, pos.lat, {
          center: true,
          zoom: 16,
          clearMarkers: true,
        }),
      );
    },
    [inject],
  );

  const applyLocation = useCallback(
    (pos: { lng: number; lat: number }, city?: string) => {
      setUserLoc(pos);
      if (city) setLocCity(city.replace(/市$/, ""));
      centerMapOn(pos);
    },
    [centerMapOn],
  );

  const locate = useCallback(
    async (interactive = false) => {
      if (interactive) setLocating(true);
      else {
        const cached = peekCachedLocation();
        const cachedCity = peekCachedCity()?.replace(/市$/, "");
        if (cached) applyLocation(cached, cachedCity);
      }

      try {
        const ok = await ensureLocationAccess(
          interactive
            ? async () =>
                new Promise<"granted" | "denied">((resolve) => {
                  Alert.alert("定位权限", "允许知径获取位置，便于搜索附近地点？", [
                    { text: "不允许", style: "cancel", onPress: () => resolve("denied") },
                    { text: "允许", onPress: () => resolve("granted") },
                  ]);
                })
            : undefined,
        );
        if (!ok) {
          if (interactive) {
            Alert.alert("未开启定位", "可在系统设置中打开定位权限后再试。");
          }
          return;
        }

        const pos = interactive
          ? await getFreshDeviceLocation()
          : await getDeviceLocation();
        let city = peekCachedCity()?.replace(/市$/, "");
        try {
          const geo = await api.destinations.regeo(pos.lng, pos.lat);
          city = (geo.city || "").replace(/市$/, "");
          rememberLocation(pos, geo.city || undefined);
        } catch {
          rememberLocation(pos, city);
        }
        applyLocation(pos, city);
      } catch (e) {
        if (interactive) {
          Alert.alert("定位失败", describeLocationError(e));
        }
      } finally {
        setLocating(false);
      }
    },
    [applyLocation],
  );

  useEffect(() => {
    void locate(false);
  }, [locate]);

  const ensureSearchContext = useCallback(async () => {
    let pos = userLocRef.current ?? peekCachedLocation();
    if (pos && !userLocRef.current) {
      userLocRef.current = pos;
      setUserLoc(pos);
    }

    if (!pos) {
      const ok = await ensureLocationAccess();
      if (ok) {
        pos = await getDeviceLocation();
        userLocRef.current = pos;
        setUserLoc(pos);
      }
    }

    if (pos) {
      try {
        const geo = await api.destinations.regeo(pos.lng, pos.lat);
        const city = (geo.city || geo.province || "").replace(/市$/, "");
        if (city) {
          locCityRef.current = city;
          setLocCity(city);
        }
        rememberLocation(pos, geo.city || geo.province || undefined);
      } catch {
        /* 坐标仍可用于周边搜索 */
      }
    }

    return { pos, city: locCityRef.current };
  }, []);

  const runSearch = useCallback(
    async (keyword: string) => {
      const kw = keyword.trim();
      if (!kw) {
        setResults([]);
        return;
      }
      setSearching(true);
      try {
        const { pos, city } = await ensureSearchContext();
        if (!pos) {
          Alert.alert("需要定位", "请先点击地图「定位」，再搜索附近地点。");
          return;
        }
        const list = await api.trips.searchPois(kw, city, 15, true, pos);
        setResults(list);
      } catch (e) {
        Alert.alert("搜索失败", e instanceof Error ? e.message : "请稍后重试");
      } finally {
        setSearching(false);
      }
    },
    [ensureSearchContext],
  );

  function onChangeQuery(text: string) {
    setQ(text);
    setSearchOpen(true);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      void runSearch(text);
    }, 280);
  }

  function showOnMap(next: Picked) {
    Keyboard.dismiss();
    setSearchOpen(false);
    setPicked(next);
    void pushFootprintHistory(next).then(() =>
      listFootprintHistory().then(setHistory),
    );
    const markers: MapMarker[] = [
      { lng: next.lng, lat: next.lat, name: next.name, color: "#1a66ff" },
    ];
    inject(
      `window.clearUserLocation&&window.clearUserLocation();` +
        `window.updateMapData && window.updateMapData(${JSON.stringify(markers)}, [], false, false, 0);` +
        `window.__map && window.__map.setZoomAndCenter(16, [${next.lng}, ${next.lat}])`,
    );
  }

  function pickPoi(poi: PoiSearchResult) {
    const lng = poi.location?.lng;
    const lat = poi.location?.lat;
    if (lng == null || lat == null) {
      Alert.alert("无法定位", "该地点没有坐标，换一个试试");
      return;
    }
    showOnMap({
      name: poi.name,
      address: poi.address || poi.location?.address || "",
      city: cityOfPoi(poi, locCity),
      lng,
      lat,
      type: poi.type || "",
    });
  }

  function pickHistory(item: FootprintHistoryItem) {
    if (item.lng != null && item.lat != null) {
      showOnMap({
        name: item.name,
        address: item.address || "",
        city: item.city || locCity,
        lng: item.lng,
        lat: item.lat,
        type: "",
      });
      return;
    }
    setQ(item.name);
    setSearchOpen(true);
    void runSearch(item.name);
  }

  async function confirmCheckIn() {
    if (!picked || busy) return;
    setBusy(true);
    try {
      const city = picked.city || locCity;
      if (await isCheckedIn(city, picked.name)) {
        Alert.alert("已打卡", `「${picked.name}」已经在足迹里了`);
        return;
      }
      await addCheckIn({
        city,
        name: picked.name,
        category: categoryFromType(picked.type),
        lng: picked.lng,
        lat: picked.lat,
        address: picked.address,
      });
      Alert.alert("打卡成功", `已添加「${picked.name}」`, [
        { text: "完成", onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert("打卡失败", e instanceof Error ? e.message : "请稍后重试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      {amapKey && bootHtml ? (
        <NativeViewGestureHandler disallowInterruption>
          <View style={styles.mapBox} collapsable={false}>
            <WebView
              ref={webRef}
              originWhitelist={["*"]}
              source={{ html: bootHtml, baseUrl: "https://webapi.amap.com" }}
              style={styles.map}
              javaScriptEnabled
              domStorageEnabled
              scrollEnabled={false}
              onMessage={(e) => {
                try {
                  const msg = JSON.parse(e.nativeEvent.data);
                  if (msg?.type === "ready") {
                    mapReadyRef.current = true;
                    const pos = userLocRef.current;
                    if (pos) centerMapOn(pos);
                  }
                } catch {
                  /* ignore */
                }
              }}
              onLoadEnd={() => {
                mapReadyRef.current = true;
                const pos = userLocRef.current;
                if (pos) centerMapOn(pos);
              }}
            />
          </View>
        </NativeViewGestureHandler>
      ) : (
        <View style={styles.mapFallback}>
          <Text style={styles.mapFallbackText}>未配置地图 Key</Text>
        </View>
      )}

      <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 8) }]}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.topTitle}>添加足迹</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.mapCtrls}>
        <Pressable
          style={styles.ctrlBtn}
          onPress={() => void locate(true)}
          disabled={locating}
        >
          {locating ? (
            <ActivityIndicator color={colors.brand} size="small" />
          ) : (
            <Text style={styles.locateText}>定位</Text>
          )}
        </Pressable>
      </View>

      {picked && !searchOpen ? (
        <View style={styles.callout}>
          <View style={styles.calloutBody}>
            <Text style={styles.calloutName} numberOfLines={1}>
              {picked.name}
            </Text>
            <Text style={styles.calloutSub} numberOfLines={1}>
              {[picked.city, picked.address].filter(Boolean).join(" · ")}
            </Text>
          </View>
          <Pressable
            style={styles.confirmBtn}
            onPress={() => void confirmCheckIn()}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.confirmText}>确定打卡</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      <View
        style={[styles.searchDock, { paddingBottom: Math.max(insets.bottom, 12) }]}
      >
        <Pressable
          style={styles.searchBar}
          onPress={() => setSearchOpen(true)}
        >
          <Text style={styles.searchIcon}>⌕</Text>
          <Text
            style={[styles.searchPlaceholder, q ? styles.searchValue : null]}
            numberOfLines={1}
          >
            {q || "搜索地点，添加到足迹"}
          </Text>
          <Text style={styles.searchGo}>搜索</Text>
        </Pressable>
      </View>

      {searchOpen ? (
        <View
          style={[styles.searchSheet, { paddingTop: Math.max(insets.top, 8) }]}
        >
          <View style={styles.searchHead}>
            <Pressable
              onPress={() => {
                setSearchOpen(false);
                Keyboard.dismiss();
              }}
            >
              <Text style={styles.sheetBack}>‹</Text>
            </Pressable>
            <View style={styles.searchField}>
              <TextInput
                autoFocus
                value={q}
                onChangeText={onChangeQuery}
                placeholder={locCity ? `搜索${locCity}附近地点` : "搜索地点"}
                placeholderTextColor={colors.muted}
                style={styles.input}
                returnKeyType="search"
                onSubmitEditing={() => void runSearch(q)}
              />
            </View>
            <Pressable style={styles.searchBtn} onPress={() => void runSearch(q)}>
              <Text style={styles.searchBtnText}>搜索</Text>
            </Pressable>
          </View>

          <View style={styles.chips}>
            {CHIPS.map((c) => (
              <Pressable
                key={c.q}
                style={styles.chip}
                onPress={() => {
                  setQ(c.q);
                  void runSearch(c.q);
                }}
              >
                <Text style={styles.chipText}>
                  {c.icon} {c.q}
                </Text>
              </Pressable>
            ))}
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.list}
          >
            {searching ? (
              <ActivityIndicator color={colors.brand} style={{ marginTop: 24 }} />
            ) : results.length > 0 ? (
              results.map((poi) => (
                <Pressable
                  key={poi.poi_id || poi.name}
                  style={styles.row}
                  onPress={() => pickPoi(poi)}
                >
                  <Text style={styles.rowPin}>📍</Text>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle}>{poi.name}</Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {cityOfPoi(poi, locCity)}
                      {poi.address ? ` · ${poi.address}` : ""}
                    </Text>
                  </View>
                </Pressable>
              ))
            ) : (
              <>
                <View style={styles.histHead}>
                  <Text style={styles.histTitle}>历史记录</Text>
                  {history.length > 0 ? (
                    <Pressable
                      onPress={() =>
                        void clearFootprintHistory().then(() => setHistory([]))
                      }
                    >
                      <Text style={styles.histClear}>清空</Text>
                    </Pressable>
                  ) : null}
                </View>
                {history.length === 0 ? (
                  <Text style={styles.emptyHint}>搜一下想打卡的地点吧</Text>
                ) : (
                  history.map((h, i) => (
                    <Pressable
                      key={`${h.name}-${i}`}
                      style={styles.row}
                      onPress={() => pickHistory(h)}
                    >
                      <Text style={styles.rowPin}>
                        {h.lng != null ? "📍" : "⌕"}
                      </Text>
                      <View style={styles.rowBody}>
                        <Text style={styles.rowTitle}>{h.name}</Text>
                        {h.address || h.city ? (
                          <Text style={styles.rowSub} numberOfLines={1}>
                            {[h.city, h.address].filter(Boolean).join(" · ")}
                          </Text>
                        ) : null}
                      </View>
                    </Pressable>
                  ))
                )}
              </>
            )}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}
