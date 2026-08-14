import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  InteractionManager,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import {
  NativeViewGestureHandler,
  ScrollView,
} from "react-native-gesture-handler";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { citiesGrouped } from "../../data/cities";
import { PressScale } from "../../utils/motion";
import { colors, pastels } from "../../theme";
import { api } from "../../api/client";
import { getAmapJsKey } from "../../api/config";
import { buildAmapHtml } from "../../utils/amapHtml";
import { buildMapUserLocationJs } from "../../utils/mapUserLocation";
import { CityCoverImage } from "../../components/PlaceImage";
import { HeaderAvatarButton } from "../../components/HeaderAvatarButton";
import { resolveImageUrl } from "../../utils/placeImage";
import { getDeviceLocation, getFreshDeviceLocation, describeLocationError, ensureLocationAccess, rememberLocation, peekCachedLocation, peekCachedAccuracy } from "../../utils/location";
import { DESTINATIONS, INTERESTS, CARD_COLORS, SHORTCUT_COLORS } from "./content";
import { styles } from "./styles";

const CARD_COLORS_ARR = pastels;

export function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const navigation = useNavigation();
  const [q, setQ] = useState("");
  const [searchFocus, setSearchFocus] = useState(false);
  /** 防止 onBlur 的 180ms 定时器堆积：每次新失焦清除旧定时器 */
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 防止快速双击 city chip 触发两次 navigate */
  const navigatingRef = useRef(false);

  // 地图相关
  const amapKey = getAmapJsKey();
  const webRef = useRef<WebView>(null);
  const mapGestureRef = useRef<NativeViewGestureHandler>(null);
  const mapReadyRef = useRef(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapMounted, setMapMounted] = useState(false);
  const [pageScrollEnabled, setPageScrollEnabled] = useState(true);

  // 定位城市状态
  const [locCity, setLocCity] = useState<string | null>(null);
  const [locCoord, setLocCoord] = useState<{ lng: number; lat: number } | null>(null);
  const [locLoading, setLocLoading] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [locBtnLoading, setLocBtnLoading] = useState(false);

  const cityGroups = useMemo(() => citiesGrouped(q), [q]);
  const showCityPanel = searchFocus || q.trim().length > 0;
  const [cityCovers, setCityCovers] = useState<Record<string, string>>({});

  // 组件卸载时清除 onBlur 残留定时器
  useEffect(() => {
    return () => {
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    };
  }, []);

  useEffect(() => {
    // 先用北京单城验证图片链路，避免 8 城并发触发高德 QPS 限制
    void api.destinations
      .placeImages("北京", "故宫博物院", "spots", 1)
      .then((res) => {
        if (res.image) {
          setCityCovers((prev) => ({ ...prev, 北京: resolveImageUrl(res.image!) }));
        }
      })
      .catch(() => {
        /* 失败时 CityCoverImage 显示本地 fallback */
      });
  }, []);

  // 获取定位城市：先请求系统权限，再定位 + regeo
  const fetchLocation = useCallback(async (silent: boolean) => {
    if (silent) setLocLoading(true);
    else setLocBtnLoading(true);
    setLocError(null);

    const cached = peekCachedLocation();
    if (cached) {
      setLocCoord(cached);
    }

    try {
      const ok = await ensureLocationAccess(
        silent
          ? undefined
          : async () =>
              new Promise<"granted" | "denied">((resolve) => {
                Alert.alert(
                  "定位权限",
                  "是否允许旅迹获取你的位置，用于显示所在城市？",
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

  // 页面加载时静默尝试获取定位城市
  useEffect(() => {
    fetchLocation(true);
  }, [fetchLocation]);

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

  // 卡片左右各 margin 6；分区左右 padding 20
  const shortcutW = (screenW - 30 - 20) / 2;
  // section padding 16*2 + gap 10 -> 一行两个
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
    if (!mapLoaded || !locCoord) return;
    webRef.current?.injectJavaScript(
      buildMapUserLocationJs(locCoord.lng, locCoord.lat, {
        center: true,
        zoom: 15,
        clearMarkers: true,
      }),
    );
  }, [mapLoaded, locCoord, locCity]);

  // 定位城市卡片用的描述（从 DESTINATIONS 找，找不到用默认）
  const locDesc = useMemo(() => {
    if (!locCity) return "";
    const d = DESTINATIONS.find(
      (x) => x.name === locCity || locCity.includes(x.name) || x.name.includes(locCity),
    );
    return d ? d.desc : "点击查看详情";
  }, [locCity]);

  // 地图点击放大 -> 跳转 MapFull（官方圆点定位，不用倒水滴 marker）
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
      <View
        style={[styles.topBar, { paddingTop: Math.max(insets.top, 10) }]}
      >
        <HeaderAvatarButton />
        <View style={styles.topActions}>
          <PressScale
            style={styles.topActionItem}
            onPress={() => (navigation as any).navigate("Settings")}
          >
            <Text style={styles.topCta}>设置</Text>
          </PressScale>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        scrollEnabled={pageScrollEnabled}
        waitFor={mapGestureRef}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        <View style={styles.hero}>
          <View style={styles.heroMapBox}>
            {amapKey && mapHtml && mapMounted ? (
              <>
                {!mapLoaded ? (
                  <View style={styles.mapLoading}>
                    <ActivityIndicator color={colors.brand} />
                  </View>
                ) : null}
                <NativeViewGestureHandler
                  ref={mapGestureRef}
                  disallowInterruption
                >
                  <View style={StyleSheet.absoluteFill} collapsable={false}>
                    <WebView
                      ref={webRef}
                      originWhitelist={["*"]}
                      source={{ html: mapHtml, baseUrl: "https://webapi.amap.com" }}
                      style={StyleSheet.absoluteFill}
                      javaScriptEnabled
                      domStorageEnabled
                      scrollEnabled={false}
                      setSupportMultipleWindows={false}
                      androidLayerType="hardware"
                      onMessage={(e) => {
                        try {
                          const msg = JSON.parse(e.nativeEvent.data);
                          if (msg?.type === "ready") {
                            mapReadyRef.current = true;
                            setMapLoaded(true);
                          }
                          if (msg?.type === "mapGesture") {
                            setPageScrollEnabled(!msg.payload?.active);
                          }
                        } catch {
                          /* ignore */
                        }
                      }}
                      onLoadEnd={() => {
                        setTimeout(() => {
                          mapReadyRef.current = true;
                          setMapLoaded(true);
                        }, 600);
                      }}
                    />
                  </View>
                </NativeViewGestureHandler>
                <View style={styles.heroLocBar} pointerEvents="box-none">
                  {locCity ? (
                    <PressScale
                      style={styles.heroLocChip}
                      scaleTo={0.98}
                      onPress={() => goCityDetail(locCity)}
                    >
                      <Text style={styles.heroLocIcon}>📍</Text>
                      <View style={styles.heroLocTextWrap}>
                        <Text style={styles.heroLocTitle}>你在 {locCity}</Text>
                        <Text style={styles.heroLocMeta} numberOfLines={1}>
                          {locDesc}
                        </Text>
                      </View>
                      <Text style={styles.heroLocArrow}>›</Text>
                    </PressScale>
                  ) : locLoading ? (
                    <View style={styles.heroLocChip}>
                      <ActivityIndicator color={colors.brand} size="small" />
                      <Text style={styles.heroLocHint}>正在获取你的位置…</Text>
                    </View>
                  ) : (
                    <Pressable
                      style={styles.heroLocChip}
                      onPress={() => void fetchLocation(false)}
                    >
                      <Text style={styles.heroLocIcon}>📍</Text>
                      <Text style={styles.heroLocHint}>
                        {locError || "点击开启定位，查看所在城市"}
                      </Text>
                    </Pressable>
                  )}
                </View>
                <View style={styles.heroMapControls} pointerEvents="box-none">
                  <Pressable
                    style={[styles.mapCtrlBtn, styles.mapLocateBtn]}
                    onPress={() => void fetchLocation(false)}
                    disabled={locBtnLoading}
                  >
                    {locBtnLoading ? (
                      <ActivityIndicator color="#1a66ff" size="small" />
                    ) : (
                      <Text style={styles.mapLocateText}>定位</Text>
                    )}
                  </Pressable>
                </View>
                <Pressable style={styles.heroMapExpand} onPress={openFullMap}>
                  <Text style={styles.mapTapText}>全屏</Text>
                </Pressable>
              </>
            ) : (
              <View style={styles.mapLoading}>
                {amapKey && mapHtml ? (
                  <ActivityIndicator color={colors.brand} />
                ) : (
                  <Text style={{ fontSize: 15, color: colors.muted }}>
                    {locLoading
                      ? "正在获取位置…"
                      : locError
                        ? locError
                        : "地图未配置，请检查高德 Key"}
                  </Text>
                )}
              </View>
            )}
          </View>
        </View>

        <View style={styles.searchWrap}>
          <View style={styles.searchBox}>
            <TextInput
              style={styles.searchInput}
              value={q}
              onChangeText={setQ}
              onFocus={() => setSearchFocus(true)}
              onBlur={() => {
                if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
                blurTimerRef.current = setTimeout(
                  () => setSearchFocus(false),
                  180,
                );
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
                        uri={cityCovers[d.name]}
                        fallback={d.img}
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
      </ScrollView>
    </View>
  );
}
