/** 自定义底部导航栏：探索 / + / 行程 */

import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, cardShadow } from "../theme";
import { PlusMenu } from "./PlusMenu";

type Tab = "Trips" | "Explore";

type Props = {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
};

export function CustomTabBar({ activeTab, onTabChange }: Props) {
  const insets = useSafeAreaInsets();
  const [plusOpen, setPlusOpen] = useState(false);

  return (
    <>
      <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        {/* 左：探索 */}
        <Pressable
          style={styles.tabItem}
          onPress={() => onTabChange("Explore")}
        >
          <Text style={[styles.tabIcon, activeTab === "Explore" && styles.tabIconActive]}>
            🗺️
          </Text>
          <Text style={[styles.tabLabel, activeTab === "Explore" && styles.tabLabelActive]}>
            探索
          </Text>
        </Pressable>

        {/* 中：+ 按钮 */}
        <Pressable
          style={styles.plusBtn}
          onPress={() => setPlusOpen(true)}
        >
          <View style={styles.plusCircle}>
            <Text style={styles.plusText}>+</Text>
          </View>
        </Pressable>

        {/* 右：行程 */}
        <Pressable
          style={styles.tabItem}
          onPress={() => onTabChange("Trips")}
        >
          <Text style={[styles.tabIcon, activeTab === "Trips" && styles.tabIconActive]}>
            📋
          </Text>
          <Text style={[styles.tabLabel, activeTab === "Trips" && styles.tabLabelActive]}>
            行程
          </Text>
        </Pressable>
      </View>

      <PlusMenu visible={plusOpen} onClose={() => setPlusOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-around",
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 4,
  },
  tabIcon: {
    fontSize: 22,
    opacity: 0.4,
  },
  tabIconActive: {
    opacity: 1,
  },
  tabLabel: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
    fontWeight: "600",
  },
  tabLabelActive: {
    color: colors.brand,
    fontWeight: "700",
  },
  plusBtn: {
    width: 64,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  plusCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -20,
    ...cardShadow,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  plusText: {
    fontSize: 30,
    color: "#fff",
    fontWeight: "300",
    marginTop: -2,
  },
});
