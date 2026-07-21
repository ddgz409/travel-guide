import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Trip } from "@travel-guide/shared";
import { ApiError } from "@travel-guide/shared";
import { api } from "../api";
import { DayMap } from "../components/DayMap";
import { colors } from "../theme";
import type { AppStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<AppStackParamList, "Share">;

const SLOT: Record<string, string> = {
  morning: "上午",
  afternoon: "下午",
  evening: "晚上",
};
const TYPE: Record<string, string> = {
  attraction: "景点",
  meal: "餐饮",
  hotel: "住宿",
  transport: "交通",
};

export function ShareScreen({ route }: Props) {
  const { token } = route.params;
  const [trip, setTrip] = useState<Trip | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dayIdx, setDayIdx] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const t = await api.trips.getShared(token);
        if (!cancelled) setTrip(t);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "分享链接无效");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }
  if (!trip) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  const day = trip.days[dayIdx] || trip.days[0];
  const items = (day?.items || []).filter((i) => i.selected);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.badge}>分享攻略</Text>
      <Text style={styles.title}>{trip.title}</Text>
      <Text style={styles.meta}>
        {trip.destination} · {trip.start_date} → {trip.end_date} ·{" "}
        {trip.travelers} 人
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, marginVertical: 14 }}
      >
        {trip.days.map((d, i) => (
          <Pressable
            key={d.id}
            style={[styles.tab, i === dayIdx && styles.tabOn]}
            onPress={() => setDayIdx(i)}
          >
            <Text style={[styles.tabText, i === dayIdx && styles.tabTextOn]}>
              Day {d.day_index}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {day?.summary ? (
        <Text style={styles.summary}>{day.summary}</Text>
      ) : null}

      {items.map((it) => (
        <View key={it.id} style={styles.item}>
          <Text style={styles.itemType}>
            {TYPE[it.type]} · {SLOT[it.time_slot]}
          </Text>
          <Text style={styles.itemName}>{it.name}</Text>
          {it.description ? (
            <Text style={styles.itemDesc} numberOfLines={3}>
              {it.description}
            </Text>
          ) : null}
        </View>
      ))}

      {day ? (
        <View style={{ marginTop: 16 }}>
          <Text style={styles.mapTitle}>地图</Text>
          <DayMap tripId={trip.id} dayId={day.id} items={items} />
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  badge: { color: colors.brand, fontWeight: "700", fontSize: 12 },
  title: { marginTop: 6, fontSize: 24, fontWeight: "800", color: colors.ink },
  meta: { marginTop: 8, color: colors.muted, fontSize: 14 },
  tab: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  tabOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  tabText: { fontWeight: "600", color: colors.ink, fontSize: 13 },
  tabTextOn: { color: "#fff" },
  summary: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    color: colors.ink,
    marginBottom: 12,
    lineHeight: 20,
  },
  item: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    marginBottom: 8,
  },
  itemType: { fontSize: 12, color: colors.brand, fontWeight: "600" },
  itemName: { marginTop: 2, fontSize: 16, fontWeight: "700", color: colors.ink },
  itemDesc: { marginTop: 4, fontSize: 13, color: colors.muted },
  mapTitle: { fontWeight: "800", color: colors.ink, marginBottom: 8 },
  error: { color: colors.danger },
});
