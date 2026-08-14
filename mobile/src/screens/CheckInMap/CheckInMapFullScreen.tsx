import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { WebView } from "react-native-webview";
import type { WebViewMessageEvent } from "react-native-webview";
import type { AppStackParamList } from "../../navigation/types";
import {
  buildCheckInMapHtml,
  type ProvincePhotoData,
} from "../../utils/checkInMapHtml";
import { getCheckedPrefectureIds } from "../../utils/checkInStore";
import {
  setProvincePhoto,
  buildProvincePhotoDataUris,
  clearProvincePhotos,
  getAllProvincePhotos,
  subscribeMapPhotos,
} from "../../utils/mapPhotoStore";
import { PROVINCE_LABELS } from "../../utils/provinceMap";
import { pickMapPhotoFromLibrary } from "../../utils/pickMapPhotos";
import { styles } from "./styles";

type Props = NativeStackScreenProps<AppStackParamList, "CheckInMapFull">;

export function CheckInMapFullScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [provincePhotos, setProvincePhotos] = useState<ProvincePhotoData>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ids, store] = await Promise.all([
        getCheckedPrefectureIds(),
        getAllProvincePhotos(),
      ]);
      setCheckedIds(ids);
      setProvincePhotos(await buildProvincePhotoDataUris(store));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    return subscribeMapPhotos(() => {
      void load();
    });
  }, [load]);

  const html = useMemo(
    () =>
      buildCheckInMapHtml(checkedIds, {
        interactive: true,
        provincePhotos,
      }),
    [checkedIds, provincePhotos],
  );

  const onProvinceAction = useCallback(
    (key: string, label: string) => {
      const hasPhoto = Boolean(provincePhotos[key]);
      Alert.alert(
        label || PROVINCE_LABELS[key] || key,
        hasPhoto ? "更换照片，或清空恢复紫色" : "选一张照片填满这个省",
        [
          {
            text: hasPhoto ? "更换照片" : "选择照片",
            onPress: () => {
              void (async () => {
                const uri = await pickMapPhotoFromLibrary();
                if (!uri) return;
                await setProvincePhoto(key, uri);
                await load();
              })();
            },
          },
          ...(hasPhoto
            ? [
                {
                  text: "清空照片",
                  style: "destructive" as const,
                  onPress: () => {
                    void (async () => {
                      await clearProvincePhotos(key);
                      await load();
                    })();
                  },
                },
              ]
            : []),
          { text: "取消", style: "cancel" },
        ],
      );
    },
    [load, provincePhotos],
  );

  const onWebMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data) as {
          type?: string;
          key?: string;
          label?: string;
        };
        if (data.type === "province" && data.key) {
          onProvinceAction(data.key, data.label || "");
        }
      } catch {
        /* ignore */
      }
    },
    [onProvinceAction],
  );

  return (
    <View style={styles.fullRoot}>
      <Pressable
        style={[styles.fullBack, { top: Math.max(insets.top, 10) + 4 }]}
        onPress={() => navigation.goBack()}
        hitSlop={12}
      >
        <Text style={styles.fullBackText}>‹</Text>
      </Pressable>
      <View style={styles.fullBody}>
        {loading ? (
          <View style={styles.fullLoading}>
            <ActivityIndicator color="#9B8EC4" size="large" />
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
            onMessage={onWebMessage}
          />
        )}
      </View>
      <Text style={[styles.fullHint, { bottom: Math.max(insets.bottom, 12) + 8 }]}>
        点省份 · 从相册选一张照片
      </Text>
    </View>
  );
}
