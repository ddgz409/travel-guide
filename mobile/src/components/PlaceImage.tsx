import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  type ImageSourcePropType,
  type ImageStyle,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  View,
  type ViewStyle,
} from "react-native";
import { saveRemoteImageToLibrary } from "../utils/saveImage";
import { colors } from "../theme";
import {
  fetchPlaceImage,
  fetchPlaceImages,
  resolveImageUrl,
  type PlaceCategory,
} from "../utils/placeImage";

type ProvidedImages = { image?: string; images?: string[] };

type PlaceImageProps = {
  city: string;
  name: string;
  category?: PlaceCategory;
  image?: string;
  images?: string[];
  poiId?: string;
  style?: StyleProp<ImageStyle>;
  resizeMode?: "cover" | "contain" | "stretch" | "center";
  fallbackSource?: ImageSourcePropType;
  fallback?: React.ReactNode;
};

function RemoteImage({
  uri,
  style,
  resizeMode,
  fallbackSource,
}: {
  uri: string;
  style?: StyleProp<ImageStyle>;
  resizeMode: PlaceImageProps["resizeMode"];
  fallbackSource?: ImageSourcePropType;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    if (fallbackSource) {
      return <Image source={fallbackSource} style={style} resizeMode={resizeMode} />;
    }
    return (
      <View
        style={[
          style,
          { alignItems: "center", justifyContent: "center", backgroundColor: colors.brandSoft },
        ]}
      />
    );
  }
  return (
    <Image
      source={{ uri }}
      style={style}
      resizeMode={resizeMode}
      onError={() => setFailed(true)}
    />
  );
}

export function PlaceImage({
  city,
  name,
  category,
  image,
  images,
  style,
  poiId,
  resizeMode = "cover",
  fallbackSource,
  fallback,
}: PlaceImageProps) {
  const preset = image || images?.[0] || null;
  const [uri, setUri] = useState<string | null>(preset);
  const [loading, setLoading] = useState(!preset);

  useEffect(() => {
    if (image || images?.[0]) {
      setUri(resolveImageUrl(image || images![0]));
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void fetchPlaceImage(city, name, category, undefined, poiId).then((url) => {
      if (cancelled) return;
      setUri(url);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [city, name, category, image, images, poiId]);

  const placeholder = fallbackSource ? (
    <Image source={fallbackSource} style={style} resizeMode={resizeMode} />
  ) : fallback ? (
    fallback
  ) : (
    <View
      style={[
        style as StyleProp<ViewStyle>,
        {
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.brandSoft,
        },
      ]}
    >
      {loading ? <ActivityIndicator color={colors.brand} size="small" /> : null}
    </View>
  );

  if (loading && !uri) return placeholder;
  if (!uri) return placeholder;

  return (
    <RemoteImage
      uri={uri}
      style={style}
      resizeMode={resizeMode}
      fallbackSource={fallbackSource}
    />
  );
}

/** 探索页热门城市卡片：全部走后端 API 拉取高德实景图，不再用本地 AI 图 */
export function CityCoverImage({
  city,
  landmark,
  uri: presetUri,
  style,
  resizeMode = "cover",
}: {
  city: string;
  landmark: string;
  uri?: string | null;
  style?: StyleProp<ImageStyle>;
  resizeMode?: PlaceImageProps["resizeMode"];
}) {
  const [uri, setUri] = useState<string | null>(presetUri ?? null);
  const [loading, setLoading] = useState(!presetUri);

  useEffect(() => {
    if (presetUri) {
      setUri(presetUri);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetchPlaceImage(city, landmark, "spots").then((url) => {
      if (cancelled) return;
      setUri(url);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [city, landmark, presetUri]);

  return (
    <View style={style}>
      {uri ? (
        <RemoteImage
          uri={uri}
          style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }}
          resizeMode={resizeMode}
          fallbackSource={undefined}
        />
      ) : loading ? (
        <View
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(255,255,255,0.2)",
          }}
        >
          <ActivityIndicator color={colors.brand} size="small" />
        </View>
      ) : (
        <View
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            backgroundColor: colors.brandSoft,
          }}
        />
      )}
    </View>
  );
}

type PlaceGalleryProps = {
  city: string;
  name: string;
  category?: PlaceCategory;
  image?: string;
  images?: string[];
  itemWidth: number;
  itemStyle?: StyleProp<ImageStyle>;
  count?: number;
  /** 每张图右下角显示「保存」按钮 */
  saveable?: boolean;
};

function SaveImageButton({ uri }: { uri: string }) {
  const [busy, setBusy] = useState(false);
  const onSave = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await saveRemoteImageToLibrary(uri);
      Alert.alert("已保存", "图片已保存到相册");
    } catch (e) {
      Alert.alert("保存失败", e instanceof Error ? e.message : "请稍后重试");
    } finally {
      setBusy(false);
    }
  }, [uri, busy]);

  return (
    <Pressable
      style={[galleryStyles.saveBtn, busy && galleryStyles.saveBtnDisabled]}
      onPress={() => void onSave()}
      disabled={busy}
      hitSlop={6}
    >
      <Text style={galleryStyles.saveBtnText}>{busy ? "…" : "保存"}</Text>
    </Pressable>
  );
}

export function PlaceGallery({
  city,
  name,
  category,
  image,
  images,
  itemWidth,
  itemStyle,
  count = 3,
  saveable = false,
}: PlaceGalleryProps) {
  const initial = images?.length
    ? images.slice(0, count)
    : image
      ? [image]
      : [];
  const [uris, setUris] = useState<string[]>(initial);
  const [loading, setLoading] = useState(initial.length === 0);

  useEffect(() => {
    const preset = images?.length
      ? images.slice(0, count)
      : image
        ? [image]
        : [];
    if (preset.length >= count) {
      setUris(preset.map(resolveImageUrl));
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const provided: ProvidedImages = { image, images };
    void fetchPlaceImages(city, name, count, category, provided).then((urls) => {
      if (cancelled) return;
      setUris(urls);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [city, name, category, count, image, images]);

  if (loading && uris.length === 0) {
    return (
      <>
        {Array.from({ length: count }, (_, i) => (
          <View
            key={`loading-${i}`}
            style={[
              itemStyle,
              {
                width: itemWidth,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.brandSoft,
              },
            ]}
          >
            <ActivityIndicator color={colors.brand} size="small" />
          </View>
        ))}
      </>
    );
  }

  if (uris.length === 0) {
    return (
      <View
        style={[
          itemStyle,
          {
            width: itemWidth,
            backgroundColor: colors.brandSoft,
          },
        ]}
      />
    );
  }

  return (
    <>
      {uris.map((uri, i) => (
        <View
          key={`${uri}-${i}`}
          style={[galleryStyles.itemWrap, { width: itemWidth }]}
        >
          <RemoteImage
            uri={uri}
            style={[itemStyle, { width: itemWidth }]}
            resizeMode="cover"
          />
          {saveable ? <SaveImageButton uri={uri} /> : null}
        </View>
      ))}
    </>
  );
}

const galleryStyles = StyleSheet.create({
  itemWrap: { position: "relative" },
  saveBtn: {
    position: "absolute",
    right: 8,
    bottom: 8,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 14,
    borderCurve: "continuous",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
});
