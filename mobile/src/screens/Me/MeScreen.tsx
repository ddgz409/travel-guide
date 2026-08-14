import React, { useCallback, useEffect, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../auth/AuthContext";
import { useMainTab } from "../../navigation/MainTabContext";
import { api } from "../../api/client";
import { listCheckIns, subscribeCheckIns, getCheckedPrefectureIds, type CheckInRecord } from "../../utils/checkInStore";
import { buildFootprintStats } from "../../utils/footprintStats";
import { CheckInMapCard } from "../Trips/CheckInMapCard";
import { TAB_BAR_BODY } from "../../components/CustomTabBar";
import { styles } from "./styles";

export function MeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { tab, setTab } = useMainTab();
  const { user, isGuest } = useAuth();
  const [checkIns, setCheckIns] = useState<CheckInRecord[]>([]);
  const [tripCount, setTripCount] = useState(0);
  const [checkedPrefectures, setCheckedPrefectures] = useState<string[]>([]);
  const [mapLoading, setMapLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [items, prefectures] = await Promise.all([
        listCheckIns(),
        getCheckedPrefectureIds(),
      ]);
      setCheckIns(items);
      setCheckedPrefectures(prefectures);
    } finally {
      setMapLoading(false);
    }
    try {
      if (user) {
        const trips = await api.trips.list();
        setTripCount(trips.length);
      }
    } catch {
      /* ignore */
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    if (tab === "Me") void load();
  }, [tab, load]);

  useEffect(() => subscribeCheckIns(() => { void load(); }), [load]);

  const stats = buildFootprintStats(checkIns);
  const name = user?.username || (isGuest ? "游客" : "未登录");
  const initial = name.slice(0, 1);
  const latest = stats.latest;

  return (
    <View style={[styles.root, { paddingTop: Math.max(insets.top, 10) }]}>
      <Pressable
        style={[styles.menuBtn, { top: Math.max(insets.top, 10) + 4 }]}
        onPress={() => (navigation as any).navigate("Settings")}
      >
        <Text style={styles.menuIcon}>☰</Text>
      </Pressable>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: TAB_BAR_BODY + Math.max(insets.bottom, 12) + 24,
        }}
      >
        <Pressable
          style={styles.addBubble}
          onPress={() => (navigation as any).navigate("AddFootprint")}
        >
          <Text style={styles.addBubbleText}>添加足迹</Text>
        </Pressable>

        <View style={styles.profile}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <Text style={styles.username}>{name}</Text>
          {!user ? (
            <Pressable onPress={() => (navigation as any).navigate("Login")}>
              <Text style={styles.hint}>点击登录账号</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.grid}>
          <Pressable style={styles.miniCard} onPress={() => setTab("Trips")}>
            <Text style={styles.miniIcon}>⭐</Text>
            <Text style={styles.miniTitle}>我的收藏</Text>
            <Text style={styles.miniSub}>行程 · {tripCount}</Text>
          </Pressable>
          <Pressable
            style={styles.miniCard}
            onPress={() => Alert.alert("我的订阅", "订阅功能即将上线")}
          >
            <Text style={styles.miniIcon}>🔔</Text>
            <Text style={styles.miniTitle}>我的订阅</Text>
            <Text style={styles.miniSub}>收藏夹 · 0</Text>
          </Pressable>
        </View>

        <Pressable
          style={styles.footCard}
          onPress={() => (navigation as any).navigate("FootprintOverview")}
        >
          <View style={styles.footDeco} />
          <Text style={styles.footTitle}>我的足迹</Text>
          {stats.placeCount > 0 ? (
            <>
              <Text style={styles.footMeta}>
                国家/地区 · {stats.countryCount}{"  "}城市 · {stats.cityCount}
              </Text>
              {latest ? (
                <Text style={styles.footLoc} numberOfLines={1}>
                  {latest.address || latest.name}
                </Text>
              ) : null}
              <View style={styles.checkDot}>
                <Text style={styles.checkDotText}>✓</Text>
              </View>
            </>
          ) : (
            <Text
              style={[
                styles.artEmpty,
                Platform.OS === "android" ? { fontFamily: "serif" } : null,
              ]}
            >
              《还没有打卡过哦》
            </Text>
          )}
        </Pressable>

        <View style={{ marginTop: 12 }}>
          <CheckInMapCard
            checkedPrefectureIds={checkedPrefectures}
            checkInCount={checkIns.length}
            loading={mapLoading}
            onPress={() => (navigation as any).navigate("CheckInMapFull")}
          />
        </View>
      </ScrollView>
    </View>
  );
}
