import React, { memo } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { colors, cardShadow } from "../theme";

type Props = {
  name: string;
  size?: number;
  /** card = 「我的」大头像；circle = 列表小头像 */
  variant?: "card" | "circle";
  imageUri?: string | null;
};

export function avatarInitial(name: string): string {
  const trimmed = (name || "").trim();
  if (!trimmed) return "游";
  return trimmed.slice(0, 1);
}

/** 头像：有自定义图则显示图片，否则昵称首字 */
export const UserAvatar = memo(function UserAvatar({
  name,
  size = 40,
  variant = "circle",
  imageUri,
}: Props) {
  const radius =
    variant === "circle" ? size / 2 : Math.max(12, Math.round(size * 0.32));
  const shellStyle = {
    width: size,
    height: size,
    borderRadius: radius,
  };

  if (imageUri) {
    return (
      <View
        style={[
          styles.avatar,
          variant === "circle" ? styles.avatarCircle : null,
          shellStyle,
        ]}
      >
        <Image
          source={{ uri: imageUri }}
          style={[styles.image, shellStyle]}
          accessibilityLabel={`${name}的头像`}
        />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.avatar,
        variant === "circle" ? styles.avatarCircle : null,
        shellStyle,
      ]}
    >
      <Text style={[styles.text, { fontSize: Math.round(size * 0.42) }]}>
        {avatarInitial(name)}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  avatar: {
    backgroundColor: "#fff",
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    ...cardShadow,
  },
  avatarCircle: {
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.04)",
  },
  image: {
    resizeMode: "cover",
  },
  text: {
    fontWeight: "800",
    color: colors.brandHot,
  },
});
