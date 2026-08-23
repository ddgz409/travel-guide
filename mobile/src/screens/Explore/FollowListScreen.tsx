import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { UserBrief } from "@travel-guide/shared";
import { ApiError } from "@travel-guide/shared";
import { api, absAvatar } from "../../api/client";
import { UserAvatar } from "../../components/UserAvatar";
import { colors } from "../../theme";
import type { AppStackParamList } from "../../navigation/types";
import { styles } from "./followListStyles";

type Props = NativeStackScreenProps<AppStackParamList, "FollowList">;
type Tab = "followers" | "following";

export function FollowListScreen({ navigation, route }: Props) {
  const { userId, username, initialTab } = route.params;
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [items, setItems] = useState<UserBrief[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (t: Tab) => {
      setLoading(true);
      try {
        const res =
          t === "followers"
            ? await api.users.followers(userId)
            : await api.users.following(userId);
        setItems(res.items);
      } catch (e) {
        Alert.alert("加载失败", e instanceof ApiError ? e.message : "请稍后重试");
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [userId],
  );

  const switchTab = (t: Tab) => {
    setTab(t);
    void load(t);
  };

  const openProfile = (u: UserBrief) => {
    navigation.navigate("UserProfile", { userId: u.id, username: u.username });
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Text style={styles.back}>‹ 返回</Text>
        </Pressable>
        <Text style={styles.title}>{username}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.tabs}>
        <Pressable
          style={[styles.tab, tab === "followers" && styles.tabOn]}
          onPress={() => switchTab("followers")}
        >
          <Text style={[styles.tabText, tab === "followers" && styles.tabTextOn]}>
            粉丝
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, tab === "following" && styles.tabOn]}
          onPress={() => switchTab("following")}
        >
          <Text style={[styles.tabText, tab === "following" && styles.tabTextOn]}>
            关注
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {items.length === 0 ? (
            <Text style={styles.empty}>
              {tab === "followers" ? "还没有粉丝" : "还没有关注任何人"}
            </Text>
          ) : (
            items.map((u) => (
              <Pressable
                key={u.id}
                style={styles.row}
                onPress={() => openProfile(u)}
              >
                <UserAvatar name={u.username} size={40} imageUri={absAvatar(u.avatar)} />
                <Text style={styles.name}>{u.username}</Text>
                <Text style={styles.name}>›</Text>
              </Pressable>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}
