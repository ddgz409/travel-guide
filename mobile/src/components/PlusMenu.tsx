/** + 按钮弹出菜单：AI 生成攻略 / 手动创建行程 */

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

  function go(option: "ai" | "manual") {
    onClose();
    if (option === "ai") {
      (navigation as any).navigate("Generate", undefined);
    } else {
      (navigation as any).navigate("Generate", { destination: "" });
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
            onPress={() => go("ai")}
          >
            <Text style={{ fontSize: 24, marginRight: 14 }}>🤖</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.ink }}>
                AI 智能生成行程
              </Text>
              <Text style={{ fontSize: 13, color: colors.muted, marginTop: 2 }}>
                输入目的地，AI 自动规划每日行程
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
            onPress={() => go("manual")}
          >
            <Text style={{ fontSize: 24, marginRight: 14 }}>✏️</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.ink }}>
                手动自建行程
              </Text>
              <Text style={{ fontSize: 13, color: colors.muted, marginTop: 2 }}>
                自由编辑每一天的景点和安排
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
