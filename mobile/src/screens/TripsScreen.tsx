import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import { api, apiBase } from "../api";
import { useAuth } from "../auth/AuthContext";
import { PressScale, enterUp } from "../motion";
import { colors } from "../theme";
import type { AppStackParamList } from "../navigation/types";
import Animated from "react-native-reanimated";

type Props = NativeStackScreenProps<AppStackParamList, "Trips">;

function statusLabel(s: TripStatus): string {
  if (s === "ready") return "已完成";
  if (s === "generating") return "生成中";
  return "失败";
}

function statusColor(s: TripStatus): string {
  if (s === "ready") return colors.ready;
  if (s === "generating") return colors.generating;
  return colors.failed;
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

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
        <View>
          <Pressable onPress={() => navigation.navigate("Home")}>
            <Text style={styles.brand}>旅迹</Text>
          </Pressable>
          <Text style={styles.sub}>
            {isGuest
              ? "游客模式"
              : user
                ? `你好，${user.username}`
                : "未登录"}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            style={styles.genBtn}
            onPress={() => navigation.navigate("Generate")}
          >
            <Text style={styles.genBtnText}>生成</Text>
          </Pressable>
          {user || isGuest ? (
            <Pressable onPress={onExit}>
              <Text style={styles.logout}>
                {isGuest ? "退出游客" : "退出"}
              </Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => navigation.navigate("Login")}>
              <Text style={styles.logout}>登录</Text>
            </Pressable>
          )}
        </View>
      </View>

      {isGuest ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            游客可生成并查看攻略；登录后可云端保存到「我的攻略」
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
          data={trips}
          keyExtractor={(item) => item.id}
          contentContainerStyle={
            trips.length === 0 ? styles.emptyWrap : styles.list
          }
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
                  ? "还没有体验过，点右上角「生成」试一份"
                  : "还没有攻略，点右上角「生成」开始"}
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
            <Animated.View entering={enterUp(Math.min(index, 8) * 45)}>
              <PressScale
                style={styles.row}
                scaleTo={0.985}
                onPress={() =>
                  navigation.navigate("TripDetail", { tripId: item.id })
                }
                onLongPress={() => {
                  if (!user || isGuest) return;
                  Alert.alert("删除攻略", `确定删除「${item.title}」？`, [
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
                  ]);
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.title} numberOfLines={1}>
                    {item.title || item.destination}
                  </Text>
                  <Text style={styles.meta}>
                    {item.destination} · {item.start_date} → {item.end_date}
                  </Text>
                </View>
                <Text
                  style={[styles.badge, { color: statusColor(item.status) }]}
                >
                  {statusLabel(item.status)}
                </Text>
              </PressScale>
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
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.card,
  },
  brand: { fontSize: 22, fontWeight: "800", color: colors.ink },
  sub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 14 },
  genBtn: {
    backgroundColor: colors.brand,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  genBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  logout: { color: colors.muted, fontSize: 14 },
  banner: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.brandSoft,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  bannerText: { flex: 1, fontSize: 13, color: colors.ink, lineHeight: 18 },
  bannerLink: { fontSize: 13, fontWeight: "700", color: colors.brandHot },
  list: { padding: 16, gap: 10 },
  emptyWrap: { flexGrow: 1, justifyContent: "center", padding: 32 },
  emptyBox: { alignItems: "center", gap: 16 },
  empty: { textAlign: "center", color: colors.muted, fontSize: 15 },
  emptyBtn: {
    backgroundColor: colors.brand,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  row: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  },
  title: { fontSize: 16, fontWeight: "700", color: colors.ink },
  meta: { marginTop: 4, fontSize: 13, color: colors.muted },
  badge: { fontSize: 13, fontWeight: "600" },
  center: { padding: 32, alignItems: "center" },
  error: { color: colors.danger, textAlign: "center", fontSize: 15 },
  hint: { marginTop: 8, fontSize: 12, color: colors.muted, textAlign: "center" },
  retry: {
    marginTop: 16,
    backgroundColor: colors.brandSoft,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryText: { color: colors.brandHot, fontWeight: "700" },
});
