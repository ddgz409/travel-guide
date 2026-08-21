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
import type { CollectionSummary } from "@travel-guide/shared";
import { ApiError } from "@travel-guide/shared";
import { api } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { CollectionCard } from "../../components/CollectionCard";
import { colors } from "../../theme";
import type { AppStackParamList } from "../../navigation/types";
import { styles } from "./sharedCollectionsStyles";

type Props = NativeStackScreenProps<AppStackParamList, "SharedCollections">;

export function SharedCollectionsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [items, setItems] = useState<CollectionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.collections.list(50, 0);
      setItems(res.items);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function openPublish() {
    if (!user) {
      Alert.alert("需要登录", "登录后即可发布共享收藏夹", [
        { text: "取消", style: "cancel" },
        { text: "去登录", onPress: () => navigation.navigate("Login") },
      ]);
      return;
    }
    navigation.navigate("PublishCollection");
  }

  function confirmDelete(item: CollectionSummary) {
    Alert.alert("删除发布", `确定删除「${item.title}」吗？\n此操作不可恢复。`, [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: async () => {
          try {
            await api.collections.remove(item.id);
            setItems((prev) => prev.filter((x) => x.id !== item.id));
          } catch (e) {
            Alert.alert(
              "删除失败",
              e instanceof ApiError ? e.message : "请稍后重试",
            );
          }
        },
      },
    ]);
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Text style={styles.back}>‹ 返回</Text>
        </Pressable>
        <Text style={styles.title}>大家的收藏夹</Text>
        <Pressable onPress={openPublish} hitSlop={8} style={styles.publishLink}>
          <Text style={styles.publishLinkText}>＋ 发布</Text>
        </Pressable>
      </View>

      <Pressable style={styles.banner} onPress={openPublish}>
        <Text style={styles.bannerTitle}>地球角落 共享计划</Text>
        <Text style={styles.bannerSub}>编辑地点与文案，分享给更多旅人</Text>
      </Pressable>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {items.length === 0 ? (
            <Text style={styles.empty}>还没有共享收藏夹，来做第一个吧</Text>
          ) : (
            items.map((item) => (
              <CollectionCard
                key={item.id}
                item={item}
                onPress={() =>
                  navigation.navigate("CollectionDetail", { collectionId: item.id })
                }
                onDelete={
                  item.is_owner ? () => confirmDelete(item) : undefined
                }
              />
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}
