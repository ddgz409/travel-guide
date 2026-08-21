import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { CollectionSummary } from "@travel-guide/shared";
import { PlaceImage } from "./PlaceImage";
import { colors, cardShadow } from "../theme";
import { formatCollectionMeta } from "../utils/collectionFormat";

type Props = {
  item: CollectionSummary;
  onPress: () => void;
  /** 提供时在卡片右下角显示「删除」，仅自己的发布贴子传入 */
  onDelete?: () => void;
  /** 提供时作者名可点（仅真实注册用户作者传入） */
  onAuthorPress?: () => void;
};

/** 探索页共享收藏夹卡片 */
export function CollectionCard({ item, onPress, onDelete, onAuthorPress }: Props) {
  const covers = item.cover_places?.length
    ? item.cover_places
    : [{ name: item.city || "景点", city: item.city || "北京" }];
  const authorName = item.author_display || "旅人";

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
              category="spots"
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
        {onAuthorPress ? (
          <Pressable
            onPress={onAuthorPress}
            hitSlop={6}
            style={styles.authorRow}
            accessibilityRole="button"
            accessibilityLabel={`查看作者 ${authorName} 的主页`}
          >
            <Text style={styles.authorLink} numberOfLines={1}>
              by {authorName} ›
            </Text>
          </Pressable>
        ) : (
          <Text style={styles.authorPlain} numberOfLines={1}>
            by {authorName}
          </Text>
        )}
        <View style={styles.metaRow}>
          <Text style={styles.meta}>
            {formatCollectionMeta(
              item.place_count,
              item.subscriber_count,
              item.like_count,
            )}
          </Text>
          {onDelete ? (
            <Pressable
              style={styles.deleteBtn}
              onPress={onDelete}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="删除这条发布"
            >
              <Text style={styles.deleteText}>删除</Text>
            </Pressable>
          ) : null}
        </View>
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
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },
  authorRow: { alignSelf: "flex-start", marginTop: 4 },
  authorLink: { fontSize: 12, fontWeight: "700", color: colors.brandHot },
  authorPlain: { marginTop: 4, fontSize: 12, color: colors.muted },
  meta: {
    fontSize: 11,
    color: colors.muted,
  },
  deleteBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderCurve: "continuous",
    backgroundColor: "rgba(255,255,255,0.7)",
  },
  deleteText: { fontSize: 12, fontWeight: "700", color: colors.danger },
});
