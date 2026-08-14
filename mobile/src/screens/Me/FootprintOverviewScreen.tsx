import React, { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View, Platform } from "react-native";
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

          {stats.highest ? (
            <View style={styles.cardLav}>
              <Text style={styles.cardCity}>{stats.highest.city}</Text>
              <Text style={styles.cardSub}>
                {stats.highest.name} · {formatCheckDate(stats.highest.checkedAt)}
              </Text>
              <View style={styles.altRow}>
                <Text style={styles.cardKicker}>去过海拔最高的地方</Text>
                <Text style={styles.altNum}>— M</Text>
              </View>
            </View>
          ) : null}

          {stats.northernmost ? (
            <View style={styles.cardBrown}>
              <Text style={styles.brownTitle}>去过最北的地方</Text>
              <Text style={styles.brownName} numberOfLines={2}>
                {stats.northernmost.name}
              </Text>
            </View>
          ) : null}

          <View style={styles.cardMint}>
            <View style={styles.mintDivider} />
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
