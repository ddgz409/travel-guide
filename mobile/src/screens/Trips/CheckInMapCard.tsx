import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import {
  buildCheckInMapHtml,
  type ProvincePhotoData,
} from "../../utils/checkInMapHtml";
import {
  buildProvincePhotoDataUris,
  getAllProvincePhotos,
  subscribeMapPhotos,
} from "../../utils/mapPhotoStore";
import { styles } from "./styles";

type Props = {
  checkedPrefectureIds: string[];
  checkInCount?: number;
  loading?: boolean;
  onPress?: () => void;
};

export function CheckInMapCard({
  checkedPrefectureIds,
  loading,
  onPress,
}: Props) {
  const [provincePhotos, setProvincePhotos] = useState<ProvincePhotoData>({});
  const [photosLoading, setPhotosLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      setPhotosLoading(true);
      try {
        const store = await getAllProvincePhotos();
        const data = await buildProvincePhotoDataUris(store);
        if (!cancelled) setProvincePhotos(data);
      } finally {
        if (!cancelled) setPhotosLoading(false);
      }
    };
    void refresh();
    const unsub = subscribeMapPhotos(() => {
      void refresh();
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const html = useMemo(
    () =>
      buildCheckInMapHtml(checkedPrefectureIds, {
        provincePhotos,
      }),
    [checkedPrefectureIds, provincePhotos],
  );

  const busy = loading || photosLoading;

  return (
    <Pressable style={styles.checkInMapCard} onPress={onPress}>
      <View style={styles.checkInMapBody}>
        {busy ? (
          <View style={styles.checkInMapLoading}>
            <ActivityIndicator color="#9B8EC4" />
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
      <Text style={styles.checkInMapHint}>点开地图 · 再点省份，从相册选一张照片填色</Text>
    </Pressable>
  );
}
