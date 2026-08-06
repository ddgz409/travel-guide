import React, { useMemo } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { colors, cardShadow } from "../../theme";
import { buildCheckInMapHtml } from "../../utils/checkInMapHtml";
import { styles } from "./styles";

type Props = {
  checkedPrefectureIds: string[];
  checkInCount: number;
  loading?: boolean;
  onPress?: () => void;
};

export function CheckInMapCard({
  checkedPrefectureIds,
  checkInCount,
  loading,
  onPress,
}: Props) {
  const html = useMemo(
    () => buildCheckInMapHtml(checkedPrefectureIds),
    [checkedPrefectureIds],
  );

  return (
    <Pressable style={styles.checkInMapCard} onPress={onPress}>
      <View style={styles.checkInMapHead}>
        <Text style={styles.checkInMapTitle}>打卡地图</Text>
        <Text style={styles.checkInMapSub}>
          {checkInCount > 0
            ? `已打卡 ${checkInCount} 处 · 淡蓝为已到访地级市`
            : "打卡后地级市将以淡蓝色标记"}
        </Text>
        <Text style={styles.checkInMapTap}>点击放大 ›</Text>
      </View>
      <View style={styles.checkInMapBody}>
        {loading ? (
          <View style={styles.checkInMapLoading}>
            <ActivityIndicator color={colors.brand} />
          </View>
        ) : (
          <WebView
            originWhitelist={["*"]}
            source={{ html, baseUrl: "about:blank" }}
            style={styles.checkInMapWeb}
            scrollEnabled={false}
            bounces={false}
            pointerEvents="none"
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            javaScriptEnabled={false}
            domStorageEnabled={false}
            androidLayerType="hardware"
          />
        )}
      </View>
      <View style={styles.checkInMapLegend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: "#FFFFFF", borderColor: "#B8B8B8" }]} />
          <Text style={styles.legendText}>未打卡</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: "#D7EAF8", borderColor: "#B8B8B8" }]} />
          <Text style={styles.legendText}>已打卡</Text>
        </View>
      </View>
    </Pressable>
  );
}
