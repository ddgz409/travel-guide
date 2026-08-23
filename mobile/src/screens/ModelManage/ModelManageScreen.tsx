import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { colors } from "../../theme";
import type { AppStackParamList } from "../../navigation/types";
import {
  saveCustomProvider,
  loadCustomProviders,
  loadLocalLlm,
  switchToProvider,
  switchToDefault,
  deleteCustomProvider,
  DEFAULT_LOCAL_LLM,
  type CustomProvider,
  type LocalLlmConfig,
} from "../../utils/llmStore";
import { styles } from "./styles";

type Props = NativeStackScreenProps<AppStackParamList, "ModelManage">;

export function ModelManageScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();

  const [currentLlm, setCurrentLlm] = useState<LocalLlmConfig>(DEFAULT_LOCAL_LLM);
  const [customProviders, setCustomProviders] = useState<CustomProvider[]>([]);

  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);

  const refresh = useCallback(async () => {
    const [llm, providers] = await Promise.all([
      loadLocalLlm(),
      loadCustomProviders(),
    ]);
    setCurrentLlm(llm);
    setCustomProviders(providers);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleSave = async () => {
    const trimmedName = name.trim();
    const trimmedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
    const trimmedApiKey = apiKey.trim();
    const trimmedModel = model.trim();

    if (!trimmedName) {
      Alert.alert("提示", "请输入供应商名称");
      return;
    }
    if (!trimmedBaseUrl) {
      Alert.alert("提示", "请输入 Base URL");
      return;
    }
    if (!trimmedApiKey) {
      Alert.alert("提示", "请输入 API Key");
      return;
    }
    if (!trimmedModel) {
      Alert.alert("提示", "请输入模型名");
      return;
    }

    setSaving(true);
    try {
      const provider: CustomProvider = {
        name: trimmedName,
        provider: trimmedName.toLowerCase().replace(/\s+/g, "-"),
        baseUrl: trimmedBaseUrl,
        apiKey: trimmedApiKey,
        model: trimmedModel,
      };
      await saveCustomProvider(provider);
      await switchToProvider(provider);
      setName("");
      setBaseUrl("");
      setApiKey("");
      setModel("");
      await refresh();
      Alert.alert("已保存并切换", `当前使用：${provider.name}`);
    } catch {
      Alert.alert("错误", "保存失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  const handleSwitchToProvider = async (p: CustomProvider) => {
    await switchToProvider(p);
    await refresh();
  };

  const handleRestoreDefault = async () => {
    await switchToDefault();
    await refresh();
  };

  const handleDelete = (p: CustomProvider) => {
    Alert.alert(
      "删除供应商",
      `确定删除「${p.name}」？`,
      [
        { text: "取消", style: "cancel" },
        {
          text: "删除",
          style: "destructive",
          onPress: async () => {
            await deleteCustomProvider(p.provider);
            if (currentLlm.provider === p.provider) {
              await switchToDefault();
            }
            await refresh();
          },
        },
      ],
    );
  };

  const isDefaultActive =
    !currentLlm.apiKey ||
    (currentLlm.provider === DEFAULT_LOCAL_LLM.provider &&
     currentLlm.model === DEFAULT_LOCAL_LLM.model);

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: Math.max(insets.top, 10) }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>{"\u2039"} 返回</Text>
        </Pressable>
        <Text style={styles.headerTitle}>管理模型</Text>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={{ paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* 当前模型 */}
        <Text style={styles.sectionTitle}>当前模型</Text>
        <View style={[styles.card, styles.cardActive]}>
          <View style={styles.cardRow}>
            <View style={[styles.cardDot, styles.cardDotOn]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>
                {isDefaultActive ? "智谱 GLM · glm-4-flash" : `${currentLlm.provider} · ${currentLlm.model}`}
              </Text>
              <Text style={styles.cardSub}>
                {isDefaultActive ? "服务器默认模型" : "自定义供应商"}
              </Text>
            </View>
          </View>
        </View>

        {/* 默认模型 */}
        <Pressable
          style={[styles.card, isDefaultActive && styles.cardActive]}
          onPress={handleRestoreDefault}
        >
          <View style={styles.cardRow}>
            <View style={[styles.cardDot, isDefaultActive ? styles.cardDotOn : styles.cardDotOff]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>智谱 GLM · glm-4-flash</Text>
              <Text style={styles.cardSub}>服务器默认（无需 API Key）</Text>
            </View>
            {!isDefaultActive && <Text style={styles.switchBtn}>切换</Text>}
          </View>
        </Pressable>

        {/* 已保存的供应商 */}
        {customProviders.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>已保存的供应商</Text>
            {customProviders.map((p) => {
              const isActive =
                currentLlm.provider === p.provider &&
                currentLlm.model === p.model;
              return (
                <Pressable
                  key={p.provider}
                  style={[styles.card, isActive && styles.cardActive]}
                  onPress={() => handleSwitchToProvider(p)}
                  onLongPress={() => handleDelete(p)}
                >
                  <View style={styles.cardRow}>
                    <View style={[styles.cardDot, isActive ? styles.cardDotOn : styles.cardDotOff]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>{p.name} · {p.model}</Text>
                      <Text style={styles.cardSub} numberOfLines={1}>{p.baseUrl}</Text>
                    </View>
                    {isActive ? (
                      <Text style={styles.activeLabel}>当前</Text>
                    ) : (
                      <Text style={styles.switchBtn}>切换</Text>
                    )}
                  </View>
                </Pressable>
              );
            })}
            <Text style={styles.hint}>长按可删除供应商</Text>
          </>
        )}

        {/* 添加自定义供应商 */}
        <Text style={styles.sectionTitle}>添加自定义供应商</Text>

        <Text style={styles.label}>名称</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="如：智谱 GLM"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.label}>Base URL</Text>
        <TextInput
          style={styles.input}
          value={baseUrl}
          onChangeText={setBaseUrl}
          placeholder="https://api.example.com/v1"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.label}>API Key</Text>
        <View style={styles.keyRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={apiKey}
            onChangeText={setApiKey}
            placeholder="输入 API Key"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry={!showKey}
          />
          <Pressable style={styles.eyeBtn} onPress={() => setShowKey(!showKey)}>
            <Text style={styles.eyeBtnText}>{showKey ? "🙈" : "👁️"}</Text>
          </Pressable>
        </View>

        <Text style={styles.label}>模型名</Text>
        <TextInput
          style={styles.input}
          value={model}
          onChangeText={setModel}
          placeholder="如：glm-4"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Pressable
          style={[styles.btn, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.btnText}>
            {saving ? "保存中..." : "保存并切换"}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
