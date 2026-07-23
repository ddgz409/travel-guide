import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { TripListItem } from "@travel-guide/shared";
import { ApiError } from "@travel-guide/shared";
import Animated from "react-native-reanimated";
import { api, apiBase } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { enterUp } from "../../utils/motion";
import { colors } from "../../theme";
import type { AppStackParamList } from "../../navigation/types";
import { parseDate } from "../../utils/date";
import { tripToListItem } from "./helpers";
import { TripCard } from "./TripCard";
import { styles } from "./styles";

type Props = NativeStackScreenProps<AppStackParamList, "Trips">;

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
