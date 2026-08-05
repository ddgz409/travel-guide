/** + 按钮弹出菜单：快速模式 / AI 专属定制 */

import React from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { colors } from "../theme";

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function PlusMenu({ visible, onClose }: Props) {
  const navigation = useNavigation();

  function go(mode: "quick" | "custom") {
    onClose();
    if (mode === "custom") {
      (navigation as any).navigate("Generate", { mode: "custom" });
    } else {
      (navigation as any).navigate("Generate", { mode: "quick" });
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.2)",
          justifyContent: "flex-end",
        }}
        onPress={onClose}
      >
        <View
          style={{
            backgroundColor: "#fff",
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingHorizontal: 20,
            paddingTop: 20,
            paddingBottom: 36,
          }}
        >
          <View
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: colors.line,
              alignSelf: "center",
              marginBottom: 18,
            }}
          />
          <Pressable
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: 16,
              borderBottomWidth: 1,
              borderBottomColor: colors.line,
            }}
            onPress={() => go("custom")}
          >
            <Text style={{ fontSize: 24, marginRight: 14 }}>🤖</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.ink }}>
                AI 智能生成行程
              </Text>
              <Text style={{ fontSize: 13, color: colors.muted, marginTop: 2 }}>
                AI 生成每日行程与路线
              </Text>
            </View>
            <Text style={{ fontSize: 18, color: colors.muted }}>›</Text>
          </Pressable>

          <Pressable
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: 16,
            }}
            onPress={() => go("quick")}
          >
            <Text style={{ fontSize: 24, marginRight: 14 }}>⚡</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.ink }}>
                快速模式
              </Text>
              <Text style={{ fontSize: 13, color: colors.muted, marginTop: 2 }}>
                秒出小红书 / 携程参考链接
              </Text>
            </View>
            <Text style={{ fontSize: 18, color: colors.muted }}>›</Text>
          </Pressable>

          <Pressable
            style={{
              marginTop: 8,
              paddingVertical: 14,
              alignItems: "center",
              borderRadius: 14,
              backgroundColor: colors.bg,
            }}
            onPress={onClose}
          >
            <Text style={{ fontSize: 15, color: colors.muted }}>取消</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}
