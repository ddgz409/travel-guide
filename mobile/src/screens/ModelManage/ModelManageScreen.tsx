import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
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
  saveLocalLlm,
  loadLocalLlm,
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

    setSaving(true);
    try {
      const provider: CustomProvider = {
        name: trimmedName,
        provider: trimmedName.toLowerCase().replace(/\s+/g, "-"),
        baseUrl: trimmedBaseUrl,
        apiKey: trimmedApiKey,
        model: trimmedModel || "default",
      };
      await saveCustomProvider(provider);
      await saveLocalLlm({
        provider: provider.provider,
        model: provider.model,
        apiKey: provider.apiKey,
        baseUrl: provider.baseUrl,
      });
      Alert.alert("已保存");
      navigation.goBack();
    } catch {
      Alert.alert("错误", "保存失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  const handleRestoreDefault = async () => {
    await saveLocalLlm(DEFAULT_LOCAL_LLM);
    await refresh();
  };

  const isDefaultActive =
    currentLlm.provider === DEFAULT_LOCAL_LLM.provider &&
    currentLlm.model === DEFAULT_LOCAL_LLM.model;

  return (
    <View style={[styles.root, { paddingTop: Math.max(insets.top, 10) }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
        >
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
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <View
              style={[
                styles.cardDot,
                { backgroundColor: colors.brand },
              ]}
            />
            <View>
              <Text style={styles.cardTitle}>
                {currentLlm.provider} {"\u00B7"} {currentLlm.model}
              </Text>
              <Text style={styles.cardSub}>
                {currentLlm.apiKey
                  ? "已配置 API Key"
                  : "使用服务器默认"}
              </Text>
            </View>
          </View>
        </View>

        {/* 默认模型 */}
        <Pressable
          style={[
            styles.card,
            isDefaultActive && { borderColor: colors.brand },
          ]}
          onPress={handleRestoreDefault}
        >
          <View style={styles.cardRow}>
            <View
              style={[
                styles.cardDot,
                isDefaultActive
                  ? { backgroundColor: colors.brand }
                  : { backgroundColor: colors.muted },
              ]}
            />
            <View>
              <Text style={styles.cardTitle}>
                智谱 GLM {"\u00B7"} glm-4
              </Text>
              <Text style={styles.cardSub}>服务器默认模型</Text>
            </View>
          </View>
        </Pressable>

        {/* 已保存的自定义供应商 */}
        {customProviders.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>已保存的供应商</Text>
            {customProviders.map((p) => {
              const isActive =
                currentLlm.provider === p.provider &&
                currentLlm.model === p.model;
              return (
                <View key={p.provider} style={styles.card}>
                  <View style={styles.cardRow}>
                    <View
                      style={[
                        styles.cardDot,
                        isActive
                          ? { backgroundColor: colors.brand }
                          : { backgroundColor: colors.muted },
                      ]}
                    />
                    <View>
                      <Text style={styles.cardTitle}>
                        {p.name} {"\u00B7"} {p.model}
                      </Text>
                      <Text style={styles.cardSub}>
                        {p.baseUrl}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
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
        <TextInput
          style={styles.input}
          value={apiKey}
          onChangeText={setApiKey}
          placeholder="输入 API Key"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />

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
            {saving ? "保存中..." : "保存"}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
