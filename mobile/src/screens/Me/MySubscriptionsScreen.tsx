import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { CollectionSummary } from "@travel-guide/shared";
import { api } from "../../api/client";
import { CollectionCard } from "../../components/CollectionCard";
import { colors } from "../../theme";
import type { AppStackParamList } from "../../navigation/types";
import { styles } from "./mySubscriptionsStyles";

type Props = NativeStackScreenProps<AppStackParamList, "MySubscriptions">;

export function MySubscriptionsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<CollectionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.collections.subscribed();
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

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Text style={styles.back}>‹ 返回</Text>
        </Pressable>
        <Text style={styles.title}>我的订阅</Text>
        <View style={{ width: 48 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {items.length === 0 ? (
            <Text style={styles.empty}>还没有订阅，去探索页看看吧</Text>
          ) : (
            items.map((item) => (
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
      )}
    </View>
  );
}
