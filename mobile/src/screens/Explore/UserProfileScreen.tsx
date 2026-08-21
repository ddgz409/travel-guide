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
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { CollectionSummary, UserProfile } from "@travel-guide/shared";
import { ApiError } from "@travel-guide/shared";
import { api } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { UserAvatar } from "../../components/UserAvatar";
import { CollectionCard } from "../../components/CollectionCard";
import { colors } from "../../theme";
import type { AppStackParamList } from "../../navigation/types";
import { styles } from "./userProfileStyles";

type Props = NativeStackScreenProps<AppStackParamList, "UserProfile">;

export function UserProfileScreen({ navigation, route }: Props) {
  const { userId } = route.params;
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<CollectionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, list] = await Promise.all([
        api.users.profile(userId),
        api.collections.list(20, 0, userId),
      ]);
      setProfile(p);
      setPosts(list.items);
    } catch (e) {
      Alert.alert("加载失败", e instanceof ApiError ? e.message : "请稍后重试");
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [userId, navigation]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const requireLogin = (): boolean => {
    if (user) return true;
    Alert.alert("需要登录", "登录后才能关注作者", [
      { text: "取消" },
      { text: "去登录", onPress: () => navigation.navigate("Login") },
    ]);
    return false;
  };

  const toggleFollow = useCallback(async () => {
    if (!profile || busy) return;
    if (!requireLogin()) return;
    setBusy(true);
    try {
      if (profile.is_following) {
        await api.users.unfollow(profile.id);
        setProfile((prev) =>
          prev
            ? {
                ...prev,
                is_following: false,
                follower_count: Math.max(0, prev.follower_count - 1),
              }
            : prev,
        );
      } else {
        await api.users.follow(profile.id);
        setProfile((prev) =>
          prev
            ? {
                ...prev,
                is_following: true,
                follower_count: prev.follower_count + 1,
              }
            : prev,
        );
      }
    } catch (e) {
      Alert.alert("操作失败", e instanceof ApiError ? e.message : "请稍后重试");
    } finally {
      setBusy(false);
    }
  }, [profile, busy, user]);

  if (loading && !profile) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </View>
    );
  }

  if (!profile) return null;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Text style={styles.back}>‹ 返回</Text>
        </Pressable>
        <Text style={styles.title}>作者主页</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.profileCard}>
          <UserAvatar name={profile.username} size={72} variant="card" />
          <Text style={styles.username}>{profile.username}</Text>
          <View style={styles.roleTag}>
            <Text style={styles.roleTagText}>旅行发帖者</Text>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statNum}>{profile.post_count}</Text>
              <Text style={styles.statLabel}>发帖</Text>
            </View>
            <View style={styles.statDivider} />
            <Pressable
              style={styles.statItem}
              onPress={() =>
                navigation.navigate("FollowList", {
                  userId: profile.id,
                  username: profile.username,
                  initialTab: "followers",
                })
              }
              hitSlop={6}
            >
              <Text style={styles.statNum}>{profile.follower_count}</Text>
              <Text style={styles.statLabel}>粉丝</Text>
            </Pressable>
            <View style={styles.statDivider} />
            <Pressable
              style={styles.statItem}
              onPress={() =>
                navigation.navigate("FollowList", {
                  userId: profile.id,
                  username: profile.username,
                  initialTab: "following",
                })
              }
              hitSlop={6}
            >
              <Text style={styles.statNum}>{profile.following_count}</Text>
              <Text style={styles.statLabel}>关注</Text>
            </Pressable>
          </View>

          {profile.is_self ? (
            <Text style={styles.selfText}>这是你自己</Text>
          ) : (
            <Pressable
              style={[
                styles.followBtn,
                profile.is_following ? styles.followBtnOff : styles.followBtnOn,
              ]}
              onPress={() => void toggleFollow()}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={profile.is_following ? "取消关注" : "关注作者"}
            >
              <Text
                style={[
                  styles.followText,
                  profile.is_following && styles.followTextOff,
                ]}
              >
                {busy
                  ? "…"
                  : profile.is_following
                    ? "已关注"
                    : user
                      ? "+ 关注"
                      : "关注"}
              </Text>
            </Pressable>
          )}
        </View>

        <Text style={styles.sectionTitle}>TA 的发帖</Text>
        {posts.length === 0 ? (
          <Text style={styles.empty}>TA 还没有发布过帖子</Text>
        ) : (
          posts.map((item) => (
            <CollectionCard
              key={item.id}
              item={item}
              onPress={() =>
                navigation.navigate("CollectionDetail", { collectionId: item.id })
              }
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}
