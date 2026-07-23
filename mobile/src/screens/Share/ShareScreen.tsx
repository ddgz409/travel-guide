import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Trip } from "@travel-guide/shared";
import { ApiError } from "@travel-guide/shared";
import { api } from "../../api/client";
import { DayMap } from "../../components/DayMap/DayMap";
import { colors } from "../../theme";
import type { AppStackParamList } from "../../navigation/types";
import { SLOT_LABEL, TYPE_LABEL } from "../TripDetail/constants";
import { styles } from "./styles";

type Props = NativeStackScreenProps<AppStackParamList, "Share">;

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
            {TYPE_LABEL[it.type]} · {SLOT_LABEL[it.time_slot]}
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
