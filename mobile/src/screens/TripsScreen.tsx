import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  ImageSourcePropType,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Trip, TripListItem, TripStatus } from "@travel-guide/shared";
import { ApiError } from "@travel-guide/shared";
import Animated from "react-native-reanimated";
import { api, apiBase } from "../api";
import { useAuth } from "../auth/AuthContext";
import { PressScale, enterUp } from "../motion";
import { cardShadow, colors, pastels } from "../theme";
import type { AppStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<AppStackParamList, "Trips">;

const CARD_COLORS = pastels;

const COVER_BY_CITY: Array<{ key: string; img: ImageSourcePropType }> = [
  { key: "北京", img: require("../../assets/covers/beijing_anime.png") },
  { key: "上海", img: require("../../assets/covers/shanghai_anime.png") },
  { key: "杭州", img: require("../../assets/covers/hangzhou_anime.png") },
  { key: "成都", img: require("../../assets/covers/chengdu.jpg") },
  { key: "大理", img: require("../../assets/covers/dali_anime.png") },
  { key: "西安", img: require("../../assets/covers/xian.jpg") },
  { key: "厦门", img: require("../../assets/covers/xiamen.jpg") },
  { key: "三亚", img: require("../../assets/covers/sanya_anime.png") },
  { key: "洛阳", img: require("../../assets/covers/luoyang.jpg") },
  { key: "泉州", img: require("../../assets/covers/quanzhou.jpg") },
  { key: "西湖", img: require("../../assets/covers/hangzhou_anime.png") },
];

const FALLBACK_COVER = require("../../assets/covers/hangzhou_anime.png");

function coverFor(destination: string): ImageSourcePropType {
  const d = destination || "";
  for (const c of COVER_BY_CITY) {
    if (d.includes(c.key)) return c.img;
  }
  return FALLBACK_COVER;
}

function parseDate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s.includes("T") ? s : `${s}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtMd(s: string): string {
  const d = parseDate(s);
  if (!d) return s || "—";
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${m}.${day}`;
}

function tripDaysNights(start: string, end: string): { days: number; nights: number } {
  const a = parseDate(start);
  const b = parseDate(end);
  if (!a || !b) return { days: 1, nights: 0 };
  const days = Math.max(1, Math.round((b.getTime() - a.getTime()) / 86400000) + 1);
  return { days, nights: Math.max(0, days - 1) };
}

function tripPhase(item: TripListItem): {
  label: string;
  tone: "done" | "live" | "soon" | "busy" | "fail";
} {
  if (item.status === "generating") return { label: "生成中", tone: "busy" };
  if (item.status === "failed") return { label: "生成失败", tone: "fail" };
  const end = parseDate(item.end_date);
  const start = parseDate(item.start_date);
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  if (end && end < now) return { label: "行程已结束", tone: "done" };
  if (start && end && start <= now && now <= end) {
    return { label: "行程进行中", tone: "live" };
  }
  return { label: "即将出发", tone: "soon" };
}

function statusLabel(s: TripStatus): string {
  if (s === "ready") return "已完成";
  if (s === "generating") return "生成中";
  return "失败";
}

function tripToListItem(t: Trip): TripListItem {
  return {
    id: t.id,
    title: t.title,
    destination: t.destination,
    start_date: t.start_date,
    end_date: t.end_date,
    travelers: t.travelers,
    budget_total: t.budget_total,
    status: t.status,
    created_at: t.created_at,
  };
}

function TripCard({
  item,
  index,
  username,
  onPress,
  onLongPress,
}: {
  item: TripListItem;
  index: number;
  username?: string;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const bg = CARD_COLORS[index % CARD_COLORS.length];
  const phase = tripPhase(item);
  const { days, nights } = tripDaysNights(item.start_date, item.end_date);
  const travelers = Math.max(1, item.travelers || 1);
  const initial = (username || item.destination || "旅").slice(0, 1);

  return (
    <PressScale
      style={styles.cardPress}
      scaleTo={0.985}
      onPress={onPress}
      onLongPress={onLongPress}
    >
      <View style={[styles.card, { backgroundColor: bg }]}>
        <View style={styles.badge}>
          <View
            style={[
              styles.badgeDot,
              phase.tone === "live" && styles.badgeDotLive,
              phase.tone === "busy" && styles.badgeDotBusy,
              phase.tone === "fail" && styles.badgeDotFail,
              phase.tone === "soon" && styles.badgeDotSoon,
            ]}
          />
          <Text style={styles.badgeText}>{phase.label}</Text>
        </View>

        <Text style={styles.cardTitle} numberOfLines={2}>
          {item.title || `${item.destination}行程`}
        </Text>

        <View style={styles.metaBlock}>
          <View style={styles.metaBar} />
          <View style={styles.metaTextCol}>
            <Text style={styles.metaLine}>
              {fmtMd(item.start_date)}至{fmtMd(item.end_date)} {days}天
              {nights > 0 ? `${nights}晚` : ""}
            </Text>
            <Text style={styles.metaLine}>
              {item.destination}
              {item.status !== "ready" ? ` · ${statusLabel(item.status)}` : ""}
              {travelers > 1 ? ` · ${travelers}人` : ""}
            </Text>
          </View>
        </View>

        <View style={styles.cardBottom}>
          <View style={styles.avatars}>
            {Array.from({ length: Math.min(travelers, 3) }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.avatar,
                  { marginLeft: i === 0 ? 0 : -10, zIndex: 3 - i },
                  i === 0 ? styles.avatarPrimary : styles.avatarSecondary,
                ]}
              >
                <Text style={styles.avatarText}>
                  {i === 0 ? initial : String(i + 1)}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.coverWrap} pointerEvents="none">
          <Image
            source={coverFor(item.destination)}
            style={styles.cover}
            resizeMode="cover"
          />
        </View>
      </View>
    </PressScale>
  );
}

export function TripsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { user, isGuest, logout, guestTripIds } = useAuth();
  const [trips, setTrips] = useState<TripListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        if (!user && !isGuest) {
          setTrips([]);
          return;
        }
        if (isGuest) {
          const results = await Promise.all(
            guestTripIds.map(async (id) => {
              try {
                return tripToListItem(await api.trips.get(id));
              } catch {
                return null;
              }
            }),
          );
          setTrips(results.filter((t): t is TripListItem => t != null));
        } else {
          setTrips(await api.trips.list());
        }
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "加载失败");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user, isGuest, guestTripIds],
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function onExit() {
    await logout();
    navigation.navigate("Home");
  }

  const sorted = useMemo(() => {
    return [...trips].sort((a, b) => {
      const ta = parseDate(a.start_date)?.getTime() ?? 0;
      const tb = parseDate(b.start_date)?.getTime() ?? 0;
      return tb - ta;
    });
  }, [trips]);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
        <Pressable onPress={() => navigation.navigate("Home")} hitSlop={8}>
          <Text style={styles.brand}>旅迹</Text>
        </Pressable>
        <View style={styles.headerActions}>
          <Pressable
            style={styles.genBtn}
            onPress={() => navigation.navigate("Generate")}
          >
            <Text style={styles.genBtnText}>生成</Text>
          </Pressable>
          {user || isGuest ? (
            <Pressable onPress={onExit} style={styles.headerLink}>
              <Text style={styles.logout}>
                {isGuest ? "退出游客" : "退出"}
              </Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => navigation.navigate("Login")}
              style={styles.headerLink}
            >
              <Text style={styles.logout}>登录</Text>
            </Pressable>
          )}
        </View>
      </View>

      <Text style={styles.pageTitle}>我的行程</Text>

      {isGuest ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            游客可生成并查看攻略；登录后可云端保存
          </Text>
          <Pressable onPress={() => navigation.navigate("Login")}>
            <Text style={styles.bannerLink}>去登录</Text>
          </Pressable>
        </View>
      ) : null}

      {!user && !isGuest ? (
        <View style={styles.center}>
          <Text style={styles.empty}>登录或游客体验后可查看攻略</Text>
          <Pressable
            style={styles.emptyBtn}
            onPress={() => navigation.navigate("Login")}
          >
            <Text style={styles.emptyBtnText}>去登录</Text>
          </Pressable>
        </View>
      ) : loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.brand} />
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          <Text style={styles.hint}>API: {apiBase}</Text>
          <Pressable style={styles.retry} onPress={() => load()}>
            <Text style={styles.retryText}>重试</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(item) => item.id}
          contentContainerStyle={
            sorted.length === 0 ? styles.emptyWrap : styles.list
          }
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={colors.brand}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.empty}>
                {isGuest
                  ? "还没有行程，点右上角「生成」试一份"
                  : "还没有行程，点右上角「生成」开始"}
              </Text>
              <Pressable
                style={styles.emptyBtn}
                onPress={() => navigation.navigate("Generate")}
              >
                <Text style={styles.emptyBtnText}>开始生成</Text>
              </Pressable>
            </View>
          }
          renderItem={({ item, index }) => (
            <Animated.View entering={enterUp(Math.min(index, 8) * 40)}>
              <TripCard
                item={item}
                index={index}
                username={user?.username}
                onPress={() =>
                  navigation.navigate("TripDetail", { tripId: item.id })
                }
                onLongPress={
                  !user || isGuest
                    ? undefined
                    : () => {
                        Alert.alert(
                          "删除攻略",
                          `确定删除「${item.title}」？`,
                          [
                            { text: "取消", style: "cancel" },
                            {
                              text: "删除",
                              style: "destructive",
                              onPress: async () => {
                                try {
                                  await api.trips.remove(item.id);
                                  load(true);
                                } catch (e) {
                                  Alert.alert(
                                    "删除失败",
                                    e instanceof ApiError ? e.message : "失败",
                                  );
                                }
                              },
                            },
                          ],
                        );
                      }
                }
              />
            </Animated.View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  brand: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.ink,
    letterSpacing: 0.5,
  },
  headerActions: { flexDirection: "row", alignItems: "center" },
  headerLink: { marginLeft: 14 },
  genBtn: {
    backgroundColor: colors.brand,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  genBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  logout: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  pageTitle: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 12,
    fontSize: 28,
    fontWeight: "800",
    color: colors.ink,
    letterSpacing: 0.5,
  },
  banner: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.brandSoft,
    flexDirection: "row",
    alignItems: "center",
  },
  bannerText: {
    flex: 1,
    fontSize: 13,
    color: colors.ink,
    lineHeight: 18,
    marginRight: 10,
  },
  bannerLink: { fontSize: 13, fontWeight: "700", color: colors.brandHot },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  emptyWrap: { flexGrow: 1, justifyContent: "center", padding: 32 },
  emptyBox: { alignItems: "center" },
  empty: {
    textAlign: "center",
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 16,
  },
  emptyBtn: {
    backgroundColor: colors.brand,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  cardPress: { marginBottom: 14 },
  card: {
    borderRadius: 28,
    paddingTop: 16,
    paddingHorizontal: 18,
    paddingBottom: 18,
    minHeight: 188,
    overflow: "hidden",
    ...cardShadow,
  },
  badge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 12,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.brand,
    marginRight: 6,
  },
  badgeDotLive: { backgroundColor: "#2e7d32" },
  badgeDotBusy: { backgroundColor: "#ef6c00" },
  badgeDotFail: { backgroundColor: "#c62828" },
  badgeDotSoon: { backgroundColor: colors.brand },
  badgeText: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: "600",
    lineHeight: 16,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.ink,
    lineHeight: 32,
    maxWidth: "72%",
    marginBottom: 12,
  },
  metaBlock: {
    flexDirection: "row",
    alignItems: "stretch",
    maxWidth: "68%",
    marginBottom: 18,
  },
  metaBar: {
    width: 2,
    borderRadius: 1,
    backgroundColor: "rgba(255,109,0,0.28)",
    marginRight: 10,
  },
  metaTextCol: { flex: 1 },
  metaLine: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 20,
  },
  cardBottom: {
    marginTop: "auto",
    flexDirection: "row",
    alignItems: "center",
    minHeight: 40,
  },
  avatars: { flexDirection: "row", alignItems: "center" },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.9)",
  },
  avatarPrimary: { backgroundColor: colors.brand },
  avatarSecondary: { backgroundColor: "#E07A3A" },
  avatarText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 16,
  },
  coverWrap: {
    position: "absolute",
    right: -6,
    bottom: -18,
    width: 132,
    height: 132,
    transform: [{ rotate: "14deg" }],
  },
  cover: {
    width: "100%",
    height: "100%",
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  center: { padding: 32, alignItems: "center" },
  error: { color: colors.danger, textAlign: "center", fontSize: 15 },
  hint: {
    marginTop: 8,
    fontSize: 12,
    color: colors.muted,
    textAlign: "center",
  },
  retry: {
    marginTop: 16,
    backgroundColor: colors.brandSoft,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryText: { color: colors.brandHot, fontWeight: "700" },
});
