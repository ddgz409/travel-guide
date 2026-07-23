import React, { useEffect, useMemo, useRef, useState } from "react";
import {
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
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated from "react-native-reanimated";
import { api } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { citiesGrouped } from "../../data/cities";
import { loadLocalLlm } from "../../utils/llmStore";
import {
  AnimatedDot,
  FadeSlideIn,
  PressScale,
  enterFade,
} from "../../utils/motion";
import { colors } from "../../theme";
import type { AppStackParamList } from "../../navigation/types";
import { styles } from "./styles";
import {
  SLIDES,
  DESTINATIONS,
  INTERESTS,
  CARD_COLORS,
  SHORTCUT_COLORS,
} from "./content";

type Props = NativeStackScreenProps<AppStackParamList, "Home">;

export function HomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
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
        heroRef.current?.scrollTo({ x: next * screenW, animated: true });
        return next;
      });
    }, 5000);
    return () => clearInterval(t);
  }, [screenW]);

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

  function goGenerate(dest?: string, interests?: string[]) {
    // 不 await：游客态进阶只是本地写 AsyncStorage，绝不应阻塞跳转，
    // 否则点击城市/卡片偶发「没反应」（await 期间 onBlur 卸载了面板）。
    void ensureCanGenerate();
    navigation.navigate("Generate", {
      destination: dest,
      interests,
    });
  }

  // 卡片左右各 margin 6；分区左右 padding 20
  const shortcutW = (screenW - 30 - 20) / 2;
  // section padding 16*2 + gap 10 -> 一行两个
  const destW = (screenW - 32 - 10) / 2;

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
            onPress={() => navigation.navigate("Settings")}
          >
            <Text style={styles.topCta}>设置</Text>
          </PressScale>
          {user || isGuest ? (
            <PressScale
              style={styles.topActionItem}
              onPress={() => navigation.navigate("Trips")}
            >
              <Text style={styles.topLink}>我的</Text>
            </PressScale>
          ) : null}
          {user ? (
            <Text style={[styles.topMuted, styles.topActionItem]}>
              {user.username}
            </Text>
          ) : (
            <PressScale
              style={styles.topActionItem}
              onPress={() => navigation.navigate("Login")}
            >
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
                style={[styles.heroPage, { width: screenW }]}
                onPress={() => void goGenerate(s.dest)}
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
                              goGenerate(name);
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
              title: "我的行程",
              desc: "收藏与编辑",
              onPress: () => navigation.navigate("Trips"),
            },
            {
              title: "模型设置",
              desc: "自带 LLM API Key",
              onPress: () => navigation.navigate("Settings"),
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
                AI 生成 {'→'}
              </Text>
            </PressScale>
          </View>
          <View style={styles.destGrid}>
            {DESTINATIONS.map((d, i) => (
              <PressScale
                key={d.name}
                style={[styles.destCardPress, { width: destW }]}
                scaleTo={0.985}
                onPress={() => goGenerate(d.name)}
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
