import React, { memo, useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  Text,
  View,
} from "react-native";
import type { Item, TransportToNext, Trip } from "@travel-guide/shared";
import { ApiError } from "@travel-guide/shared";
import { api } from "../../api/client";
import { TransportRouteSheet } from "../../components/TransportRouteSheet";
import { colors } from "../../theme";
import { SLOT_LABEL, TYPE_LABEL } from "./constants";
import { styles } from "./styles";

function hasCoords(loc: Item["location"]): boolean {
  return loc != null && loc.lng != null && loc.lat != null;
}

const ROUTE_STUB: TransportToNext = {
  mode: "transit",
  distance_m: 0,
  duration_s: 0,
  detail: null,
};

export const ItemBlock = memo(function ItemBlock({
  item,
  tripId,
  canEdit,
  onChanged,
  hasNextRoute,
}: {
  item: Item;
  tripId: string;
  canEdit: boolean;
  onChanged: (trip: Trip) => void;
  hasNextRoute: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [localTransport, setLocalTransport] = useState<TransportToNext | null>(
    item.transport_to_next,
  );
  const alts = item.alternatives || [];
  const showRoute =
    item.selected && hasNextRoute && hasCoords(item.location);
  const transportForSheet =
    localTransport || item.transport_to_next || (showRoute ? ROUTE_STUB : null);

  useEffect(() => {
    setLocalTransport(item.transport_to_next);
  }, [item.transport_to_next]);

  async function toggle() {
    if (!canEdit) return;
    setBusy(true);
    try {
      onChanged(await api.trips.toggleItem(tripId, item.id, !item.selected));
    } catch (e) {
      Alert.alert("失败", e instanceof ApiError ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  async function swap(altIndex: number) {
    if (!canEdit) return;
    setBusy(true);
    try {
      onChanged(await api.trips.swapItem(tripId, item.id, altIndex));
    } catch (e) {
      Alert.alert("失败", e instanceof ApiError ? e.message : "换一个失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.item, !item.selected && styles.itemOff]}>
      <View style={styles.itemHead}>
        <Text style={styles.itemType}>
          {TYPE_LABEL[item.type] || item.type} ·{" "}
          {SLOT_LABEL[item.time_slot] || item.time_slot}
        </Text>
        {canEdit ? (
          <Pressable onPress={toggle} disabled={busy}>
            <Text style={styles.itemAction}>
              {item.selected ? "取消" : "恢复"}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.itemName}>{item.name}</Text>
      {item.description ? (
        <Text style={styles.itemDesc} numberOfLines={4}>
          {item.description}
        </Text>
      ) : null}
      <View style={styles.itemMetaRow}>
        {item.duration_min ? (
          <Text style={styles.itemMeta}>{item.duration_min} 分钟</Text>
        ) : null}
        {item.cost != null ? (
          <Text style={styles.itemMeta}>¥{item.cost}</Text>
        ) : null}
        {item.rating != null ? (
          <Text style={styles.itemMeta}>评分 {item.rating}</Text>
        ) : null}
      </View>
      {showRoute && transportForSheet ? (
        <TransportRouteSheet
          tripId={tripId}
          itemId={item.id}
          fromName={item.name}
          transport={transportForSheet}
          onUpdated={setLocalTransport}
        />
      ) : null}
      {canEdit && alts.length > 0 ? (
        <View style={styles.alts}>
          <Text style={styles.altsLabel}>换一个：</Text>
          {alts.slice(0, 3).map((a, i) => (
            <Pressable key={`${a.poi_id}-${i}`} onPress={() => swap(i)}>
              <Text style={styles.altChip}>{a.name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
});
