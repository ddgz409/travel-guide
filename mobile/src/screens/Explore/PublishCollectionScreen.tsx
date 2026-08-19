import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeViewGestureHandler } from "react-native-gesture-handler";
import { WebView } from "react-native-webview";
import type { CollectionPlace, PoiSearchResult } from "@travel-guide/shared";
import { ApiError } from "@travel-guide/shared";
import { api } from "../../api/client";
import { getAmapJsKey } from "../../api/config";
import { useAuth } from "../../auth/AuthContext";
import { PlaceImage } from "../../components/PlaceImage";
import { MapLocateIcon } from "../../components/MapLocateIcon";
import { colors } from "../../theme";
import type { AppStackParamList } from "../../navigation/types";
import { buildAmapHtml, type MapMarker } from "../../utils/amapHtml";
import { buildMapUserLocationJs } from "../../utils/mapUserLocation";
import {
  ensureLocationAccess,
  getDeviceLocation,
  getFreshDeviceLocation,
  describeLocationError,
  peekCachedCity,
  peekCachedLocation,
  rememberLocation,
} from "../../utils/location";
import { resolvePrefectureFromText } from "../../assets/cityToPrefecture";
import {
  listFavoriteFolders,
  listFavoritePlaces,
} from "../../utils/favoriteStore";
import { styles } from "./publishCollectionStyles";

type Props = NativeStackScreenProps<AppStackParamList, "PublishCollection">;

const EMOJIS = ["📁", "📚", "🌲", "☕", "🍜", "🌊", "🏔️", "🌸", "🎨", "🗺️"];

function cityOfPoi(poi: PoiSearchResult, fallback: string): string {
  const blob = `${poi.address || ""} ${poi.location?.address || ""} ${poi.name}`;
  return resolvePrefectureFromText(blob)?.city || fallback;
}

function placesToMarkers(
  places: CollectionPlace[],
  selectedIndex: number | null,
): MapMarker[] {
  return places
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.lng != null && p.lat != null)
    .map(({ p, i }) => ({
      lng: p.lng!,
      lat: p.lat!,
      name: p.name,
      color: i === selectedIndex ? "#111111" : "#1a66ff",
      label: String(i + 1),
    }));
}

export function PublishCollectionScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const { user } = useAuth();
  const editId = route.params?.collectionId;
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const amapKey = getAmapJsKey();
  const webRef = useRef<WebView>(null);
  const mapReadyRef = useRef(false);

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [emoji, setEmoji] = useState("📁");
  const [places, setPlaces] = useState<CollectionPlace[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(!!editId);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<PoiSearchResult[]>([]);
  const [locCity, setLocCity] = useState(
    () => peekCachedCity()?.replace(/市$/, "") || "北京",
  );
  const [userLoc, setUserLoc] = useState<{ lng: number; lat: number } | null>(
    () => peekCachedLocation(),
  );
  const [locating, setLocating] = useState(false);
  const userLocRef = useRef(userLoc);
  userLocRef.current = userLoc;
  const locCityRef = useRef(locCity);
  locCityRef.current = locCity;

  const inject = useCallback((js: string) => {
    webRef.current?.injectJavaScript(`${js}; true;`);
  }, []);

  const mapHtml = useMemo(() => {
    if (!amapKey) return "";
    return buildAmapHtml({
      key: amapKey,
      markers: [],
      interactive: true,
      userLocation: null,
      linkMarkers: false,
    });
  }, [amapKey]);

  const syncMapMarkers = useCallback(
    (nextPlaces: CollectionPlace[], sel: number | null, centerOn?: { lng: number; lat: number }) => {
      if (!mapReadyRef.current) return;
      const markers = placesToMarkers(nextPlaces, sel);
      inject(
        `window.clearUserLocation&&window.clearUserLocation();` +
          `window.updateMapData && window.updateMapData(${JSON.stringify(markers)}, [], false, false, 0);` +
          (centerOn
            ? `window.__map && window.__map.setZoomAndCenter(16, [${centerOn.lng}, ${centerOn.lat}])`
            : ""),
      );
    },
    [inject],
  );

  useEffect(() => {
    if (!user) {
      Alert.alert("需要登录", "登录后才能发布共享收藏夹", [
        { text: "取消", onPress: () => navigation.goBack() },
        { text: "去登录", onPress: () => navigation.navigate("Login") },
      ]);
    }
  }, [user, navigation]);

  useEffect(() => {
    if (!editId) return;
    void (async () => {
      try {
        const d = await api.collections.get(editId);
        if (!d.is_owner) {
          Alert.alert("无权编辑");
          navigation.goBack();
          return;
        }
        setTitle(d.title);
        setSummary(d.summary || "");
        setEmoji(d.emoji || "📁");
        setPlaces(d.places);
      } catch (e) {
        Alert.alert("加载失败", e instanceof ApiError ? e.message : "请重试");
        navigation.goBack();
      } finally {
        setLoading(false);
      }
    })();
  }, [editId, navigation]);

  useEffect(() => {
    syncMapMarkers(places, selectedIndex);
  }, [places, selectedIndex, syncMapMarkers]);

  const locate = useCallback(async (interactive = false) => {
    if (interactive) setLocating(true);
    try {
      const ok = await ensureLocationAccess(
        interactive
          ? async () =>
              new Promise<"granted" | "denied">((resolve) => {
                Alert.alert("定位权限", "允许知径获取位置，便于搜索附近高德 POI？", [
                  { text: "不允许", style: "cancel", onPress: () => resolve("denied") },
                  { text: "允许", onPress: () => resolve("granted") },
                ]);
              })
          : undefined,
      );
      if (!ok) return;
      const pos = interactive ? await getFreshDeviceLocation() : await getDeviceLocation();
      setUserLoc(pos);
      userLocRef.current = pos;
      try {
        const geo = await api.destinations.regeo(pos.lng, pos.lat);
        const city = (geo.city || geo.province || "").replace(/市$/, "");
        if (city) {
          setLocCity(city);
          locCityRef.current = city;
        }
        rememberLocation(pos, geo.city || geo.province || undefined);
      } catch {
        rememberLocation(pos);
      }
      if (mapReadyRef.current) {
        inject(buildMapUserLocationJs(pos.lng, pos.lat, { center: !places.length, zoom: 15 }));
      }
    } catch (e) {
      if (interactive) Alert.alert("定位失败", describeLocationError(e));
    } finally {
      setLocating(false);
    }
  }, [inject, places.length]);

  useEffect(() => {
    void locate(false);
  }, [locate]);

  const ensureSearchContext = useCallback(async () => {
    let pos = userLocRef.current ?? peekCachedLocation();
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
        /* ignore */
      }
    }
    return { pos, city: locCityRef.current };
  }, []);

  /** 高德 POI 周边/城市搜索（有定位优先周边，无定位按城市关键词搜） */
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
        const searchCity = city || locCity || places[0]?.city || "北京";
        const list = await api.trips.searchPois(kw, searchCity, 15, true, pos);
        setResults(list);
        if (list.length === 0) {
          Alert.alert("未找到地点", `高德未返回「${kw}」相关 POI，请换个关键词`);
        }
      } catch (e) {
        Alert.alert("搜索失败", e instanceof Error ? e.message : "请稍后重试");
      } finally {
        setSearching(false);
      }
    },
    [ensureSearchContext, locCity, places],
  );

  function onChangeQuery(text: string) {
    setQ(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => void runSearch(text), 280);
  }

  function addPoiFromAmap(poi: PoiSearchResult) {
    const lng = poi.location?.lng;
    const lat = poi.location?.lat;
    if (lng == null || lat == null) {
      Alert.alert("无法定位", "该高德 POI 没有坐标，请换一个");
      return;
    }
    const city = cityOfPoi(poi, locCity);
    const next: CollectionPlace = {
      name: poi.name,
      city,
      address: poi.address || poi.location?.address || "",
      lng,
      lat,
      poi_id: poi.poi_id || null,
    };
    if (places.some((p) => p.poi_id && p.poi_id === next.poi_id)) {
      Alert.alert("已在列表中");
      return;
    }
    setPlaces((prev) => {
      const merged = [...prev, next];
      queueMicrotask(() => {
        setSelectedIndex(merged.length - 1);
        syncMapMarkers(merged, merged.length - 1, { lng, lat });
      });
      return merged;
    });
    setQ("");
    setResults([]);
    Keyboard.dismiss();
  }

  async function importFromFavorites() {
    const folders = await listFavoriteFolders();
    if (folders.length === 0) {
      Alert.alert("暂无收藏", "请先在「我的收藏」里添加地点");
      return;
    }
    Alert.alert(
      "从收藏导入",
      "选择收藏夹（无坐标的地点需重新搜索高德 POI）",
      [
        ...folders.map((f) => ({
          text: f.name,
          onPress: async () => {
            const list = await listFavoritePlaces(f.id);
            const withCoords = list.filter((p) => p.lng != null && p.lat != null);
            if (withCoords.length === 0) {
              Alert.alert("提示", "该收藏夹地点缺少坐标，请用上方搜索添加");
              return;
            }
            const imported: CollectionPlace[] = withCoords.map((p) => ({
              name: p.name,
              city: p.city,
              address: p.address,
              lng: p.lng,
              lat: p.lat,
              poi_id: p.poiId || null,
            }));
            setPlaces((prev) => {
              const seen = new Set(prev.map((x) => `${x.city}::${x.name}`));
              const merged = [...prev];
              for (const p of imported) {
                const key = `${p.city}::${p.name}`;
                if (!seen.has(key)) {
                  seen.add(key);
                  merged.push(p);
                }
              }
              return merged;
            });
          },
        })),
        { text: "取消", style: "cancel" },
      ],
    );
  }

  function selectPlace(index: number) {
    setSelectedIndex(index);
    const p = places[index];
    if (p?.lng != null && p?.lat != null) {
      syncMapMarkers(places, index, { lng: p.lng, lat: p.lat });
    }
  }

  async function publish() {
    const t = title.trim();
    if (!t) {
      Alert.alert("请填写标题");
      return;
    }
    if (places.length === 0) {
      Alert.alert("请至少添加 1 个地点");
      return;
    }
    if (!user) return;
    setSaving(true);
    try {
      const payload = {
        title: t,
        summary: summary.trim() || null,
        emoji,
        city: places[0]?.city || locCity,
        places,
      };
      if (editId) {
        await api.collections.update(editId, payload);
        Alert.alert("已更新", "你的共享收藏夹已保存");
        navigation.goBack();
      } else {
        const created = await api.collections.create(payload);
        navigation.replace("CollectionDetail", { collectionId: created.id });
      }
    } catch (e) {
      Alert.alert("保存失败", e instanceof ApiError ? e.message : "请稍后重试");
    } finally {
      setSaving(false);
    }
  }

  function removePlace(index: number) {
    setPlaces((prev) => prev.filter((_, i) => i !== index));
    setSelectedIndex((sel) => {
      if (sel == null) return null;
      if (sel === index) return null;
      return sel > index ? sel - 1 : sel;
    });
  }

  function updatePlaceNote(index: number, note: string) {
    setPlaces((prev) =>
      prev.map((p, i) => (i === index ? { ...p, note: note.trim() || null } : p)),
    );
  }

  if (loading) {
    return (
      <View style={[styles.mapRoot, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  const sheetInset = Math.max(insets.bottom, 10);

  return (
    <View style={styles.mapRoot}>
      {amapKey && mapHtml ? (
        <View style={[styles.mapBox, { width: winW, height: winH }]} collapsable={false}>
          <NativeViewGestureHandler disallowInterruption>
            <WebView
              ref={webRef}
              originWhitelist={["*"]}
              source={{ html: mapHtml, baseUrl: "https://webapi.amap.com" }}
              style={[styles.map, { width: winW, height: winH }]}
              javaScriptEnabled
              domStorageEnabled
              scrollEnabled={false}
              onMessage={(e) => {
                try {
                  const msg = JSON.parse(e.nativeEvent.data);
                  if (msg?.type === "ready") {
                    mapReadyRef.current = true;
                    syncMapMarkers(places, selectedIndex);
                    const pos = userLocRef.current;
                    if (pos && places.length === 0) {
                      inject(buildMapUserLocationJs(pos.lng, pos.lat, { center: true, zoom: 14 }));
                    }
                  }
                } catch {
                  /* ignore */
                }
              }}
            />
          </NativeViewGestureHandler>
        </View>
      ) : null}

      <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 8) }]}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>‹</Text>
        </Pressable>
        <Text style={styles.topTitle}>{editId ? "编辑收藏夹" : "发布收藏夹"}</Text>
        <View style={{ width: 40 }} />
      </View>

      <Pressable
        style={[styles.locateBtn, { top: Math.max(insets.top, 8) + 52 }]}
        onPress={() => void locate(true)}
        disabled={locating}
      >
        {locating ? (
          <ActivityIndicator color={colors.brand} size="small" />
        ) : (
          <MapLocateIcon size={18} color="#1a66ff" />
        )}
      </Pressable>

      <View style={[styles.staticSheet, { paddingBottom: sheetInset }]}>
        <View style={styles.staticSheetHandle}>
          <View style={styles.staticSheetHandleBar} />
        </View>
        <KeyboardAvoidingView
          style={styles.staticSheetBody}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
        >
        <ScrollView
          style={styles.sheetScroll}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="on-drag"
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.label}>标题</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="例如：常去的 8 个上海自习圣地"
            placeholderTextColor={colors.muted}
          />

          <Text style={styles.label}>简介（可选）</Text>
          <TextInput
            style={[styles.input, styles.inputMulti]}
            value={summary}
            onChangeText={setSummary}
            placeholder="写一句介绍"
            placeholderTextColor={colors.muted}
            multiline
          />

          <Text style={styles.label}>封面图标</Text>
          <View style={styles.emojiRow}>
            {EMOJIS.map((e) => (
              <Pressable
                key={e}
                style={[styles.emojiChip, emoji === e && styles.emojiChipOn]}
                onPress={() => setEmoji(e)}
              >
                <Text style={styles.emojiText}>{e}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.placeHead}>
            <Text style={styles.label}>地点 ({places.length}) · 高德 POI</Text>
            <Pressable onPress={() => void importFromFavorites()}>
              <Text style={styles.link}>从收藏导入</Text>
            </Pressable>
          </View>

          <View style={styles.searchField}>
            <TextInput
              value={q}
              onChangeText={onChangeQuery}
              placeholder={locCity ? `搜索${locCity}附近地点（高德 POI）` : "搜索城市内地点（高德 POI）"}
              placeholderTextColor={colors.muted}
              style={styles.searchInput}
              returnKeyType="search"
              onSubmitEditing={() => void runSearch(q)}
            />
          </View>
          {searching ? (
            <ActivityIndicator color={colors.brand} style={{ marginVertical: 8 }} />
          ) : null}
          {results.length > 0 ? (
            <View style={styles.resultsBox}>
              {results.map((poi) => (
                <Pressable
                  key={poi.poi_id || `${poi.name}-${poi.location?.lng}`}
                  style={styles.searchRow}
                  onPress={() => addPoiFromAmap(poi)}
                >
                  <Text style={styles.searchName}>{poi.name}</Text>
                  <Text style={styles.searchSub} numberOfLines={1}>
                    {poi.address || poi.location?.address || ""}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {places.map((p, i) => (
            <View
              key={`${p.poi_id || p.name}-${i}`}
              style={[styles.placeRow, selectedIndex === i && styles.placeRowActive]}
            >
              <View style={styles.placeRowTop}>
                <Pressable style={styles.placeMain} onPress={() => selectPlace(i)}>
                  <View style={styles.placeThumb}>
                    <PlaceImage
                      city={p.city}
                      name={p.name}
                      category="spots"
                      poiId={p.poi_id || undefined}
                      style={styles.placeThumbImg}
                    />
                  </View>
                  <View style={styles.placeBody}>
                    <Text style={styles.placeName}>{p.name}</Text>
                    <Text style={styles.placeSub} numberOfLines={1}>
                      {p.city} · {p.address}
                    </Text>
                  </View>
                </Pressable>
                <Pressable
                  onPress={() => removePlace(i)}
                  hitSlop={8}
                  style={styles.removeBtn}
                >
                  <Text style={styles.remove}>✕</Text>
                </Pressable>
              </View>
              {selectedIndex === i ? (
                <TextInput
                  style={styles.placeNoteInput}
                  value={p.note || ""}
                  onChangeText={(t) => updatePlaceNote(i, t)}
                  placeholder="地点备注（可选）"
                  placeholderTextColor={colors.muted}
                  multiline
                />
              ) : null}
            </View>
          ))}
        </ScrollView>
        </KeyboardAvoidingView>
        <Pressable
          style={[styles.publishBtn, saving && styles.publishBtnDisabled]}
          onPress={() => void publish()}
          disabled={saving}
        >
          <Text style={styles.publishText}>
            {saving ? "保存中…" : editId ? "保存修改" : "发布到探索页"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
