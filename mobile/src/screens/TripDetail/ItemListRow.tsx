import React, { memo, useState } from "react";
import { Image, Text, View } from "react-native";
import type { Item, TransportToNext } from "@travel-guide/shared";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { TransportRouteSheet } from "../../components/TransportRouteSheet";
import { PressScale } from "../../utils/motion";
import { colors } from "../../theme";
import type { AppStackParamList } from "../../navigation/types";
import { SLOT_LABEL, TYPE_LABEL } from "./constants";
import { itemCoverFor } from "./itemCover";
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

const TYPE_BADGE: Record<string, { bg: string; fg: string }> = {
  attraction: { bg: "#e8f5e9", fg: "#2e7d32" },
  meal: { bg: "#fff3e0", fg: "#e65100" },
  hotel: { bg: "#e3f2fd", fg: "#1565c0" },
  transport: { bg: "#f3e5f5", fg: "#6a1b9a" },
};

export const ItemListRow = memo(function ItemListRow({
  item,
  tripId,
  destination,
  hasNextRoute,
}: {
  item: Item;
  tripId: string;
  destination: string;
  hasNextRoute: boolean;
}) {
  const navigation =
    useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const [expanded, setExpanded] = useState(false);
  const showRoute =
    item.selected && hasNextRoute && hasCoords(item.location);
  const transportForSheet =
    item.transport_to_next || (showRoute ? ROUTE_STUB : null);
  const cover = itemCoverFor(item, destination);
  const badge = TYPE_BADGE[item.type] || { bg: "#f5f5f5", fg: colors.ink };
  const desc = item.description?.trim() || "";
  const longDesc = desc.length > 56;

  return (
    <View style={[styles.feedCard, !item.selected && styles.itemOff]}>
      <PressScale
        onPress={() =>
          navigation.navigate("TripItemDetail", { tripId, itemId: item.id })
        }
        style={styles.feedRow}
      >
        <View style={styles.feedThumbWrap}>
          {cover.source ? (
            <Image source={cover.source} style={styles.feedThumb} />
          ) : (
            <View style={[styles.feedThumb, { backgroundColor: cover.bg }]}>
              <Text style={styles.feedThumbEmoji}>{cover.emoji}</Text>
            </View>
          )}
        </View>

        <View style={styles.feedBody}>
          <Text style={styles.feedTitle} numberOfLines={2}>
            {item.name}
          </Text>

          <View style={styles.feedTags}>
            <View style={[styles.feedTag, { backgroundColor: badge.bg }]}>
              <Text style={[styles.feedTagText, { color: badge.fg }]}>
                {TYPE_LABEL[item.type] || item.type}
              </Text>
            </View>
            <View style={styles.feedTagMuted}>
              <Text style={styles.feedTagMutedText}>
                {SLOT_LABEL[item.time_slot] || item.time_slot}
                {item.duration_min ? ` · ${item.duration_min}分钟` : ""}
              </Text>
            </View>
          </View>

          {desc ? (
            <Text
              style={styles.feedDesc}
              numberOfLines={expanded ? undefined : 2}
            >
              {desc}
              {longDesc && !expanded ? (
                <Text
                  style={styles.feedExpand}
                  onPress={() => setExpanded(true)}
                >
                  {" "}
                  …展开
                </Text>
              ) : null}
            </Text>
          ) : null}

          <View style={styles.feedMetaRow}>
            {item.cost != null ? (
              <Text style={styles.feedMeta}>¥{item.cost}</Text>
            ) : null}
            {item.rating != null ? (
              <Text style={styles.feedMeta}>评分 {item.rating}</Text>
            ) : null}
          </View>
        </View>
      </PressScale>

      {showRoute && transportForSheet ? (
        <View style={styles.feedRoute}>
          <TransportRouteSheet
            tripId={tripId}
            itemId={item.id}
            fromName={item.name}
            transport={transportForSheet}
          />
        </View>
      ) : null}
    </View>
  );
});
