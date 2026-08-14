import React, { useCallback, useEffect, useState } from "react";
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AppStackParamList } from "../../navigation/types";
import {
  listCheckIns,
  subscribeCheckIns,
  type CheckInRecord,
} from "../../utils/checkInStore";
import {
  buildFootprintStats,
  formatCheckDate,
} from "../../utils/footprintStats";
import { DottedWorldMap } from "./DottedWorldMap";
import { styles } from "./styles";

type Props = NativeStackScreenProps<AppStackParamList, "FootprintOverview">;

function PolePager({
  north,
  south,
}: {
  north: CheckInRecord;
  south: CheckInRecord;
}) {
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) return;
    setPage(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  const pages = [
    { title: "去过最北的地方", item: north },
    { title: "去过最南的地方", item: south },
  ];

  return (
    <View
      style={styles.poleWrap}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {width > 0 ? (
        <ScrollView
          horizontal
          pagingEnabled
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          onMomentumScrollEnd={onScrollEnd}
        >
          {pages.map((p) => (
            <View key={p.title} style={[styles.polePage, { width }]}>
              <Text style={styles.brownTitle}>{p.title}</Text>
              <Text style={styles.brownName} numberOfLines={2}>
                {p.item.name}
              </Text>
              {p.item.city ? (
                <Text style={styles.brownCity} numberOfLines={1}>
                  {p.item.city}
                </Text>
              ) : null}
            </View>
          ))}
        </ScrollView>
      ) : (
        <View style={styles.polePage} />
      )}
      <View style={styles.poleDots} pointerEvents="none">
        {pages.map((p, i) => (
          <View
            key={p.title}
            style={[styles.poleDot, i === page ? styles.poleDotOn : null]}
          />
        ))}
      </View>
    </View>
  );
}

export function FootprintOverviewScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<CheckInRecord[]>([]);

  const load = useCallback(() => {
    void listCheckIns().then(setItems);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => subscribeCheckIns(load), [load]);

  const stats = buildFootprintStats(items);
  const empty = stats.placeCount === 0;

  return (
    <View style={[styles.overviewRoot, { paddingTop: Math.max(insets.top, 8) }]}>
      <View style={styles.overviewHead}>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹ 返回</Text>
        </Pressable>
        <Text style={styles.overviewTitle}>概览</Text>
        <View style={{ width: 48 }} />
      </View>

      {empty ? (
        <ScrollView
          contentContainerStyle={[
            styles.overviewEmptyWrap,
            { paddingBottom: Math.max(insets.bottom, 24) },
          ]}
        >
          <Pressable
            style={styles.addBubble}
            onPress={() => navigation.navigate("AddFootprint")}
          >
            <Text style={styles.addBubbleText}>添加足迹</Text>
          </Pressable>
          <Text
            style={[
              styles.artEmpty,
              styles.overviewArt,
              Platform.OS === "android" ? { fontFamily: "serif" } : null,
            ]}
          >
            《还没有打卡过哦》
          </Text>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.overviewScroll}>
          <Pressable
            style={styles.addBubble}
            onPress={() => navigation.navigate("AddFootprint")}
          >
            <Text style={styles.addBubbleText}>添加足迹</Text>
          </Pressable>

          <View style={styles.statGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statNum}>{stats.countryCount} 国家</Text>
              <Text style={styles.statLabel}>🌍 到过的国家/地区</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNum}>{stats.cityCount} 城市</Text>
              <Text style={styles.statLabel}>🏙 打卡过的城市</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNum}>{stats.placeCount} 地点</Text>
              <Text style={styles.statLabel}>📍 打卡地点</Text>
            </View>
            <View style={[styles.statCard, styles.statSeason]}>
              <Text style={styles.statNum}>{stats.topSeason || "—"}</Text>
              <Text style={styles.statLabel}>出行最多的季节</Text>
            </View>
          </View>

          {stats.farthest ? (
            <View style={styles.cardBlue}>
              <View style={styles.dateBadge}>
                <Text style={styles.dateBadgeText}>
                  {formatCheckDate(stats.farthest.checkedAt)}
                </Text>
              </View>
              <Text style={styles.cardKicker}>去过最远的地方</Text>
              <Text style={styles.cardCity}>{stats.farthest.city}</Text>
              <Text style={styles.cardSub}>
                国家/地区: 中国{"\n"}地点: {stats.farthest.name}
              </Text>
            </View>
          ) : null}

          {stats.northernmost && stats.southernmost ? (
            <PolePager
              north={stats.northernmost}
              south={stats.southernmost}
            />
          ) : null}

          <View style={styles.cardMint}>
            <View style={styles.mintHead}>
              <Text style={styles.mintChevrons} numberOfLines={1}>
                {"<<< 打卡的大洲 " + "<".repeat(24)}
              </Text>
              <Text style={styles.mintCount}>{stats.continentCount}</Text>
            </View>
            <View style={styles.mintMapWrap}>
              <DottedWorldMap visited={stats.visitedContinents} />
            </View>
          </View>

          {stats.topCategory ? (
            <View style={styles.cardGold}>
              <Text style={styles.cardKicker}>去过最多的地点类型</Text>
              <View style={styles.goldInner}>
                <Text style={styles.goldLabel}>{stats.topCategory.label}</Text>
                <Text style={styles.goldNum}>{stats.topCategory.count}</Text>
              </View>
            </View>
          ) : null}

          <Pressable
            style={styles.mapLink}
            onPress={() => navigation.navigate("CheckInMapFull")}
          >
            <Text style={styles.mapLinkText}>查看打卡地图 ›</Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}
