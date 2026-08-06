import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  type ImageStyle,
  type StyleProp,
  View,
} from "react-native";
import { colors } from "../theme";
import {
  fetchPlaceImage,
  fetchPlaceImages,
  type PlaceCategory,
} from "../utils/placeImage";

type ProvidedImages = { image?: string; images?: string[] };

type PlaceImageProps = {
  city: string;
  name: string;
  category?: PlaceCategory;
  image?: string;
  images?: string[];
  style?: StyleProp<ImageStyle>;
  resizeMode?: "cover" | "contain" | "stretch" | "center";
};

export function PlaceImage({
  city,
  name,
  category,
  image,
  images,
  style,
  resizeMode = "cover",
}: PlaceImageProps) {
  const [uri, setUri] = useState<string | null>(image || images?.[0] || null);
  const [loading, setLoading] = useState(!image && !images?.[0]);

  useEffect(() => {
    if (image || images?.[0]) {
      setUri(image || images![0]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void fetchPlaceImage(city, name, category).then((url) => {
      if (cancelled) return;
      setUri(url);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [city, name, category, image, images]);

  if (loading && !uri) {
    return (
      <View
        style={[
          style,
          {
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.brandSoft,
          },
        ]}
      >
        <ActivityIndicator color={colors.brand} size="small" />
      </View>
    );
  }

  if (!uri) {
    return (
      <View
        style={[
          style,
          {
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.brandSoft,
          },
        ]}
      />
    );
  }

  return (
    <Image source={{ uri }} style={style} resizeMode={resizeMode} />
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
      setUris(preset);
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
        <Image
          key={`${uri}-${i}`}
          source={{ uri }}
          style={[itemStyle, { width: itemWidth }]}
          resizeMode="cover"
        />
      ))}
    </>
  );
}
