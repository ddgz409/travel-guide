import React, { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Pressable, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { ApiError } from "@travel-guide/shared";
import type { CityInfo, CitySpot } from "@travel-guide/shared";
import { api } from "../../api/client";
import { PlaceImage } from "../../components/PlaceImage";
import { FadeSwitch, PressScale } from "../../utils/motion";
import {
  getCachedCityInfo,
  setCachedCityInfo,
} from "../../utils/cityInfoCache";
import type { AppStackParamList } from "../../navigation/types";
import { PoiDetailSheet } from "../CityDetail/PoiDetailSheet";
import { styles } from "./styles";

type Props = NativeStackScreenProps<AppStackParamList, "CityGuide">;

type GuideTab = "spots" | "foods" | "humanities";

const TABS: Array<{ key: GuideTab; label: string }> = [
  { key: "spots", label: "景点" },
  { key: "foods", label: "美食" },
  { key: "humanities", label: "人文" },
];

type TabStatus = "idle" | "loading" | "ready" | "error";
type TabState = { status: TabStatus; items: CitySpot[] };
const INITIAL_TAB: TabState = { status: "idle", items: [] };

/** 从城市信息里按 Tab 取出对应条目（人文与景点同构） */
function pickItems(
  info: Pick<CityInfo, "spots" | "foods" | "humanities"> | null,
  tab: GuideTab,
): CitySpot[] {
  if (!info) return [];
  if (tab === "foods") return info.foods || [];
  if (tab === "humanities") return info.humanities || [];
  return info.spots || [];
}

/** 两列网格骨架卡：微光呼吸 */
function SkeletonCard({ delay }: { delay: number }) {
  const shimmer = useSharedValue(0.35);
  useEffect(() => {
    shimmer.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0.9, { duration: 800, easing: Easing.inOut(Easing.quad) }),
          withTiming(0.35, { duration: 800, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        true,
      ),
    );
  }, [delay, shimmer]);
  const shimmerStyle = useAnimatedStyle(() => ({ opacity: shimmer.value }));
  return (
    <View style={styles.skelCard}>
      <Animated.View style={[styles.skelImg, shimmerStyle]} />
      <Animated.View style={[styles.skelLine, shimmerStyle]} />
    </View>
  );
}

function GridSkeleton({ cardW }: { cardW: number }) {
  return (
    <View style={styles.skelGrid}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={{ width: cardW }}>
          <SkeletonCard delay={i * 120} />
        </View>
      ))}
    </View>
  );
}

export function CityGuideScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const { city } = route.params;

  const [activeTab, setActiveTab] = useState<GuideTab>("spots");
  const [tabStates, setTabStates] = useState<Record<GuideTab, TabState>>({
    spots: INITIAL_TAB,
    foods: INITIAL_TAB,
    humanities: INITIAL_TAB,
  });
  const [selected, setSelected] = useState<{
    item: CitySpot;
    category: GuideTab;
  } | null>(null);
  /** 防重复请求：同一 Tab 同时只能有一个在途请求 */
  const loadingRef = useRef<Set<GuideTab>>(new Set());

  const applyReady = useCallback((tab: GuideTab, items: CitySpot[]) => {
    setTabStates((prev) => ({
      ...prev,
      [tab]: { status: "ready", items },
    }));
  }, []);

  const loadTab = useCallback(
    async (tab: GuideTab) => {
      if (loadingRef.current.has(tab)) return;
      loadingRef.current.add(tab);
      setTabStates((prev) => ({
        ...prev,
        [tab]: { status: "loading", items: prev[tab].items },
      }));
      try {
        // 磁盘缓存快读，命中则无需请求接口
        const cached = await getCachedCityInfo(city);
        const cachedItems = pickItems(cached, tab);
        if (cached && cachedItems.length > 0) {
          applyReady(tab, cachedItems);
          return;
        }
        const result = await api.destinations.info(city);
        const items = pickItems(result, tab);
        if (items.length > 0) {
          void setCachedCityInfo(city, result);
        }
        applyReady(tab, items);
      } catch (e) {
        setTabStates((prev) => ({
          ...prev,
          [tab]: { status: "error", items: prev[tab].items },
        }));
      } finally {
        loadingRef.current.delete(tab);
      }
    },
    [city, applyReady],
  );

  // 初始化默认激活「景点」，进页即请求
  useEffect(() => {
    void loadTab("spots");
  }, [loadTab]);

  const changeTab = useCallback(
    (tab: GuideTab) => {
      setActiveTab(tab);
      if (tabStates[tab].status === "idle") {
        void loadTab(tab);
      }
    },
    [tabStates, loadTab],
  );

  const state = tabStates[activeTab];
  const tabLabel = TABS.find((t) => t.key === activeTab)!.label;
  const cardW = (screenW - 16 * 2 - 12) / 2;

  function retry() {
    void loadTab(activeTab);
  }

  return (
    <View style={styles.root}>
      <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 10) }]}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <View style={styles.titleWrap}>
          <Text style={styles.title} numberOfLines={1}>
            {city}
          </Text>
          <Text style={styles.subtitle}>热门目的地</Text>
        </View>
        <View style={styles.spacer} />
      </View>

      <View style={styles.tabBar}>
        {TABS.map((t) => {
          const on = activeTab === t.key;
          return (
            <Pressable
              key={t.key}
              style={styles.tabItem}
              onPress={() => changeTab(t.key)}
            >
              <Text style={[styles.tabLabel, on && styles.tabLabelOn]}>
                {t.label}
              </Text>
              <View style={[styles.tabIndicator, on && styles.tabIndicatorOn]} />
            </Pressable>
          );
        })}
      </View>

      <View style={styles.content}>
        <FadeSwitch switchKey={activeTab} style={styles.content}>
          {state.status === "idle" || state.status === "loading" ? (
            <GridSkeleton cardW={cardW} />
          ) : state.status === "error" ? (
            <View style={styles.center}>
              <Text style={styles.emptyText}>
                {tabLabel}加载失败，请检查网络
              </Text>
              <Pressable style={styles.retryBtn} onPress={retry}>
                <Text style={styles.retryText}>重试</Text>
              </Pressable>
            </View>
          ) : state.items.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.emptyIcon}>🗺️</Text>
              <Text style={styles.emptyText}>
                暂无{city}的{tabLabel}信息
              </Text>
              <Pressable style={styles.retryBtn} onPress={retry}>
                <Text style={styles.retryText}>重新搜索</Text>
              </Pressable>
            </View>
          ) : (
            <FlatList
              key={activeTab}
              data={state.items}
              keyExtractor={(item) => item.name}
              numColumns={2}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.list}
              columnWrapperStyle={styles.column}
              renderItem={({ item }) => (
                <PressScale
                  style={styles.card}
                  scaleTo={0.97}
                  onPress={() => setSelected({ item, category: activeTab })}
                >
                  <View style={styles.cardImageWrap}>
                    <PlaceImage
                      city={city}
                      name={item.name}
                      category={activeTab}
                      image={item.image}
                      images={item.images}
                      style={styles.cardImage}
                    />
                  </View>
                  <Text style={styles.cardName} numberOfLines={1}>
                    {item.name}
                  </Text>
                </PressScale>
              )}
            />
          )}
        </FadeSwitch>
      </View>

      <PoiDetailSheet
        visible={!!selected}
        item={selected?.item ?? null}
        category={selected?.category ?? "spots"}
        city={city}
        userLocation={null}
        onClose={() => setSelected(null)}
      />
    </View>
  );
}
