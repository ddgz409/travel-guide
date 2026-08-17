import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  type ImageSourcePropType,
  type ImageStyle,
  type StyleProp,
  View,
  type ViewStyle,
} from "react-native";
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

/** 探索页热门城市卡片：优先高德代表景点封面，失败回退本地图 */
export function CityCoverImage({
  city,
  landmark,
  fallback,
  uri: presetUri,
  style,
  resizeMode = "cover",
}: {
  city: string;
  landmark: string;
  fallback: ImageSourcePropType;
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
      <Image
        source={fallback}
        style={{ width: "100%", height: "100%" }}
        resizeMode={resizeMode}
      />
      {uri ? (
        <RemoteImage
          uri={uri}
          style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }}
          resizeMode={resizeMode}
          fallbackSource={fallback}
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
      ) : null}
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
};

export function PlaceGallery({
  city,
  name,
  category,
  image,
  images,
  itemWidth,
  itemStyle,
  count = 3,
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
        <RemoteImage
          key={`${uri}-${i}`}
          uri={uri}
          style={[itemStyle, { width: itemWidth }]}
          resizeMode="cover"
        />
      ))}
    </>
  );
}
