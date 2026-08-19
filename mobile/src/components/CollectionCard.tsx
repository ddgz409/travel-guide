import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { CollectionSummary } from "@travel-guide/shared";
import { PlaceImage } from "./PlaceImage";
import { colors, cardShadow } from "../theme";
import { formatCollectionMeta } from "../utils/collectionFormat";

type Props = {
  item: CollectionSummary;
  onPress: () => void;
};

/** 探索页共享收藏夹卡片 */
export function CollectionCard({ item, onPress }: Props) {
  const covers = item.cover_places?.length
    ? item.cover_places
    : [{ name: item.city || "景点", city: item.city || "北京" }];

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.folderWrap}>
        <View style={styles.folderBack} />
        {covers.slice(0, 3).map((p, i) => (
          <View
            key={`${p.name}-${i}`}
            style={[
              styles.photo,
              i === 0 && styles.photo0,
              i === 1 && styles.photo1,
              i === 2 && styles.photo2,
            ]}
          >
            <PlaceImage
              city={p.city}
              name={p.name}
              poiId={p.poi_id || undefined}
              style={styles.photoImg}
            />
          </View>
        ))}
        <Text style={styles.emoji}>{item.emoji || "📁"}</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.meta}>{formatCollectionMeta(item.place_count, item.subscriber_count)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: colors.card,
    borderRadius: 22,
    borderCurve: "continuous",
    padding: 14,
    marginBottom: 12,
    gap: 12,
    ...cardShadow,
  },
  folderWrap: {
    width: 88,
    height: 88,
    position: "relative",
  },
  folderBack: {
    position: "absolute",
    left: 6,
    top: 10,
    right: 0,
    bottom: 0,
    borderRadius: 14,
    borderCurve: "continuous",
    backgroundColor: "#ECEFF3",
  },
  photo: {
    position: "absolute",
    width: 52,
    height: 52,
    borderRadius: 10,
    borderCurve: "continuous",
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#fff",
    backgroundColor: colors.brandSoft,
  },
  photo0: { left: 8, top: 4, transform: [{ rotate: "-8deg" }] },
  photo1: { left: 22, top: 12, transform: [{ rotate: "6deg" }] },
  photo2: { left: 14, top: 24, transform: [{ rotate: "-3deg" }] },
  photoImg: { width: "100%", height: "100%" },
  emoji: {
    position: "absolute",
    left: 0,
    bottom: 2,
    fontSize: 22,
  },
  body: {
    flex: 1,
    minWidth: 0,
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.ink,
    lineHeight: 22,
  },
  meta: {
    alignSelf: "flex-end",
    fontSize: 11,
    color: colors.muted,
    marginTop: 8,
  },
});
