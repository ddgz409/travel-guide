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

type Props = {
  city: string;
  name: string;
  kind?: PoiPortalKind;
  /** 使用 item.type 自动推断 kind */
  itemType?: string;
};

const PORTALS = [
  { id: "xhs" as const, label: "小红书", color: "#E6162D", short: "红" },
  { id: "ctrip" as const, label: "携程", color: "#1A6DB5", short: "携" },
  { id: "qunar" as const, label: "去哪儿", color: "#FF6B35", short: "去" },
];

export function PoiPortalLinks({ city, name, kind, itemType }: Props) {
  const portalKind = kind ?? (itemType ? itemTypeToPortalKind(itemType) : "attraction");

  function onPress(id: (typeof PORTALS)[number]["id"]) {
    const opts = { city, name, kind: portalKind };
    if (id === "xhs") void openXhsPoi(opts);
    else if (id === "ctrip") void openCtripPoi(opts);
    else void openQunarPoi({ ...opts, kind: portalKind });
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>查看攻略</Text>
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
    marginTop: 4,
  },
  label: {
    fontSize: 13,
    color: colors.muted,
    fontWeight: "600",
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
    backgroundColor: "#f7f7f7",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: colors.line,
  },
  badge: {
    width: 18,
    height: 18,
    borderRadius: 4,
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
    fontSize: 13,
    color: colors.ink,
    fontWeight: "700",
  },
});
