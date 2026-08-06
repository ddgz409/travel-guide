import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Trip } from "@travel-guide/shared";
import { ApiError } from "@travel-guide/shared";
import { api } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { colors } from "../../theme";
import { PressScale } from "../../utils/motion";
import type { AppStackParamList } from "../../navigation/types";
import { ItemBlock } from "./ItemBlock";
import { styles } from "./styles";

type Props = NativeStackScreenProps<AppStackParamList, "TripItemDetail">;

function hasCoords(loc: { lng?: number | null; lat?: number | null } | null | undefined): boolean {
  return loc != null && loc.lng != null && loc.lat != null;
}

export function TripItemDetailScreen({ route }: Props) {
  const { tripId, itemId } = route.params;
  const { user, isGuest } = useAuth();
  const canEdit = Boolean(user) || isGuest;
  const [trip, setTrip] = useState<Trip | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.trips.get(tripId);
      setTrip(data);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "加载失败");
    }
  }, [tripId]);

  useEffect(() => {
    void load();
  }, [load]);

  const found = useMemo(() => {
    if (!trip) return null;
    for (const day of trip.days || []) {
      const item = day.items.find((it) => it.id === itemId);
      if (item) return { day, item };
    }
    return null;
  }, [trip, itemId]);

  const hasNextRoute = useMemo(() => {
    if (!found) return false;
    const items = found.day.items;
    const idx = items.findIndex((it) => it.id === itemId);
    if (idx < 0) return false;
    return items
      .slice(idx + 1)
      .some((n) => n.selected && hasCoords(n.location));
  }, [found, itemId]);

  if (error && !trip) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
        <PressScale style={styles.retry} onPress={load}>
          <Text style={styles.retryText}>重试</Text>
        </PressScale>
      </View>
    );
  }

  if (!trip || !found) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <ItemBlock
        item={found.item}
        tripId={tripId}
        canEdit={canEdit}
        onChanged={setTrip}
        hasNextRoute={hasNextRoute}
        showRoute={false}
      />
    </ScrollView>
  );
}
