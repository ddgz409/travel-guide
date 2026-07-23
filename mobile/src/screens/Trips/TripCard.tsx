import React from "react";
import {
  Image,
  ImageSourcePropType,
  Text,
  View,
} from "react-native";
import type { TripListItem } from "@travel-guide/shared";
import { PressScale } from "../../utils/motion";
import { pastels } from "../../theme";
import { coverFor } from "../../data/covers";
import {
  fmtMd,
  tripDaysNights,
  tripPhase,
  statusLabel,
} from "./helpers";
import { styles } from "./styles";

const CARD_COLORS = pastels;

export function TripCard({
  item,
  index,
  username,
  onPress,
  onLongPress,
}: {
  item: TripListItem;
  index: number;
  username?: string;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const bg = CARD_COLORS[index % CARD_COLORS.length];
  const phase = tripPhase(item);
  const { days, nights } = tripDaysNights(item.start_date, item.end_date);
  const travelers = Math.max(1, item.travelers || 1);
  const initial = (username || item.destination || "旅").slice(0, 1);

  return (
    <PressScale
      style={styles.cardPress}
      scaleTo={0.985}
      onPress={onPress}
      onLongPress={onLongPress}
    >
      <View style={[styles.card, { backgroundColor: bg }]}>
        <View style={styles.badge}>
          <View
            style={[
              styles.badgeDot,
              phase.tone === "live" && styles.badgeDotLive,
              phase.tone === "busy" && styles.badgeDotBusy,
              phase.tone === "fail" && styles.badgeDotFail,
              phase.tone === "soon" && styles.badgeDotSoon,
            ]}
          />
          <Text style={styles.badgeText}>{phase.label}</Text>
        </View>

        <Text style={styles.cardTitle} numberOfLines={2}>
          {item.title || `${item.destination}行程`}
        </Text>

        <View style={styles.metaBlock}>
          <View style={styles.metaBar} />
          <View style={styles.metaTextCol}>
            <Text style={styles.metaLine}>
              {fmtMd(item.start_date)}至{fmtMd(item.end_date)} {days}天
              {nights > 0 ? `${nights}晚` : ""}
            </Text>
            <Text style={styles.metaLine}>
              {item.destination}
              {item.status !== "ready" ? ` · ${statusLabel(item.status)}` : ""}
              {travelers > 1 ? ` · ${travelers}人` : ""}
            </Text>
          </View>
        </View>

        <View style={styles.cardBottom}>
          <View style={styles.avatars}>
            {Array.from({ length: Math.min(travelers, 3) }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.avatar,
                  { marginLeft: i === 0 ? 0 : -10, zIndex: 3 - i },
                  i === 0 ? styles.avatarPrimary : styles.avatarSecondary,
                ]}
              >
                <Text style={styles.avatarText}>
                  {i === 0 ? initial : String(i + 1)}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.coverWrap} pointerEvents="none">
          <Image
            source={coverFor(item.destination)}
            style={styles.cover}
            resizeMode="cover"
          />
        </View>
      </View>
    </PressScale>
  );
}
