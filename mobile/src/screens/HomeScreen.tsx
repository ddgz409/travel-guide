import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  Image,
  ImageSourcePropType,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated from "react-native-reanimated";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";
import { citiesGrouped } from "../cities";
import { loadLocalLlm } from "../llmStore";
import {
  AnimatedDot,
  FadeSlideIn,
  PressScale,
  enterFade,
} from "../motion";
import { colors } from "../theme";
import type { AppStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<AppStackParamList, "Home">;

const { width: SCREEN_W } = Dimensions.get("window");

const SLIDES: Array<{
  title: string;
  sub: string;
  dest: string;
  img: ImageSourcePropType;
}> = [
  {
    title: "长城秋色，城阙连云",
    sub: "登高望远，把京华秋意装进视野",
    dest: "北京",
    img: require("../../assets/covers/beijing_hero.jpg"),
  },
  {
    title: "外滩灯火，浦江夜色",
    sub: "摩天轮下看魔都心跳",
    dest: "上海",
    img: require("../../assets/covers/shanghai_bund.jpg"),
  },
  {
    title: "西湖烟雨，茶香入梦",
    sub: "环湖慢行，把雷峰夕照留给傍晚",
    dest: "杭州",
    img: require("../../assets/covers/hangzhou_hero.jpg"),
  },
  {
    title: "椰风浪暖，天涯海角",
    sub: "把冬天留给阳光与沙滩",
    dest: "三亚",
    img: require("../../assets/covers/sanya.jpg"),
  },
  {
    title: "苍山洱海，风花雪月",
    sub: "骑行海东，在古城巷口遇见慢时光",
    dest: "大理",
    img: require("../../assets/covers/dali.jpg"),
  },
];

const DESTINATIONS: Array<{
  name: string;
  desc: string;
  img: ImageSourcePropType;
}> = [
  {
    name: "北京",
    desc: "故宫长城 · 皇城根下",
    img: require("../../assets/covers/beijing_hero.jpg"),
  },
  {
    name: "成都",
    desc: "熊猫火锅 · 慢生活",
    img: require("../../assets/covers/chengdu.jpg"),
  },
  {
    name: "杭州",
    desc: "西湖龙井 · 江南烟雨",
    img: require("../../assets/covers/westlake.jpg"),
  },
  {
    name: "大理",
    desc: "风花雪月 · 苍山洱海",
    img: require("../../assets/covers/dali.jpg"),
  },
  {
    name: "西安",
    desc: "兵马俑 · 古城墙",
    img: require("../../assets/covers/xian.jpg"),
  },
  {
    name: "厦门",
    desc: "鼓浪屿 · 海边慢行",
    img: require("../../assets/covers/xiamen.jpg"),
  },
  {
    name: "上海",
    desc: "外滩夜景 · 魔都节奏",
    img: require("../../assets/covers/shanghai_bund.jpg"),
  },
  {
    name: "三亚",
    desc: "热带海岛 · 阳光沙滩",
    img: require("../../assets/covers/sanya.jpg"),
  },
];

const INTERESTS = [
  { label: "美食", tag: "美食" },
  { label: "人文", tag: "人文历史" },
  { label: "自然", tag: "自然风光" },
  { label: "亲子", tag: "亲子" },
  { label: "摄影", tag: "摄影" },
  { label: "购物", tag: "购物" },
];

export function HomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { user, isGuest, enterGuest } = useAuth();
  const [slide, setSlide] = useState(0);
  const [q, setQ] = useState("");
  const [searchFocus, setSearchFocus] = useState(false);
  const [llmStatus, setLlmStatus] = useState("检测 LLM 配置…");
  const heroRef = useRef<ScrollView>(null);
  const pauseAutoUntil = useRef(0);

  const cityGroups = useMemo(() => citiesGrouped(q), [q]);
  const showCityPanel = searchFocus || q.trim().length > 0;

  useEffect(() => {
    const t = setInterval(() => {
      if (Date.now() < pauseAutoUntil.current) return;
      setSlide((s) => {
        const next = (s + 1) % SLIDES.length;
        heroRef.current?.scrollTo({ x: next * SCREEN_W, animated: true });
        return next;
      });
    }, 5000);
    return () => clearInterval(t);
  }, []);

  function onHeroScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const x = e.nativeEvent.contentOffset.x;
    const i = Math.max(
      0,
      Math.min(SLIDES.length - 1, Math.round(x / SCREEN_W)),
    );
    setSlide(i);
  }

  function onHeroDragBegin() {
    pauseAutoUntil.current = Date.now() + 10000;
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (user) {
          const s = await api.auth.getLlmSettings();
          if (cancelled) return;
          setLlmStatus(
            s.has_api_key
              ? `LLM：账号 Key（${s.provider} / ${s.model}）`
              : `LLM：服务器默认（${s.provider} / ${s.model}）`,
          );
        } else {
          const local = await loadLocalLlm();
          if (cancelled) return;
          setLlmStatus(
            local.apiKey
              ? `LLM：本机 Key（${local.provider} / ${local.model}）`
              : "LLM：未配置 Key，将用服务器默认",
          );
        }
      } catch {
        if (!cancelled) setLlmStatus("LLM：配置读取失败");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function ensureCanGenerate() {
    if (!user && !isGuest) await enterGuest();
  }

  async function goGenerate(dest?: string, interests?: string[]) {
    await ensureCanGenerate();
    navigation.navigate("Generate", {
      destination: dest,
      interests,
    });
  }

  const cardW = (SCREEN_W - 20 * 2 - 12) / 2;

  return (
    <View style={styles.root}>
      <Animated.View
        entering={enterFade(0)}
        style={[styles.topBar, { paddingTop: Math.max(insets.top, 10) }]}
      >
        <Text style={styles.logo}>旅迹</Text>
        <View style={styles.topActions}>
          <PressScale onPress={() => navigation.navigate("Settings")}>
            <Text style={styles.topCta}>模型设置</Text>
          </PressScale>
          {user || isGuest ? (
            <PressScale onPress={() => navigation.navigate("Trips")}>
              <Text style={styles.topLink}>我的</Text>
            </PressScale>
          ) : null}
          {user ? (
            <Text style={styles.topMuted}>{user.username}</Text>
          ) : (
            <PressScale onPress={() => navigation.navigate("Login")}>
              <Text style={styles.topLink}>登录</Text>
            </PressScale>
          )}
        </View>
      </Animated.View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
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
                style={styles.heroPage}
                onPress={() => void goGenerate(s.dest)}
              >
                <Image
                  source={s.img}
                  style={styles.heroImg}
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
                // 稍延后，方便点选城市
                setTimeout(() => setSearchFocus(false), 180);
              }}
              placeholder="搜目的地，或从下方选城市"
              placeholderTextColor={colors.muted}
              returnKeyType="search"
              onSubmitEditing={() => {
                if (q.trim()) void goGenerate(q.trim());
              }}
            />
            <Pressable
              style={styles.searchBtn}
              onPress={() => {
                if (q.trim()) void goGenerate(q.trim());
              }}
            >
              <Text style={styles.searchBtnText}>搜索</Text>
            </Pressable>
          </View>

          {showCityPanel ? (
            <View style={styles.cityPanel}>
              <Text style={styles.cityPanelTitle}>快捷城市 · 按首字母</Text>
              <ScrollView
                style={styles.cityScroll}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
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
                              setQ(name);
                              setSearchFocus(false);
                              void goGenerate(name);
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
              title: "AI 生成攻略",
              desc: "一键定制行程",
              onPress: () => goGenerate(),
            },
            {
              title: "我的攻略",
              desc: "收藏与编辑",
              onPress: () => navigation.navigate("Trips"),
            },
            {
              title: "模型设置",
              desc: "自带 LLM API Key",
              onPress: () => navigation.navigate("Settings"),
            },
          ].map((x) => (
            <PressScale
              key={x.title}
              style={styles.shortcut}
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
            <Text style={styles.sectionTitle}>热门目的地</Text>
            <PressScale onPress={() => goGenerate()}>
              <Text style={styles.sectionLink}>AI 生成 →</Text>
            </PressScale>
          </View>
          <View style={styles.grid}>
            {DESTINATIONS.map((d) => (
              <PressScale
                key={d.name}
                style={[styles.card, { width: cardW }]}
                onPress={() => goGenerate(d.name)}
              >
                <Image source={d.img} style={styles.cardImg} resizeMode="cover" />
                <View style={styles.cardBody}>
                  <Text style={styles.cardName}>{d.name}</Text>
                  <Text style={styles.cardDesc} numberOfLines={1}>
                    {d.desc}
                  </Text>
                </View>
              </PressScale>
            ))}
          </View>
        </FadeSlideIn>

        <FadeSlideIn delay={320}>
          <PressScale
            style={styles.bigCta}
            onPress={() => goGenerate()}
            scaleTo={0.98}
          >
            <Text style={styles.bigCtaTitle}>开始定制行程</Text>
            <Text style={styles.bigCtaSub}>
              可先在「模型设置」填入自己的 LLM API Key
            </Text>
          </PressScale>
        </FadeSlideIn>

        <FadeSlideIn delay={380}>
          <PressScale
            style={styles.llmBar}
            onPress={() => navigation.navigate("Settings")}
          >
            <View style={styles.llmDot} />
            <View style={{ flex: 1 }}>
              <Text style={styles.llmMsg}>{llmStatus}</Text>
              <Text style={styles.llmUrl}>点此配置智谱 / DeepSeek 等 API Key</Text>
            </View>
          </PressScale>
        </FadeSlideIn>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    paddingHorizontal: 20,
    paddingBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  logo: { fontSize: 22, fontWeight: "800", color: colors.ink, letterSpacing: 1 },
  topActions: { flexDirection: "row", alignItems: "center", gap: 14 },
  topLink: { fontSize: 14, color: colors.ink, fontWeight: "600" },
  topMuted: { fontSize: 13, color: colors.muted },
  topCta: { fontSize: 14, color: colors.brand, fontWeight: "700" },
  hero: {
    height: 320,
    backgroundColor: "#1a1a1a",
    overflow: "hidden",
  },
  heroPage: {
    width: SCREEN_W,
    height: 320,
    overflow: "hidden",
    backgroundColor: "#1a1a1a",
  },
  heroImg: {
    position: "absolute",
    top: 0,
    left: 0,
    width: SCREEN_W,
    height: 320,
    transform: [{ scale: 1.06 }],
  },
  heroMask: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.38)",
  },
  heroText: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 36,
  },
  heroEyebrow: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    letterSpacing: 2,
    marginBottom: 8,
  },
  heroTitle: {
    color: "#fff",
    fontSize: 26,
    fontWeight: "800",
    lineHeight: 34,
    marginBottom: 8,
  },
  heroSub: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 14,
    lineHeight: 20,
  },
  dots: {
    position: "absolute",
    left: 20,
    bottom: 16,
    flexDirection: "row",
    gap: 6,
  },
  searchWrap: {
    marginTop: 16,
    marginHorizontal: 20,
  },
  searchBox: {
    width: "100%",
    height: 52,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: "row",
    alignItems: "stretch",
    overflow: "hidden",
  },
  searchInput: {
    flex: 1,
    height: "100%",
    paddingHorizontal: 16,
    fontSize: 15,
    color: colors.ink,
  },
  searchBtn: {
    height: "100%",
    backgroundColor: colors.brand,
    paddingHorizontal: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  searchBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  cityPanel: {
    marginTop: 10,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    maxHeight: 280,
  },
  cityPanelTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
    marginBottom: 8,
  },
  cityScroll: { maxHeight: 230 },
  cityEmpty: { fontSize: 13, color: colors.muted, paddingVertical: 8 },
  cityGroup: { marginBottom: 10 },
  cityLetter: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.brandHot,
    marginBottom: 6,
  },
  cityChips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  cityChip: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  cityChipOn: {
    borderColor: colors.brand,
    backgroundColor: colors.brandSoft,
  },
  cityChipText: { fontSize: 14, color: colors.ink, fontWeight: "600" },
  cityChipTextOn: { color: colors.brandHot },
  shortcuts: {
    marginTop: 16,
    marginHorizontal: 20,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  shortcut: {
    width: (SCREEN_W - 40 - 10) / 2,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  shortcutTitle: { fontSize: 14, fontWeight: "700", color: colors.ink },
  shortcutDesc: { marginTop: 4, fontSize: 12, color: colors.muted },
  section: { marginTop: 28, paddingHorizontal: 20 },
  sectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.ink,
    marginBottom: 12,
  },
  sectionLink: { fontSize: 13, color: colors.brand, fontWeight: "600", marginBottom: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipText: { fontSize: 14, color: colors.ink },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.line,
  },
  cardImg: { width: "100%", height: 110 },
  cardBody: { padding: 10 },
  cardName: { fontSize: 15, fontWeight: "700", color: colors.ink },
  cardDesc: { marginTop: 2, fontSize: 12, color: colors.muted },
  bigCta: {
    marginTop: 28,
    marginHorizontal: 20,
    backgroundColor: colors.ink,
    borderRadius: 16,
    paddingVertical: 22,
    paddingHorizontal: 20,
  },
  bigCtaTitle: { color: "#fff", fontSize: 18, fontWeight: "800" },
  bigCtaSub: { color: "rgba(255,255,255,0.65)", marginTop: 6, fontSize: 13 },
  llmBar: {
    marginTop: 18,
    marginHorizontal: 20,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  llmDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.brand,
  },
  llmMsg: { fontSize: 13, color: colors.ink, fontWeight: "600" },
  llmUrl: { marginTop: 2, fontSize: 11, color: colors.muted },
});
