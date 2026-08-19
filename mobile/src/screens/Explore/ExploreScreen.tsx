import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  InteractionManager,
  Keyboard,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { CollectionSummary } from "@travel-guide/shared";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { citiesGrouped } from "../../data/cities";
import { PressScale } from "../../utils/motion";
import { colors } from "../../theme";
import { api } from "../../api/client";
import { getAmapJsKey } from "../../api/config";
import { buildAmapHtml } from "../../utils/amapHtml";
import { buildMapUserLocationJs } from "../../utils/mapUserLocation";
import { CityCoverImage } from "../../components/PlaceImage";
import { CollectionCard } from "../../components/CollectionCard";
import { HeaderAvatarButton } from "../../components/HeaderAvatarButton";
import { SettingsGear } from "../../components/SettingsGear";
import { MapExpandIcon } from "../../components/MapExpandIcon";
import { MapLocateIcon } from "../../components/MapLocateIcon";
import { tabBarTotalHeight } from "../../components/CustomTabBar";
import {
  getDeviceLocation,
  getFreshDeviceLocation,
  describeLocationError,
  ensureLocationAccess,
  rememberLocation,
  peekCachedLocation,
  peekCachedAccuracy,
} from "../../utils/location";
import { DraggableBottomSheet } from "../CityDetail/DraggableBottomSheet";
import { useMainTab } from "../../navigation/MainTabContext";
import { DESTINATIONS, INTERESTS, CARD_COLORS, SHORTCUT_COLORS } from "./content";
import { styles } from "./styles";

export function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const navigation = useNavigation();
  const { tab, tabBarReveal } = useMainTab();
  const [q, setQ] = useState("");
  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [searchFocus, setSearchFocus] = useState(false);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigatingRef = useRef(false);

  const amapKey = getAmapJsKey();
  const webRef = useRef<WebView>(null);
  const mapReadyRef = useRef(false);
  const loadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapMounted, setMapMounted] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapKey, setMapKey] = useState(0);

  const [locCity, setLocCity] = useState<string | null>(null);
  const [locCoord, setLocCoord] = useState<{ lng: number; lat: number } | null>(null);
  const [locLoading, setLocLoading] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [locBtnLoading, setLocBtnLoading] = useState(false);

  const cityGroups = useMemo(() => citiesGrouped(q), [q]);
  const showCityPanel = searchFocus || q.trim().length > 0;

  const topPad = Math.max(insets.top, 10);
  const tabBarOffset = tabBarTotalHeight(insets.bottom);
  const locateTop = topPad + 56;

  useEffect(() => {
    return () => {
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    };
  }, []);

  const fetchLocation = useCallback(async (silent: boolean) => {
    if (silent) setLocLoading(true);
    else setLocBtnLoading(true);
    setLocError(null);

    const cached = peekCachedLocation();
    if (cached) setLocCoord(cached);

    try {
      const ok = await ensureLocationAccess(
        silent
          ? undefined
          : async () =>
              new Promise<"granted" | "denied">((resolve) => {
                Alert.alert(
                  "定位权限",
                  "是否允许知径获取你的位置，用于显示所在城市？",
                  [
                    { text: "不允许", style: "cancel", onPress: () => resolve("denied") },
                    { text: "允许", onPress: () => resolve("granted") },
                  ],
                );
              }),
      );
      if (!ok) {
        if (!silent) setLocError("定位权限已关闭，可在设置中开启");
        return;
      }

      const { lng, lat } = silent
        ? await getDeviceLocation()
        : await getFreshDeviceLocation();
      setLocCoord({ lng, lat });

      const result = await api.destinations.regeo(lng, lat);
      if (result.city) {
        setLocCity(result.city);
        rememberLocation({ lng, lat }, result.city);
      } else {
        rememberLocation({ lng, lat });
      }
    } catch (e) {
      const msg = describeLocationError(e);
      if (!cached) setLocError(msg);
    } finally {
      setLocLoading(false);
      setLocBtnLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchLocation(true);
  }, [fetchLocation]);

  const loadLatestCollections = useCallback(async () => {
    setCollectionsLoading(true);
    try {
      const res = await api.collections.list(8, 0);
      setCollections(res.items);
    } catch {
      setCollections([]);
    } finally {
      setCollectionsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (tab === "Explore") void loadLatestCollections();
    }, [tab, loadLatestCollections]),
  );

  function openSharedCollections() {
    (navigation as any).navigate("SharedCollections");
  }

  function goGenerate(dest?: string, interests?: string[]) {
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    (navigation as any).navigate("Generate", {
      destination: dest,
      interests,
    });
    setTimeout(() => {
      navigatingRef.current = false;
    }, 500);
  }

  function goCityDetail(city: string) {
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    (navigation as any).navigate("CityDetail", { city });
    setTimeout(() => {
      navigatingRef.current = false;
    }, 500);
  }

  const shortcutW = (screenW - 30 - 20) / 2;
  const destW = (screenW - 32 - 10) / 2;

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

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      setMapMounted(true);
    });
    return () => task.cancel();
  }, []);

  useEffect(() => {
    mapReadyRef.current = false;
    setMapLoaded(false);
    setMapError(null);
  }, [mapHtml, mapKey]);

  const retryMap = useCallback(() => {
    mapReadyRef.current = false;
    setMapLoaded(false);
    setMapError(null);
    setMapKey((k) => k + 1);
  }, []);

  const injectLocation = useCallback(() => {
    if (!mapReadyRef.current || !locCoord) return;
    webRef.current?.injectJavaScript(
      `${buildMapUserLocationJs(locCoord.lng, locCoord.lat, {
        center: true,
        zoom: 15,
        clearMarkers: true,
      })}; true;`,
    );
  }, [locCoord]);

  const resizeMap = useCallback(() => {
    webRef.current?.injectJavaScript(
      `(function(){ if(window.__mapResize){ window.__mapResize(); } else if(window.__map){ try{ window.__map.resize(); }catch(e){} } })(); true;`,
    );
  }, []);

  // Tab 切回探索页时 WebView 从 display:none 恢复，需触发 resize 否则地图空白
  useEffect(() => {
    if (tab !== "Explore" || !mapMounted) return;
    const t = setTimeout(() => {
      if (mapReadyRef.current) resizeMap();
    }, 150);
    return () => clearTimeout(t);
  }, [tab, mapMounted, mapLoaded, resizeMap]);

  useEffect(() => {
    if (!mapMounted || mapLoaded || mapError) return;
    loadTimerRef.current = setTimeout(() => {
      if (!mapReadyRef.current) {
        setMapError("地图加载超时，请检查网络后重试");
      }
    }, 12000);
    return () => {
      if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
    };
  }, [mapMounted, mapLoaded, mapError, mapKey]);

  useEffect(() => {
    injectLocation();
  }, [mapLoaded, injectLocation]);

  const sheetTitle = locCity || "探索";
  const sheetDesc = locLoading
    ? "正在获取你的位置…"
    : locError || "搜目的地，或从下方选城市开始规划";

  function openFullMap() {
    (navigation as any).navigate("MapFull", {
      title: locCity || "我的位置",
      markers: [],
      userLocation: locCoord
        ? { ...locCoord, accuracy: peekCachedAccuracy() }
        : undefined,
    });
  }

  return (
    <View style={styles.root}>
      {amapKey && mapHtml && mapMounted ? (
        <>
          {!mapLoaded && !mapError ? (
            <View style={styles.mapLoading}>
              <ActivityIndicator color={colors.brand} />
            </View>
          ) : null}
          {mapError ? (
            <View style={styles.mapLoading}>
              <Text style={styles.mapErrorText}>{mapError}</Text>
              <Pressable style={styles.mapRetryBtn} onPress={retryMap}>
                <Text style={styles.mapRetryText}>重新加载</Text>
              </Pressable>
            </View>
          ) : null}
          <WebView
            key={mapKey}
            ref={webRef}
            originWhitelist={["*"]}
            source={{ html: mapHtml, baseUrl: "https://webapi.amap.com" }}
            style={[styles.map, !mapLoaded && !mapError ? styles.mapHidden : null]}
            javaScriptEnabled
            domStorageEnabled
            scrollEnabled={false}
            setSupportMultipleWindows={false}
            collapsable={false}
            onMessage={(e) => {
              try {
                const msg = JSON.parse(e.nativeEvent.data);
                if (msg?.type === "ready") {
                  mapReadyRef.current = true;
                  setMapLoaded(true);
                  setMapError(null);
                  if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
                  setTimeout(() => injectLocation(), 80);
                  setTimeout(() => resizeMap(), 120);
                } else if (msg?.type === "error") {
                  setMapError("地图加载失败，请检查网络后重试");
                }
              } catch {
                /* ignore */
              }
            }}
            onRenderProcessGone={() => {
              retryMap();
              return true;
            }}
            onContentProcessDidTerminate={() => {
              retryMap();
            }}
          />
        </>
      ) : (
        <View style={styles.mapLoading}>
          {amapKey && mapHtml ? (
            <ActivityIndicator color={colors.brand} />
          ) : (
            <Text style={{ fontSize: 15, color: colors.muted }}>
              {locLoading ? "正在获取位置…" : locError || "地图未配置，请检查高德 Key"}
            </Text>
          )}
        </View>
      )}

      <View style={[styles.topOverlay, { paddingTop: topPad }]}>
        <View style={styles.topAvatar}>
          <HeaderAvatarButton />
        </View>
        <PressScale
          style={styles.topSettingsBtn}
          onPress={() => (navigation as any).navigate("Settings")}
        >
          <SettingsGear size={22} color={colors.ink} holeColor={colors.card} />
        </PressScale>
      </View>

      <View style={[styles.mapControls, { top: locateTop }]}>
        <Pressable
          style={styles.mapCtrlBtn}
          onPress={() => void fetchLocation(false)}
          disabled={locBtnLoading}
        >
          {locBtnLoading ? (
            <ActivityIndicator color={colors.brand} size="small" />
          ) : (
            <MapLocateIcon size={18} color="#1a66ff" />
          )}
        </Pressable>
        {amapKey ? (
          <Pressable
            style={styles.mapCtrlBtn}
            onPress={openFullMap}
            accessibilityRole="button"
            accessibilityLabel="全屏地图"
          >
            <MapExpandIcon size={18} color="#1a66ff" />
          </Pressable>
        ) : null}
      </View>

      <DraggableBottomSheet
        bottomInset={8}
        bottomOffset={tabBarOffset}
        surface="page"
        tabBarReveal={tabBarReveal}
      >
        <View style={styles.sheetContent}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle} numberOfLines={1}>
              {sheetTitle}
            </Text>
            {locCity ? (
              <Pressable
                style={styles.nearbyBubble}
                onPress={() => goCityDetail(locCity)}
              >
                <Text style={styles.nearbyBubbleText}>附近发现</Text>
                <Text style={styles.nearbyBubbleArrow}>›</Text>
              </Pressable>
            ) : null}
          </View>
          {!locCity ? (
            <Text style={styles.sheetDesc} numberOfLines={2}>
              {sheetDesc}
            </Text>
          ) : null}

          <ScrollView
            style={styles.sheetScroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            contentContainerStyle={[
              styles.sheetScrollContent,
              { paddingBottom: tabBarOffset },
            ]}
          >
          <View style={styles.searchWrap}>
            <View style={styles.searchBox}>
              <TextInput
                style={styles.searchInput}
                value={q}
                onChangeText={setQ}
                onFocus={() => setSearchFocus(true)}
                onBlur={() => {
                  if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
                  blurTimerRef.current = setTimeout(() => setSearchFocus(false), 180);
                }}
                placeholder="搜目的地，或从下方选城市"
                placeholderTextColor={colors.muted}
                returnKeyType="search"
                onSubmitEditing={() => {
                  if (q.trim()) goGenerate(q.trim());
                }}
              />
              <Pressable
                style={styles.searchBtn}
                onPress={() => {
                  if (q.trim()) goGenerate(q.trim());
                }}
              >
                <Text style={styles.searchBtnText}>搜索</Text>
              </Pressable>
            </View>

            {showCityPanel ? (
              <View style={styles.cityPanel}>
                <Text style={styles.cityPanelTitle}>全部城市 · 按首字母</Text>
                <ScrollView
                  style={styles.cityScroll}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="always"
                >
                  {cityGroups.length === 0 ? (
                    <Text style={styles.cityEmpty}>没有匹配城市，可直接搜索</Text>
                  ) : (
                    cityGroups.map(([letter, cities]) => (
                      <View key={letter} style={styles.cityGroup}>
                        <Text style={styles.cityLetter}>{letter}</Text>
                        <View style={styles.cityChips}>
                          {cities.map((name) => (
                            <PressScale
                              key={name}
                              scaleTo={0.96}
                              style={[
                                styles.cityChip,
                                q.trim() === name && styles.cityChipOn,
                              ]}
                              onPress={() => {
                                Keyboard.dismiss();
                                setQ(name);
                                setSearchFocus(false);
                                goCityDetail(name);
                              }}
                            >
                              <Text
                                style={[
                                  styles.cityChipText,
                                  q.trim() === name && styles.cityChipTextOn,
                                ]}
                              >
                                {name}
                              </Text>
                            </PressScale>
                          ))}
                        </View>
                      </View>
                    ))
                  )}
                </ScrollView>
              </View>
            ) : null}
          </View>

          <View style={styles.shortcuts}>
            {[
              {
                title: "AI 助手",
                desc: "旅游问题随时问",
                onPress: () => (navigation as any).navigate("Chat"),
              },
              {
                title: "大家的收藏",
                desc: "订阅旅友清单",
                onPress: openSharedCollections,
              },
              {
                title: "出行搜索",
                desc: "机票火车票比价",
                onPress: () => (navigation as any).navigate("TravelSearch"),
              },
            ].map((x, i) => (
              <PressScale
                key={x.title}
                style={[
                  styles.shortcut,
                  {
                    width: shortcutW,
                    backgroundColor: SHORTCUT_COLORS[i % SHORTCUT_COLORS.length],
                  },
                ]}
                onPress={x.onPress}
              >
                <Text style={styles.shortcutTitle}>{x.title}</Text>
                <Text style={styles.shortcutDesc}>{x.desc}</Text>
              </PressScale>
            ))}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>按兴趣出发</Text>
            <View style={styles.chips}>
              {INTERESTS.map((it) => (
                <PressScale
                  key={it.tag}
                  style={styles.chip}
                  onPress={() => goGenerate(undefined, [it.tag])}
                >
                  <Text style={styles.chipText}>{it.label}</Text>
                </PressScale>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionRow}>
              <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>
                热门目的地
              </Text>
              <PressScale onPress={() => goGenerate()}>
                <Text style={[styles.sectionLink, { marginBottom: 0 }]}>
                  AI 生成 {"->"}
                </Text>
              </PressScale>
            </View>
            <View style={styles.destGrid}>
              {DESTINATIONS.map((d, i) => (
                <PressScale
                  key={d.name}
                  style={[styles.destCardPress, { width: destW }]}
                  scaleTo={0.985}
                  onPress={() => goCityDetail(d.name)}
                >
                  <View
                    style={[
                      styles.destCard,
                      { backgroundColor: CARD_COLORS[i % CARD_COLORS.length] },
                    ]}
                  >
                    <View style={styles.destLeft}>
                      <Text style={styles.destTitle} numberOfLines={1}>
                        {d.name}
                      </Text>
                      <Text style={styles.destMeta} numberOfLines={2}>
                        {d.desc}
                      </Text>
                    </View>
                    <View style={styles.destCoverWrap} pointerEvents="none">
                      <View style={styles.destCoverInner}>
                        <CityCoverImage
                          city={d.name}
                          landmark={d.landmark}
                          style={styles.destCover}
                          resizeMode="cover"
                        />
                      </View>
                    </View>
                  </View>
                </PressScale>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionRow}>
              <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>最新共享</Text>
              <PressScale onPress={openSharedCollections}>
                <Text style={[styles.sectionLink, { marginBottom: 0 }]}>查看全部 →</Text>
              </PressScale>
            </View>
            {collectionsLoading && collections.length === 0 ? (
              <ActivityIndicator color={colors.brand} style={{ marginVertical: 12 }} />
            ) : null}
            {collections.slice(0, 8).map((item) => (
              <CollectionCard
                key={item.id}
                item={item}
                onPress={() =>
                  (navigation as any).navigate("CollectionDetail", {
                    collectionId: item.id,
                  })
                }
              />
            ))}
          </View>
        </ScrollView>
        </View>
      </DraggableBottomSheet>
    </View>
  );
}
