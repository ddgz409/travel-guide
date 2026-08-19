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
import type { CollectionDetail } from "@travel-guide/shared";
import { ApiError } from "@travel-guide/shared";
import { api } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { PlaceImage } from "../../components/PlaceImage";
import { colors } from "../../theme";
import type { AppStackParamList } from "../../navigation/types";
import { formatCollectionMeta } from "../../utils/collectionFormat";
import { styles } from "./collectionDetailStyles";

type Props = NativeStackScreenProps<AppStackParamList, "CollectionDetail">;

export function CollectionDetailScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { collectionId } = route.params;
  const [detail, setDetail] = useState<CollectionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDetail(await api.collections.get(collectionId));
    } catch (e) {
      Alert.alert("加载失败", e instanceof ApiError ? e.message : "请稍后重试");
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [collectionId, navigation]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function toggleSubscribe() {
    if (!user) {
      Alert.alert("需要登录", "登录后即可订阅收藏夹", [
        { text: "取消", style: "cancel" },
        { text: "去登录", onPress: () => navigation.navigate("Login") },
      ]);
      return;
    }
    if (!detail || busy) return;
    setBusy(true);
    try {
      if (detail.subscribed) {
        await api.collections.unsubscribe(detail.id);
        setDetail({
          ...detail,
          subscribed: false,
          subscriber_count: Math.max(0, detail.subscriber_count - 1),
        });
      } else {
        await api.collections.subscribe(detail.id);
        setDetail({
          ...detail,
          subscribed: true,
          subscriber_count: detail.subscriber_count + 1,
        });
      }
    } catch (e) {
      Alert.alert("操作失败", e instanceof ApiError ? e.message : "请稍后重试");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !detail) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Text style={styles.back}>‹ 返回</Text>
        </Pressable>
        {detail.is_owner ? (
          <Pressable
            style={styles.editBtn}
            onPress={() =>
              navigation.navigate("PublishCollection", { collectionId: detail.id })
            }
          >
            <Text style={styles.editBtnIcon}>✎</Text>
            <Text style={styles.editBtnText}>编辑</Text>
          </Pressable>
        ) : (
          <View style={{ width: 72 }} />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.emoji}>{detail.emoji}</Text>
        <Text style={styles.title}>{detail.title}</Text>
        <Text style={styles.author}>by {detail.author_display}</Text>
        {detail.summary ? <Text style={styles.summary}>{detail.summary}</Text> : null}
        <Text style={styles.meta}>
          {formatCollectionMeta(detail.place_count, detail.subscriber_count)}
        </Text>

        {!detail.is_owner ? (
          <Pressable
            style={[styles.subBtn, detail.subscribed && styles.subBtnOn]}
            onPress={() => void toggleSubscribe()}
            disabled={busy}
          >
            <Text style={[styles.subBtnText, detail.subscribed && styles.subBtnTextOn]}>
              {busy ? "…" : detail.subscribed ? "已订阅" : "订阅收藏夹"}
            </Text>
          </Pressable>
        ) : null}

        <Text style={styles.sectionTitle}>地点清单</Text>
        {detail.places.map((p, i) => (
          <View key={`${p.name}-${i}`} style={styles.placeRow}>
            <View style={styles.placeThumb}>
              <PlaceImage
                city={p.city}
                name={p.name}
                category="spots"
                poiId={p.poi_id || undefined}
                style={styles.placeThumbImg}
              />
            </View>
            <View style={styles.placeBody}>
              <Text style={styles.placeName}>{p.name}</Text>
              {p.note ? <Text style={styles.placeNote}>{p.note}</Text> : null}
              <Text style={styles.placeSub} numberOfLines={2}>
                {[p.city, p.address].filter(Boolean).join(" · ")}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
