import React from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { colors } from "../../theme";
import type { AppStackParamList } from "../../navigation/types";
import { PORTALS, openPortal, type TravelMode } from "../../utils/travelPortals";
import { styles } from "./styles";

type Props = NativeStackScreenProps<AppStackParamList, "PortalSelect">;

const MODE_LABEL: Record<string, string> = {
  flight: "飞机",
  train: "火车",
  car: "汽车",
  bike: "自行车",
  walk: "行人",
};

export function PortalSelectScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { from, to, mode } = route.params;

  const modeLabel = MODE_LABEL[mode] || mode;

  const handlePress = async (portal: (typeof PORTALS)[number]) => {
    await openPortal(portal, from, to, mode as TravelMode);
    navigation.goBack();
  };

  return (
    <View style={[styles.root, { paddingTop: Math.max(insets.top, 10) }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backText}>{"\u2039"} 返回</Text>
        </Pressable>
        <Text style={styles.headerTitle}>选择出行平台</Text>
      </View>

      {/* Subtitle */}
      <Text style={styles.subtitle}>
        {from} {"\u2192"} {to} {"\u00B7"} {modeLabel}
      </Text>

      {/* 2x2 Grid */}
      <View style={styles.grid}>
        {PORTALS.map((portal) => {
          const supportsMode = portal.modes.includes(mode as TravelMode);
          return (
            <Pressable
              key={portal.id}
              style={[
                styles.card,
                { backgroundColor: portal.color },
                !supportsMode && { opacity: 0.35 },
              ]}
              disabled={!supportsMode}
              onPress={() => handlePress(portal)}
            >
              <Text style={styles.cardEmoji}>
                {mode === "train" && portal.id === "12306"
                  ? "\uD83D\uDE84"
                  : portal.emoji}
              </Text>
              <Text style={styles.cardName}>{portal.name}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
