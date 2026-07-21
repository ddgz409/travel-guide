import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { LlmSettings } from "@travel-guide/shared";
import { ApiError } from "@travel-guide/shared";
import * as Location from "expo-location";
import { api } from "../api";
import {
  currentVersionCode,
  currentVersionName,
  promptCheckUpdate,
} from "../appUpdate";
import { useAuth } from "../auth/AuthContext";
import {
  LOCAL_MODELS,
  LOCAL_PROVIDERS,
  loadLocalLlm,
  saveLocalLlm,
  type LocalLlmConfig,
} from "../llmStore";
import {
  loadLocationConsent,
  saveLocationConsent,
  type LocationConsent,
} from "../locationPrefs";
import { colors } from "../theme";
import type { AppStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<AppStackParamList, "Settings">;

export function SettingsScreen({ navigation }: Props) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<LlmSettings | null>(null);
  const [provider, setProvider] = useState("zhipu");
  const [model, setModel] = useState("glm-4");
  const [baseUrl, setBaseUrl] = useState("");
  const [customProvider, setCustomProvider] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [hasSavedKey, setHasSavedKey] = useState(false);
  const [keyHint, setKeyHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [locationConsent, setLocationConsent] =
    useState<LocationConsent>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const consent = await loadLocationConsent();
        if (!cancelled) setLocationConsent(consent);
        if (user) {
          const data = await api.auth.getLlmSettings();
          if (cancelled) return;
          setSettings(data);
          const p = data.provider || "zhipu";
          const known = (data.available_providers || []).some((x) => x.id === p);
          setProvider(p);
          setModel(data.model || "glm-4");
          setBaseUrl(data.base_url || "");
          setCustomProvider(!known);
          setHasSavedKey(data.has_api_key);
          setKeyHint(data.api_key_hint || null);
        } else {
          const local = await loadLocalLlm();
          if (cancelled) return;
          const known = LOCAL_PROVIDERS.some((x) => x.id === local.provider);
          setProvider(local.provider);
          setModel(local.model);
          setBaseUrl(local.baseUrl || "");
          setCustomProvider(!known);
          setHasSavedKey(Boolean(local.apiKey));
          setKeyHint(local.apiKey ? `****${local.apiKey.slice(-4)}` : null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "加载失败");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function setLocationEnabled(enabled: boolean) {
    if (enabled) {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("系统未授权", "请在系统设置中允许定位权限。");
        await saveLocationConsent("denied");
        setLocationConsent("denied");
        return;
      }
      await saveLocationConsent("granted");
      setLocationConsent("granted");
      setOk("已开启定位，可在全屏地图中点「定位」显示当前位置。");
    } else {
      await saveLocationConsent("denied");
      setLocationConsent("denied");
      setOk("已关闭定位。");
    }
  }
  const providers = useMemo(() => {
    if (settings?.available_providers?.length) return settings.available_providers;
    return LOCAL_PROVIDERS;
  }, [settings]);

  const presetModels = useMemo(() => {
    return (
      settings?.suggested_models?.[provider] ||
      LOCAL_MODELS[provider] ||
      ["glm-4"]
    );
  }, [settings, provider]);

  const isCustomModel = Boolean(model) && !presetModels.includes(model);

  async function onSave() {
    const modelName = model.trim();
    const providerId = provider.trim().toLowerCase();
    const bu = baseUrl.trim().replace(/\/+$/, "");
    if (!providerId) {
      setError("请选择提供商，或输入自定义提供商 ID");
      return;
    }
    if (customProvider && !bu) {
      setError("自定义提供商需填写 Base URL");
      return;
    }
    if (!modelName) {
      setError("请选择或输入模型名称");
      return;
    }
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      if (user) {
        const payload: {
          provider: string;
          model: string;
          base_url: string;
          api_key?: string;
        } = {
          provider: providerId,
          model: modelName,
          base_url: customProvider ? bu : "",
        };
        if (clearKey) payload.api_key = "";
        else if (apiKey.trim()) payload.api_key = apiKey.trim();
        const data = await api.auth.updateLlmSettings(payload);
        setSettings(data);
        setHasSavedKey(data.has_api_key);
        setKeyHint(data.api_key_hint || null);
        setBaseUrl(data.base_url || "");
        setApiKey("");
        setClearKey(false);
        setOk("已保存到账号。之后生成将使用你的 LLM API。");
      } else {
        const prev = await loadLocalLlm();
        let nextKey = prev.apiKey;
        if (clearKey) nextKey = "";
        else if (apiKey.trim()) nextKey = apiKey.trim();
        const next: LocalLlmConfig = {
          provider: providerId,
          model: modelName,
          apiKey: nextKey,
          baseUrl: customProvider ? bu : "",
        };
        await saveLocalLlm(next);
        setHasSavedKey(Boolean(next.apiKey));
        setKeyHint(next.apiKey ? `****${next.apiKey.slice(-4)}` : null);
        setApiKey("");
        setClearKey(false);
        setOk(
          next.apiKey
            ? "已保存到本机。游客生成时会带上你的 LLM API Key。"
            : "已清除本机 Key，将使用服务器默认模型。",
        );
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>设置</Text>

      <View style={styles.locCard}>
        <Text style={styles.locTitle}>地图定位</Text>
        <Text style={styles.locSub}>
          开启后，可在全屏地图中显示你的当前位置。首次使用会弹窗询问。
        </Text>
        <View style={styles.locRow}>
          <Text style={styles.locStatus}>
            {locationConsent === "granted"
              ? "已允许"
              : locationConsent === "denied"
                ? "已关闭"
                : "尚未设置"}
          </Text>
          <Pressable
            style={[
              styles.locBtn,
              locationConsent === "granted" && styles.locBtnOff,
            ]}
            onPress={() =>
              void setLocationEnabled(locationConsent !== "granted")
            }
          >
            <Text
              style={[
                styles.locBtnText,
                locationConsent === "granted" && styles.locBtnTextOff,
              ]}
            >
              {locationConsent === "granted" ? "关闭定位" : "开启定位"}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.locCard}>
        <Text style={styles.locTitle}>应用更新</Text>
        <Text style={styles.locSub}>
          当前版本 {currentVersionName()}（{currentVersionCode() || "—"}
          ）。有新版本时可下载安装包更新。
        </Text>
        <View style={styles.locRow}>
          <Text style={styles.locStatus}>检查服务器版本</Text>
          <Pressable
            style={[styles.locBtn, checkingUpdate && { opacity: 0.7 }]}
            disabled={checkingUpdate}
            onPress={() => {
              setCheckingUpdate(true);
              void promptCheckUpdate().finally(() => setCheckingUpdate(false));
            }}
          >
            {checkingUpdate ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.locBtnText}>检查更新</Text>
            )}
          </Pressable>
        </View>
      </View>

      <Text style={styles.title}>LLM / 模型设置</Text>
      <Text style={styles.sub}>
        {user
          ? "填写你自己的 API Key，生成攻略时优先用你的额度。"
          : "未登录也可先填 Key（保存在本机）。登录后可同步到账号。"}
      </Text>

      {!user ? (
        <Pressable
          style={styles.loginBanner}
          onPress={() => navigation.navigate("Login")}
        >
          <Text style={styles.loginBannerText}>
            去登录，把 Key 存到账号（跨设备） →
          </Text>
        </Pressable>
      ) : null}

      <Text style={styles.label}>提供商</Text>
      <View style={styles.chips}>
        {providers.map((p) => {
          const on = !customProvider && provider === p.id;
          return (
            <Pressable
              key={p.id}
              style={[styles.chip, on && styles.chipOn]}
              onPress={() => {
                setCustomProvider(false);
                setProvider(p.id);
                setBaseUrl("");
                const first =
                  settings?.suggested_models?.[p.id]?.[0] ||
                  LOCAL_MODELS[p.id]?.[0];
                if (first) setModel(first);
              }}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>
                {p.label || p.id}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          style={[styles.chip, customProvider && styles.chipOn]}
          onPress={() => {
            setCustomProvider(true);
            if (!customProvider) {
              setProvider("");
              setModel("");
            }
          }}
        >
          <Text style={[styles.chipText, customProvider && styles.chipTextOn]}>
            自定义
          </Text>
        </Pressable>
      </View>
      {customProvider ? (
        <>
          <TextInput
            style={[styles.input, { marginTop: 10 }]}
            value={provider}
            onChangeText={setProvider}
            placeholder="提供商 ID，如 moonshot / qwen"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={[styles.input, { marginTop: 10 }]}
            value={baseUrl}
            onChangeText={setBaseUrl}
            placeholder="Base URL，如 https://api.moonshot.cn/v1"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.hint}>
            需为 OpenAI 兼容的 Chat Completions 接口地址
          </Text>
        </>
      ) : null}

      <Text style={styles.label}>模型</Text>
      <View style={styles.chips}>
        {presetModels.map((m) => {
          const on = model === m;
          return (
            <Pressable
              key={m}
              style={[styles.chip, on && styles.chipOn]}
              onPress={() => setModel(m)}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{m}</Text>
            </Pressable>
          );
        })}
        <Pressable
          style={[styles.chip, isCustomModel && styles.chipOn]}
          onPress={() => {
            if (!isCustomModel) setModel("");
          }}
        >
          <Text style={[styles.chipText, isCustomModel && styles.chipTextOn]}>
            自定义
          </Text>
        </Pressable>
      </View>
      <TextInput
        style={[styles.input, { marginTop: 10 }]}
        value={model}
        onChangeText={setModel}
        placeholder="自定义模型名，如 glm-4.5 / deepseek-reasoner"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Text style={styles.hint}>
        可点选上方预设，或直接输入提供商文档中的模型 ID
      </Text>

      <Text style={styles.label}>API Key</Text>
      <TextInput
        style={styles.input}
        value={apiKey}
        onChangeText={(t) => {
          setApiKey(t);
          setClearKey(false);
        }}
        placeholder={
          hasSavedKey
            ? `已保存 ${keyHint || "****"}，留空则不改`
            : "粘贴智谱 / DeepSeek 等 API Key"
        }
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
      />
      {hasSavedKey ? (
        <Pressable
          onPress={() => {
            setClearKey(true);
            setApiKey("");
          }}
        >
          <Text style={styles.clear}>
            {clearKey ? "将清除 Key，改用服务器默认" : "清除已保存 Key"}
          </Text>
        </Pressable>
      ) : null}

      {user && settings?.using_server_default && !hasSavedKey ? (
        <Text style={styles.hint}>当前使用服务器默认配置</Text>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {ok ? <Text style={styles.ok}>{ok}</Text> : null}

      <Pressable
        style={[styles.btn, saving && { opacity: 0.7 }]}
        onPress={onSave}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.btnText}>保存 LLM 设置</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 24, fontWeight: "800", color: colors.ink },
  sub: { marginTop: 8, fontSize: 14, color: colors.muted, lineHeight: 20 },
  locCard: {
    marginTop: 16,
    marginBottom: 8,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
  },
  locTitle: { fontSize: 16, fontWeight: "700", color: colors.ink },
  locSub: {
    marginTop: 6,
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
  },
  locRow: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  locStatus: { fontSize: 14, color: colors.ink, fontWeight: "600" },
  locBtn: {
    backgroundColor: colors.brand,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  locBtnOff: { backgroundColor: colors.brandSoft },
  locBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  locBtnTextOff: { color: colors.brandHot },
  loginBanner: {
    marginTop: 14,
    backgroundColor: colors.brandSoft,
    borderRadius: 12,
    padding: 12,
  },
  loginBannerText: { color: colors.brandHot, fontWeight: "600", fontSize: 13 },
  label: { marginTop: 18, marginBottom: 8, fontSize: 13, color: colors.muted },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipOn: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  chipText: { fontSize: 14, color: colors.muted },
  chipTextOn: { color: colors.brandHot, fontWeight: "600" },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.ink,
  },
  clear: { marginTop: 8, color: colors.brand, fontSize: 13 },
  hint: { marginTop: 8, fontSize: 12, color: colors.muted },
  error: { marginTop: 12, color: colors.danger },
  ok: { marginTop: 12, color: colors.ready },
  btn: {
    marginTop: 24,
    backgroundColor: colors.brand,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
