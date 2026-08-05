import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Keyboard,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
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
import { citiesGrouped } from "../../data/cities";
import { FadeSlideIn, PressScale, enterFade, AnimatedDot } from "../../utils/motion";
import { colors, pastels } from "../../theme";
import { api } from "../../api/client";
import { getAmapJsKey } from "../../api/config";
import { buildAmapHtml, type MapMarker } from "../../utils/amapHtml";
import { getDeviceLocation } from "../../utils/location";
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

  // 地图加载状态
  const [mapLoaded, setMapLoaded] = useState(false);
  const amapKey = getAmapJsKey();

  // 定位城市状态
  const [locCity, setLocCity] = useState<string | null>(null);
  const [locLoading, setLocLoading] = useState(false);

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

  // 页面加载时尝试获取定位城市（静默，失败不报错）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLocLoading(true);
      try {
        const { lng, lat } = await getDeviceLocation();
        const result = await api.destinations.regeo(lng, lat);
        if (!cancelled && result.city) {
          setLocCity(result.city);
        }
      } catch {
        // 定位失败静默忽略，不显示卡片
      } finally {
        if (!cancelled) setLocLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
    // 导航后重置，允许下次点击（延迟到动画结束）
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

  // 地图标记：8 个热门城市
  const cityMarkers: MapMarker[] = useMemo(
    () =>
      DESTINATIONS.map((d) => ({
        lng: d.lng,
        lat: d.lat,
        name: d.name,
      })),
    [],
  );

  const mapHtml = useMemo(() => {
    if (!amapKey) return "";
    return buildAmapHtml({
      key: amapKey,
      markers: cityMarkers,
      interactive: true,
    });
  }, [amapKey, cityMarkers]);

  // 定位城市卡片用的描述（从 DESTINATIONS 找，找不到用默认）
  const locDesc = useMemo(() => {
    if (!locCity) return "";
    const d = DESTINATIONS.find(
      (x) => x.name === locCity || locCity.includes(x.name) || x.name.includes(locCity),
    );
    return d ? d.desc : "点击查看详情";
  }, [locCity]);

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
                              // 先收键盘并标记失焦，避免 onBlur 的 180ms 延迟
                              // 在导航前卸载面板、吞掉点击。
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

        <FadeSlideIn delay={320} style={styles.mapSection}>
          <Text style={styles.sectionTitle}>探索热门城市</Text>
          <View style={styles.mapBox}>
            {amapKey && mapHtml ? (
              <>
                {!mapLoaded ? (
                  <View style={styles.mapLoading}>
                    <ActivityIndicator color={colors.brand} />
                  </View>
                ) : null}
                <WebView
                  originWhitelist={["*"]}
                  source={{ html: mapHtml, baseUrl: "https://webapi.amap.com" }}
                  style={{ flex: 1 }}
                  javaScriptEnabled
                  domStorageEnabled
                  scrollEnabled={false}
                  androidLayerType="hardware"
                  onLoadEnd={() => setMapLoaded(true)}
                />
              </>
            ) : (
              <View style={styles.mapLoading}>
                <Text style={{ fontSize: 15, color: colors.muted }}>
                  地图未配置，请检查高德 Key
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
                开启定位可查看你所在城市的信息
              </Text>
            </View>
          )}
        </FadeSlideIn>
      </ScrollView>
    </View>
  );
}
