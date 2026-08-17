import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";
import {
  itemTypeToPortalKind,
  openCtripPoi,
  openQunarPoi,
  openXhsPoi,
  type PoiPortalKind,
} from "../utils/poiPortals";
import { openAmapPoiLookup } from "../utils/openMapNavigation";

type Props = {
  city: string;
  name: string;
  kind?: PoiPortalKind;
  itemType?: string;
  compact?: boolean;
};

const PORTALS = [
  { id: "amap" as const, label: "高德", color: "#0091FF", short: "高" },
  { id: "xhs" as const, label: "小红书", color: "#E6162D", short: "红" },
  { id: "ctrip" as const, label: "携程", color: "#1A6DB5", short: "携" },
  { id: "qunar" as const, label: "去哪儿", color: "#FF6B35", short: "去" },
];

/** 打开第三方 App 看攻略，不含行程分享 */
export function PoiPortalLinks({ city, name, kind, itemType, compact }: Props) {
  const portalKind = kind ?? (itemType ? itemTypeToPortalKind(itemType) : "attraction");

  function onPress(id: (typeof PORTALS)[number]["id"]) {
    const opts = { city, name, kind: portalKind };
    if (id === "amap") {
      void openAmapPoiLookup({ city, name });
      return;
    }
    if (id === "xhs") void openXhsPoi(opts);
    else if (id === "ctrip") void openCtripPoi(opts);
    else void openQunarPoi({ ...opts, kind: portalKind });
  }

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      {compact ? null : <Text style={styles.label}>在其他平台查看</Text>}
      <View style={styles.row}>
        {PORTALS.map((p) => (
          <Pressable
            key={p.id}
            style={styles.chip}
            onPress={() => onPress(p.id)}
          >
            <View style={[styles.badge, { backgroundColor: p.color }]}>
              <Text style={styles.badgeText}>{p.short}</Text>
            </View>
            <Text style={styles.chipText}>{p.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 8,
    backgroundColor: "#F7FBFF",
    borderRadius: 22,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "#D7EAF8",
    padding: 14,
  },
  wrapCompact: {
    marginTop: 10,
    padding: 10,
    backgroundColor: "#EEF7FF",
  },
  label: {
    fontSize: 15,
    color: colors.ink,
    fontWeight: "800",
    marginBottom: 10,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 30,
    borderCurve: "continuous",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: colors.line,
  },
  badge: {
    width: 20,
    height: 20,
    borderRadius: 14,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },
  badgeText: {
    fontSize: 10,
    color: "#fff",
    fontWeight: "800",
  },
  chipText: {
    fontSize: 14,
    color: colors.ink,
    fontWeight: "700",
  },
});
