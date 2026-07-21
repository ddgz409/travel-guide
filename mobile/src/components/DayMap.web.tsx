import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import type { Item } from "@travel-guide/shared";
import { api } from "../api";
import { colors } from "../theme";

type Props = {
  tripId: string;
  dayId?: string;
  items: Item[];
  height?: number;
  title?: string;
};

/** Web 预览：不加载 react-native-maps（会崩），只展示点位列表 */
export function DayMap({ tripId, dayId, items, height = 260 }: Props) {
  const [loading, setLoading] = useState(false);
  const [meta, setMeta] = useState<string | null>(null);

  const markers = items.filter(
    (it) => it.selected && it.location?.lng != null && it.location?.lat != null,
  );

  useEffect(() => {
    if (!dayId || markers.length < 2) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await api.trips.getDayRoutes(tripId, dayId, "transit");
        if (cancelled) return;
        setMeta(
          `${data.segment_count ?? data.segments.length} 段 · ${(
            data.total_distance_m / 1000
          ).toFixed(1)} km`,
        );
      } catch {
        if (!cancelled) setMeta(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tripId, dayId, markers.length]);

  return (
    <View style={[styles.box, { height }]}>
      <Text style={styles.title}>当日点位（{markers.length}）</Text>
      {markers.map((m, i) => (
        <Text key={m.id} style={styles.row}>
          {i + 1}. {m.name}
        </Text>
      ))}
      {loading ? <ActivityIndicator color={colors.brand} /> : null}
      {meta ? <Text style={styles.meta}>{meta}</Text> : null}
      <Text style={styles.hint}>完整地图请在 Android / iOS 端查看</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.card,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  title: { fontWeight: "700", color: colors.ink, marginBottom: 8 },
  row: { fontSize: 13, color: colors.ink, marginBottom: 4 },
  meta: { marginTop: 6, fontSize: 12, color: colors.brand },
  hint: { marginTop: 8, fontSize: 12, color: colors.muted },
});
