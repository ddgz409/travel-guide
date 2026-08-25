import React, { memo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Item, TransportToNext } from "@travel-guide/shared";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { PlaceImage } from "../../components/PlaceImage";
import { TransportRouteSheet } from "../../components/TransportRouteSheet";
import { PressScale } from "../../utils/motion";
import { colors } from "../../theme";
import type { PlaceCategory } from "../../utils/placeImage";
import type { AppStackParamList } from "../../navigation/types";
import { SLOT_LABEL, TYPE_LABEL } from "./constants";
import { itemCoverFor } from "./itemCover";
import { styles } from "./styles";

function placeKind(type: Item["type"]): PlaceCategory | undefined {
  if (type === "meal") return "foods";
  if (type === "attraction") return "spots";
  return undefined;
}

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
  compact = false,
  onPoiPress,
  onDelete,
}: {
  item: Item;
  tripId: string;
  destination: string;
  hasNextRoute: boolean;
  /** 排序编辑态：压缩高度、隐藏描述/交通段，让拖拽更轻快 */
  compact?: boolean;
  onPoiPress?: () => void;
  /** 传入后显示右上角删除按钮（编辑态） */
  onDelete?: () => void;
}) {
  const navigation =
    useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const [expanded, setExpanded] = useState(false);
  const showRoute =
    !compact && item.selected && hasNextRoute && hasCoords(item.location);
  const transportForSheet =
    item.transport_to_next || (showRoute ? ROUTE_STUB : null);
  const cover = itemCoverFor(item, destination);
  const badge = TYPE_BADGE[item.type] || { bg: "#f5f5f5", fg: colors.ink };
  const desc = item.description?.trim() || "";
  const longDesc = desc.length > 56;

  return (
    <View style={[styles.feedCard, !item.selected && styles.itemOff]}>
      {onDelete ? (
        <Pressable
          style={styles.deleteBtn}
          onPress={onDelete}
          hitSlop={10}
          accessibilityLabel={`删除 ${item.name}`}
        >
          <Text style={styles.deleteBtnText}>✕</Text>
        </Pressable>
      ) : null}
      <PressScale
        onPress={() => {
          if (onPoiPress) {
            onPoiPress();
            return;
          }
          navigation.navigate("TripItemDetail", { tripId, itemId: item.id });
        }}
        style={styles.feedRow}
      >
        <View style={[styles.feedThumbWrap, compact && localStyles.cThumbWrap]}>
          {item.type === "transport" ? (
            <View style={[styles.feedThumb, compact && localStyles.cThumb, { backgroundColor: cover.bg }]}>
              <Text style={[styles.feedThumbEmoji, compact && localStyles.cThumbEmoji]}>{cover.emoji}</Text>
            </View>
          ) : (
            <PlaceImage
              city={destination}
              name={item.name}
              category={placeKind(item.type)}
              poiId={item.poi_id || undefined}
              style={[styles.feedThumb, compact && localStyles.cThumb]}
              fallbackSource={cover.source}
              fallback={
                <View style={[styles.feedThumb, compact && localStyles.cThumb, { backgroundColor: cover.bg }]}>
                  <Text style={[styles.feedThumbEmoji, compact && localStyles.cThumbEmoji]}>{cover.emoji}</Text>
                </View>
              }
            />
          )}
        </View>

        <View style={styles.feedBody}>
          <Text
            style={[styles.feedTitle, compact && localStyles.cTitle]}
            numberOfLines={compact ? 1 : 2}
          >
            {item.name}
          </Text>

          {compact ? (
            <View style={styles.feedTags}>
              <View style={[styles.feedTag, { backgroundColor: badge.bg }]}>
                <Text style={[styles.feedTagText, { color: badge.fg }]}>
                  {TYPE_LABEL[item.type] || item.type}
                </Text>
              </View>
            </View>
          ) : (
            <>
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
            </>
          )}
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

const localStyles = StyleSheet.create({
  cThumbWrap: { width: 46, height: 46 },
  cThumb: { width: 46, height: 46, borderRadius: 12 },
  cThumbEmoji: { fontSize: 22 },
  cTitle: { fontSize: 14 },
});
