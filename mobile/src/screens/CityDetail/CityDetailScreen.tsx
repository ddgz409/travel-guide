import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ApiError } from "@travel-guide/shared";
import type { CityFood, CitySpot } from "@travel-guide/shared";
import { api } from "../../api/client";
import { colors } from "../../theme";
import type { AppStackParamList } from "../../navigation/types";
import { styles } from "./styles";

type Props = NativeStackScreenProps<AppStackParamList, "CityDetail">;

export function CityDetailScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { city } = route.params;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [foods, setFoods] = useState<CityFood[]>([]);
  const [spots, setSpots] = useState<CitySpot[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.destinations.info(city);
      setFoods(result.foods || []);
      setSpots(result.spots || []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "搜索失败，请重试");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function goGenerate() {
    navigation.navigate("Generate", { destination: city });
  }

  const isEmpty = !loading && !error && foods.length === 0 && spots.length === 0;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 8) }]}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{city}</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} size="large" />
          <Text style={styles.loadingText}>正在搜索 {city} 真实信息…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryText}>重试</Text>
          </Pressable>
        </View>
      ) : isEmpty ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>
            暂无 {city} 的相关信息
          </Text>
          <Pressable style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryText}>重新搜索</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.hero}>
            <Text style={styles.heroCity}>{city}</Text>
            <Text style={styles.heroSub}>基于联网搜索的真实信息</Text>
          </View>

          {foods.length > 0 ? (
            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionIcon}>🍜</Text>
                <Text style={styles.sectionTitle}>当地特色美食</Text>
              </View>
              {foods.map((f, i) => (
                <View key={`food-${i}`} style={styles.itemCard}>
                  <Text style={styles.itemName}>{f.name}</Text>
                  <Text style={styles.itemDesc}>{f.desc}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {spots.length > 0 ? (
            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionIcon}>📍</Text>
                <Text style={styles.sectionTitle}>热门景点</Text>
              </View>
              {spots.map((s, i) => (
                <View key={`spot-${i}`} style={styles.itemCard}>
                  <Text style={styles.itemName}>{s.name}</Text>
                  <Text style={styles.itemDesc}>{s.desc}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <Pressable style={styles.genBtn} onPress={goGenerate}>
            <Text style={styles.genBtnText}>为 {city} 生成旅行攻略 ›</Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}
