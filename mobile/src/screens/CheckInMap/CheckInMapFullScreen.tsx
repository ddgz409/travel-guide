import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { WebView } from "react-native-webview";
import type { AppStackParamList } from "../../navigation/types";
import { colors } from "../../theme";
import { buildCheckInMapHtml } from "../../utils/checkInMapHtml";
import { getCheckedPrefectureIds } from "../../utils/checkInStore";
import { styles } from "./styles";

type Props = NativeStackScreenProps<AppStackParamList, "CheckInMapFull">;

export function CheckInMapFullScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCheckedIds(await getCheckedPrefectureIds());
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const html = useMemo(
    () => buildCheckInMapHtml(checkedIds, { interactive: true }),
    [checkedIds],
  );

  return (
    <View style={styles.fullRoot}>
      <View style={[styles.fullHeader, { paddingTop: Math.max(insets.top, 8) }]}>
        <Pressable style={styles.fullBack} onPress={() => navigation.goBack()}>
          <Text style={styles.fullBackText}>‹</Text>
        </Pressable>
        <View style={styles.fullTitleWrap}>
          <Text style={styles.fullTitle}>打卡地图</Text>
          <Text style={styles.fullSub}>双指缩放 · 中心区域高亮城市名</Text>
        </View>
      </View>
      <View style={styles.fullBody}>
        {loading ? (
          <View style={styles.fullLoading}>
            <ActivityIndicator color={colors.brand} size="large" />
          </View>
        ) : (
          <WebView
            originWhitelist={["*"]}
            source={{ html, baseUrl: "about:blank" }}
            style={styles.fullWeb}
            scrollEnabled={false}
            bounces={false}
            javaScriptEnabled
            domStorageEnabled={false}
            androidLayerType="hardware"
          />
        )}
      </View>
      <View style={[styles.fullLegend, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, styles.legendWhite]} />
          <Text style={styles.legendText}>未打卡</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, styles.legendChecked]} />
          <Text style={styles.legendText}>已打卡</Text>
        </View>
        <Text style={styles.fullCount}>已打卡 {checkedIds.length} 市</Text>
      </View>
    </View>
  );
}
