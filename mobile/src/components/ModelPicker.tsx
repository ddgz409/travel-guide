/** AI 模型选择器（两级弹窗：供应商 → 模型）—— 复用自 AI 旅行助手，Chat / 专属定制共用 */

import React, { useCallback, useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { colors } from "../theme";
import {
  getAvailableModels,
  loadLocalLlm,
  saveLocalLlm,
} from "../utils/llmStore";

export type PickedModel = {
  provider: string;
  model: string;
  label: string;
  apiKey?: string;
  baseUrl?: string;
};

type ModelGroup = {
  provider: string;
  providerLabel: string;
  badge?: string;
  apiKey?: string;
  baseUrl?: string;
  models: Array<{ model: string; label: string }>;
};

const DEFAULT_MODEL: PickedModel = {
  provider: "zhipu",
  model: "glm-4-flash-250414",
  label: "GLM-4-Flash",
};

/** 返回当前模型、打开弹窗的方法，以及弹窗 JSX（直接渲染到页面即可） */
export function useModelPicker() {
  const navigation = useNavigation();
  const [curModel, setCurModel] = useState<PickedModel>(DEFAULT_MODEL);
  const [modelOpen, setModelOpen] = useState(false);
  const [modelLevel, setModelLevel] = useState<1 | 2>(1);
  const [selectedGroupIdx, setSelectedGroupIdx] = useState(0);
  const [modelGroups, setModelGroups] = useState<ModelGroup[]>([]);

  // 启动时读取「设置 → 管理模型」里保存的模型，让设置里的切换真正生效
  useEffect(() => {
    void (async () => {
      const local = await loadLocalLlm();
      if (!local.apiKey.trim()) return;
      setCurModel({
        provider: local.provider,
        model: local.model,
        label: local.model,
        apiKey: local.apiKey,
        baseUrl: local.baseUrl,
      });
    })();
  }, []);

  const openModelPopup = useCallback(() => {
    // 每次打开刷新列表
    void getAvailableModels().then((g) => {
      setModelGroups(g);
      setModelLevel(1);
      setModelOpen(true);
    });
  }, []);

  const pickModel = useCallback(
    (group: ModelGroup, m: { model: string; label: string }) => {
      const next: PickedModel = {
        provider: group.provider,
        model: m.model,
        label: m.label,
        apiKey: group.apiKey,
        baseUrl: group.baseUrl,
      };
      setCurModel(next);
      setModelOpen(false);
      // 带 Key 的选择持久化，管理模型页与各处选择器状态一致
      if (group.apiKey?.trim()) {
        void saveLocalLlm({
          provider: group.provider,
          model: m.model,
          apiKey: group.apiKey.trim(),
          baseUrl: group.baseUrl?.trim() || "",
        });
      }
    },
    [],
  );

  const modelModal = (
    <Modal
      visible={modelOpen}
      transparent
      animationType="fade"
      onRequestClose={() => setModelOpen(false)}
    >
      <Pressable style={styles.overlay} onPress={() => setModelOpen(false)}>
        <View style={styles.panel}>
          {modelLevel === 1 ? (
            <>
              <Text style={styles.panelTitle}>选择供应商</Text>
              {modelGroups.map((g, i) => {
                const currentIsInGroup = curModel.provider === g.provider;
                return (
                  <Pressable
                    key={g.provider}
                    style={[styles.card, currentIsInGroup && styles.cardOn]}
                    onPress={() => {
                      setSelectedGroupIdx(i);
                      setModelLevel(2);
                    }}
                  >
                    <View style={styles.cardRow}>
                      {currentIsInGroup && (
                        <View style={[styles.dot, styles.dotOn]} />
                      )}
                      <Text style={styles.cardText}>{g.providerLabel}</Text>
                      {g.badge ? <Text style={styles.badge}>{g.badge}</Text> : null}
                      <Text style={styles.arrow}>›</Text>
                    </View>
                  </Pressable>
                );
              })}
            </>
          ) : (
            <>
              <View style={styles.level2Head}>
                <Pressable
                  onPress={() => setModelLevel(1)}
                  style={styles.backBtn}
                >
                  <Text style={styles.backText}>‹ 返回</Text>
                </Pressable>
                <Text style={styles.panelTitle}>
                  {modelGroups[selectedGroupIdx]?.providerLabel}
                </Text>
              </View>
              {modelGroups[selectedGroupIdx]?.models.map((m) => {
                const active =
                  curModel.model === m.model &&
                  curModel.provider ===
                    modelGroups[selectedGroupIdx].provider;
                return (
                  <Pressable
                    key={m.model}
                    style={[styles.card, active && styles.cardOn]}
                    onPress={() => pickModel(modelGroups[selectedGroupIdx], m)}
                  >
                    <View style={styles.cardRow}>
                      <View style={[styles.dot, active && styles.dotOn]} />
                      <Text style={styles.cardText}>{m.label}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </>
          )}
          <Pressable
            style={styles.manage}
            onPress={() => {
              setModelOpen(false);
              (navigation as any).navigate("ModelManage");
            }}
          >
            <Text style={styles.manageText}>管理模型 →</Text>
          </Pressable>
          <Pressable
            style={styles.closeBtn}
            onPress={() => setModelOpen(false)}
          >
            <Text style={styles.closeText}>关闭</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );

  return { curModel, openModelPopup, modelModal };
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.15)",
    justifyContent: "flex-end",
  },
  panel: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 30, borderCurve: "continuous",
    borderTopRightRadius: 30, borderCurve: "continuous",
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 30,
  },
  panelTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.ink,
    marginBottom: 14,
    textAlign: "center",
  },
  card: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 22, borderCurve: "continuous",
    marginBottom: 6,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  cardOn: {
    borderColor: colors.brand,
    backgroundColor: colors.brandSoft,
  },
  cardRow: { flexDirection: "row", alignItems: "center" },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 14, borderCurve: "continuous",
    backgroundColor: colors.line,
    marginRight: 10,
  },
  dotOn: { backgroundColor: colors.brand },
  cardText: { fontSize: 14, fontWeight: "600", color: colors.ink, flex: 1 },
  badge: {
    fontSize: 10,
    color: colors.muted,
    fontWeight: "600",
    backgroundColor: colors.bg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 18, borderCurve: "continuous",
    overflow: "hidden",
  },
  manage: {
    marginTop: 10,
    paddingVertical: 12,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  manageText: { fontSize: 14, fontWeight: "600", color: colors.brand },
  closeBtn: {
    marginTop: 4,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 22, borderCurve: "continuous",
    backgroundColor: colors.bg,
  },
  closeText: { fontSize: 14, color: colors.muted },
  arrow: { fontSize: 18, color: colors.muted, marginLeft: 6 },
  level2Head: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  backBtn: {
    paddingRight: 12,
    paddingVertical: 2,
  },
  backText: {
    fontSize: 15,
    color: colors.brand,
    fontWeight: "600",
  },
});
