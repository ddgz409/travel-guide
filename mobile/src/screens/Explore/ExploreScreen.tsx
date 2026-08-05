import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Keyboard,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated from "react-native-reanimated";
import { WebView } from "react-native-webview";
import * as Location from "expo-location";
import { citiesGrouped } from "../../data/cities";
import { FadeSlideIn, PressScale, enterFade, AnimatedDot } from "../../utils/motion";
import { colors, pastels } from "../../theme";
import { api } from "../../api/client";
import { getAmapJsKey } from "../../api/config";
import { buildAmapHtml, type MapMarker } from "../../utils/amapHtml";
import { getDeviceLocation, describeLocationError } from "../../utils/location";
import {
  loadLocationConsent,
  saveLocationConsent,
} from "../../utils/locationPrefs";
import { SLIDES, DESTINATIONS, INTERESTS, CARD_COLORS, SHORTCUT_COLORS } from "./content";
import { styles } from "./styles";

const CARD_COLORS_ARR = pastels;

export function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const navigation = useNavigation();
  const [slide, setSlide] = useState(0);
  const [q, setQ] = useState("");
  const [searchFocus, setSearchFocus] = useState(false);
  const heroRef = useRef<ScrollView>(null);
  const pauseAutoUntil = useRef(0);
  /** 防止 onBlur 的 180ms 定时器堆积：每次新失焦清除旧定时器 */
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 防止快速双击 city chip 触发两次 navigate */
  const navigatingRef = useRef(false);

  // 地图相关
  const amapKey = getAmapJsKey();
  const webRef = useRef<WebView>(null);
  const mapReadyRef = useRef(false);
  const [mapLoaded, setMapLoaded] = useState(false);

  // 定位城市状态
  const [locCity, setLocCity] = useState<string | null>(null);
  const [locCoord, setLocCoord] = useState<{ lng: number; lat: number } | null>(null);
  const [locLoading, setLocLoading] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [locBtnLoading, setLocBtnLoading] = useState(false);

  const cityGroups = useMemo(() => citiesGrouped(q), [q]);
  const showCityPanel = searchFocus || q.trim().length > 0;

  useEffect(() => {
    const t = setInterval(() => {
      if (Date.now() < pauseAutoUntil.current) return;
      setSlide((s) => {
        const next = (s + 1) % SLIDES.length;
        heroRef.current?.scrollTo({ x: next * screenW, animated: true });
        return next;
      });
    }, 5000);
    return () => clearInterval(t);
  }, [screenW]);

  // 组件卸载时清除 onBlur 残留定时器
  useEffect(() => {
    return () => {
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    };
  }, []);

  // 获取定位城市：先请求系统权限，再定位 + regeo
  const fetchLocation = useCallback(async (silent: boolean) => {
    if (silent) setLocLoading(true);
    else setLocBtnLoading(true);
    setLocError(null);
    try {
      // 1. 检查 app 内 consent
      let consent = await loadLocationConsent();
      if (consent === null) {
        // 首次静默时不弹窗，直接尝试请求系统权限
        // 如果系统权限已授予，consent 设为 granted
      }
      if (consent === "denied") {
        if (!silent) {
          setLocError("定位权限已关闭，可在设置中开启");
        }
        return;
      }

      // 2. 请求系统定位权限
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        await saveLocationConsent("denied");
        if (!silent) {
          setLocError("系统未授权定位，请在设置中允许");
        }
        return;
      }
      await saveLocationConsent("granted");

      // 3. 获取 GPS 坐标
      const { lng, lat } = await getDeviceLocation();
      setLocCoord({ lng, lat });

      // 4. 逆地理编码获取城市名
      const result = await api.destinations.regeo(lng, lat);
      if (result.city) {
        setLocCity(result.city);
      }
    } catch (e) {
      const msg = describeLocationError(e);
      setLocError(msg);
      if (!silent) {
        // 非静默模式下（点按钮触发）显示错误
      }
    } finally {
      setLocLoading(false);
      setLocBtnLoading(false);
    }
  }, []);

  // 页面加载时静默尝试获取定位城市
  useEffect(() => {
    fetchLocation(true);
  }, [fetchLocation]);

  function onHeroScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const x = e.nativeEvent.contentOffset.x;
    const i = Math.max(
      0,
      Math.min(SLIDES.length - 1, Math.round(x / screenW)),
    );
    setSlide(i);
  }

  function onHeroDragBegin() {
    pauseAutoUntil.current = Date.now() + 10000;
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

  // 卡片左右各 margin 6；分区左右 padding 20
  const shortcutW = (screenW - 30 - 20) / 2;
  // section padding 16*2 + gap 10 -> 一行两个
  const destW = (screenW - 32 - 10) / 2;

  // 地图标记：用户当前所在城市（有坐标时显示），否则空
  const cityMarkers: MapMarker[] = useMemo(() => {
    if (locCoord && locCity) {
      return [{ lng: locCoord.lng, lat: locCoord.lat, name: locCity }];
    }
    return [];
  }, [locCoord, locCity]);

  const mapHtml = useMemo(() => {
    if (!amapKey) return "";
    mapReadyRef.current = false;
    return buildAmapHtml({
      key: amapKey,
      markers: cityMarkers,
      interactive: true,
      userLocation: locCoord,
    });
  }, [amapKey, cityMarkers, locCoord]);

  const inject = useCallback((js: string) => {
    webRef.current?.injectJavaScript(`${js}; true;`);
  }, []);

  // 定位城市卡片用的描述（从 DESTINATIONS 找，找不到用默认）
  const locDesc = useMemo(() => {
    if (!locCity) return "";
    const d = DESTINATIONS.find(
      (x) => x.name === locCity || locCity.includes(x.name) || x.name.includes(locCity),
    );
    return d ? d.desc : "点击查看详情";
  }, [locCity]);

  // 地图点击放大 -> 跳转 MapFull
  function openFullMap() {
    if (cityMarkers.length === 0) return;
    (navigation as any).navigate("MapFull", {
      title: locCity || "我的位置",
      markers: cityMarkers,
    });
  }

  return (
    <View style={styles.root}>
      <Animated.View
        entering={enterFade(0)}
        style={[styles.topBar, { paddingTop: Math.max(insets.top, 10) }]}
      >
        <Text style={styles.logo}>旅迹</Text>
        <View style={styles.topActions}>
          <PressScale
            style={styles.topActionItem}
            onPress={() => (navigation as any).navigate("Settings")}
          >
            <Text style={styles.topCta}>设置</Text>
          </PressScale>
        </View>
      </Animated.View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 80 }}
      >
        <View style={styles.hero}>
          <ScrollView
            ref={heroRef}
            horizontal
            pagingEnabled
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            onScrollBeginDrag={onHeroDragBegin}
            onMomentumScrollEnd={onHeroScrollEnd}
          >
            {SLIDES.map((s) => (
              <Pressable
                key={s.dest}
                style={[styles.heroPage, { width: screenW }]}
                onPress={() => goGenerate(s.dest)}
              >
                <Image
                  source={s.img}
                  style={[styles.heroImg, { width: screenW }]}
                  resizeMode="cover"
                />
                <View style={styles.heroMask} />
                <View style={styles.heroText}>
                  <Text style={styles.heroEyebrow}>今日灵感</Text>
                  <Text style={styles.heroTitle}>{s.title}</Text>
                  <Text style={styles.heroSub}>{s.sub}</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.dots} pointerEvents="none">
            {SLIDES.map((_, i) => (
              <AnimatedDot key={i} active={i === slide} />
            ))}
          </View>
        </View>

        <FadeSlideIn delay={80} style={styles.searchWrap}>
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
        </FadeSlideIn>

        <FadeSlideIn delay={140} style={styles.shortcuts}>
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
        </FadeSlideIn>

        <FadeSlideIn delay={200} style={styles.section}>
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
        </FadeSlideIn>

        <FadeSlideIn delay={260} style={styles.section}>
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
                      <Image
                        source={d.img}
                        style={styles.destCover}
                        resizeMode="cover"
                      />
                    </View>
                  </View>
                </View>
              </PressScale>
            ))}
          </View>
        </FadeSlideIn>

        {/* 地图模块：用户当前所在城市 */}
        <FadeSlideIn delay={320} style={styles.mapSection}>
          <Text style={styles.sectionTitle}>
            {locCity ? `${locCity} · 我的位置` : "我的位置"}
          </Text>
          <View style={styles.mapBox}>
            {amapKey && mapHtml ? (
              <>
                {!mapLoaded ? (
                  <View style={styles.mapLoading}>
                    <ActivityIndicator color={colors.brand} />
                  </View>
                ) : null}
                <WebView
                  ref={webRef}
                  originWhitelist={["*"]}
                  source={{ html: mapHtml, baseUrl: "https://webapi.amap.com" }}
                  style={{ flex: 1 }}
                  javaScriptEnabled
                  domStorageEnabled
                  scrollEnabled={false}
                  pointerEvents="none"
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
                    setMapLoaded(true);
                    setTimeout(() => {
                      mapReadyRef.current = true;
                    }, 800);
                  }}
                />
                {/* 点击放大遮罩 */}
                <Pressable
                  style={styles.mapTapHint}
                  onPress={openFullMap}
                >
                  <View style={styles.mapTapBadge}>
                    <Text style={styles.mapTapText}>点击放大地图</Text>
                  </View>
                </Pressable>
                {/* 右下角控件：加减号 + 定位 */}
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
              </>
            ) : (
              <View style={styles.mapLoading}>
                <Text style={{ fontSize: 15, color: colors.muted }}>
                  {locLoading
                    ? "正在获取位置…"
                    : locError
                      ? locError
                      : "地图未配置，请检查高德 Key"}
                </Text>
              </View>
            )}
          </View>
        </FadeSlideIn>

        {/* 定位城市卡片 */}
        <FadeSlideIn delay={380}>
          {locCity ? (
            <PressScale
              style={styles.locCard}
              scaleTo={0.98}
              onPress={() => goCityDetail(locCity)}
            >
              <View style={styles.locBody}>
                <Text style={styles.locIcon}>📍</Text>
                <View style={styles.locInfo}>
                  <Text style={styles.locTitle}>你在 {locCity}</Text>
                  <Text style={styles.locMeta}>{locDesc}</Text>
                </View>
                <Text style={styles.locArrow}>›</Text>
              </View>
            </PressScale>
          ) : locLoading ? (
            <View style={styles.locHintCard}>
              <ActivityIndicator color={colors.brand} size="small" />
              <Text style={[styles.locHintText, { marginLeft: 12 }]}>
                正在获取你的位置…
              </Text>
            </View>
          ) : (
            <View style={styles.locHintCard}>
              <Text style={styles.locIcon}>📍</Text>
              <Text style={styles.locHintText}>
                {locError || "开启定位可查看你所在城市的信息"}
              </Text>
            </View>
          )}
        </FadeSlideIn>
      </ScrollView>
    </View>
  );
}
