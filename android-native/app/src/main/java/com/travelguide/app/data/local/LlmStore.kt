package com.travelguide.app.data.local

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.travelguide.app.data.api.ApiClient
import com.travelguide.app.data.api.AppJson
import com.travelguide.app.data.api.LlmOverride
import com.travelguide.app.data.api.LlmSettingsUpdate
import kotlinx.coroutines.flow.first
import kotlinx.serialization.Serializable

/** 本地 LLM 配置（对齐 RN llmStore.ts：游客自带默认模型，自定义供应商存本地） */

@Serializable
data class LocalLlmConfig(
    val provider: String = "zhipu",
    val model: String = "glm-4-flash-250414",
    val apiKey: String = "",
    val baseUrl: String = "",
)

@Serializable
data class CustomProvider(
    val name: String,
    val provider: String,
    val baseUrl: String,
    val apiKey: String,
    val model: String,
)

/** 模型选择器当前选中项（对齐 RN PickedModel） */
data class PickedModel(
    val provider: String,
    val model: String,
    val label: String,
    val apiKey: String = "",
    val baseUrl: String = "",
) {
    companion object {
        val DEFAULT = PickedModel(
            provider = "zhipu",
            model = "glm-4-flash-250414",
            label = "GLM-4-Flash",
        )
    }
}

data class ModelOption(val model: String, val label: String)

data class ModelGroup(
    val provider: String,
    val providerLabel: String,
    val badge: String? = null,
    val apiKey: String = "",
    val baseUrl: String = "",
    val models: List<ModelOption>,
)

private val Context.llmDataStore by preferencesDataStore(name = "zhijing_llm_prefs")

object LlmStore {
    val DEFAULT = LocalLlmConfig()
    private val KEY_LLM = stringPreferencesKey("local_llm")
    private val KEY_PROVIDERS = stringPreferencesKey("custom_providers")

    @Volatile
    private var context: Context? = null

    fun init(appContext: Context) {
        context = appContext.applicationContext
    }

    suspend fun loadLocalLlm(): LocalLlmConfig {
        val raw = context?.llmDataStore?.data?.first()?.get(KEY_LLM) ?: return DEFAULT
        return runCatching { AppJson.decodeFromString<LocalLlmConfig>(raw) }.getOrDefault(DEFAULT)
    }

    suspend fun saveLocalLlm(cfg: LocalLlmConfig) {
        context?.llmDataStore?.edit { it[KEY_LLM] = AppJson.encodeToString(LocalLlmConfig.serializer(), cfg) }
    }

    suspend fun switchToDefault() = saveLocalLlm(DEFAULT)

    suspend fun switchToProvider(p: CustomProvider) = saveLocalLlm(
        LocalLlmConfig(provider = p.provider, model = p.model, apiKey = p.apiKey, baseUrl = p.baseUrl),
    )

    suspend fun loadCustomProviders(): List<CustomProvider> {
        val raw = context?.llmDataStore?.data?.first()?.get(KEY_PROVIDERS) ?: return emptyList()
        return runCatching { AppJson.decodeFromString<List<CustomProvider>>(raw) }.getOrDefault(emptyList())
    }

    private suspend fun saveCustomProviders(list: List<CustomProvider>) {
        context?.llmDataStore?.edit {
            it[KEY_PROVIDERS] = AppJson.encodeToString(kotlinx.serialization.builtins.ListSerializer(CustomProvider.serializer()), list)
        }
    }

    suspend fun saveCustomProvider(p: CustomProvider) {
        val list = loadCustomProviders().toMutableList()
        val idx = list.indexOfFirst { it.provider == p.provider }
        if (idx >= 0) list[idx] = p else list.add(p)
        saveCustomProviders(list)
    }

    suspend fun deleteCustomProvider(providerId: String) {
        saveCustomProviders(loadCustomProviders().filterNot { it.provider == providerId })
    }

    /** 生成请求用的 llm 覆盖（有 Key 才带上，对齐 RN localLlmOverride） */
    suspend fun localLlmOverride(): LlmOverride? {
        val cfg = loadLocalLlm()
        if (cfg.apiKey.isBlank()) return null
        return cfg.toLlmOverride()
    }

    /** AI 助手可选模型列表（按供应商分组，对齐 RN getAvailableModels） */
    suspend fun getAvailableModels(): List<ModelGroup> {
        val groups = mutableListOf(
            ModelGroup(
                provider = "zhipu",
                providerLabel = "智谱 GLM",
                badge = "服务器默认",
                models = listOf(
                    ModelOption("glm-4-flash-250414", "GLM-4-Flash-250414（免费·默认）"),
                    ModelOption("glm-4.7-flash", "GLM-4.7-Flash（免费）"),
                    ModelOption("glm-4-flash", "GLM-4-Flash（免费）"),
                ),
            ),
        )
        for (c in loadCustomProviders()) {
            val existing = groups.indexOfFirst { it.provider == c.provider }
            if (existing >= 0) {
                val g = groups[existing]
                val models = g.models.toMutableList()
                if (models.none { it.model == c.model }) {
                    models.add(ModelOption(c.model, c.model))
                }
                groups[existing] = g.copy(
                    apiKey = c.apiKey,
                    baseUrl = c.baseUrl,
                    models = models,
                )
            } else {
                groups.add(
                    ModelGroup(
                        provider = c.provider,
                        providerLabel = c.name,
                        badge = "自定义",
                        apiKey = c.apiKey,
                        baseUrl = c.baseUrl,
                        models = listOf(ModelOption(c.model, c.model)),
                    ),
                )
            }
        }
        return groups
    }

    /** 登录后从云端拉取 LLM 偏好（对齐 RN api.auth.getLlmSettings） */
    suspend fun syncFromCloudIfLoggedIn() {
        if (TokenStore.getSync() == null) return
        val remote = runCatching { ApiClient.auth.getLlmSettings() }.getOrNull() ?: return
        if (remote.usingServerDefault) {
            switchToDefault()
            return
        }
        if (remote.provider.isBlank() && remote.model.isBlank()) return
        val local = loadLocalLlm()
        saveLocalLlm(
            local.copy(
                provider = remote.provider.ifBlank { local.provider },
                model = remote.model.ifBlank { local.model },
                baseUrl = remote.baseUrl.orEmpty().ifBlank { local.baseUrl },
            ),
        )
    }

    /** 保存本地配置时同步到云端（已登录时） */
    suspend fun pushToCloudIfLoggedIn(cfg: LocalLlmConfig) {
        if (TokenStore.getSync() == null) return
        runCatching {
            ApiClient.auth.updateLlmSettings(
                LlmSettingsUpdate(
                    provider = cfg.provider,
                    model = cfg.model,
                    apiKey = if (cfg.apiKey.isBlank()) "" else cfg.apiKey,
                    baseUrl = if (cfg.baseUrl.isBlank()) "" else cfg.baseUrl,
                ),
            )
        }
    }
}

/** 转为 API 请求体：始终带 provider/model，Key 可选（对齐 RN Chat/Generate） */
fun LocalLlmConfig.toLlmOverride(): LlmOverride = LlmOverride(
    provider = provider,
    model = model,
    apiKey = apiKey.trim().takeIf { it.isNotBlank() },
    baseUrl = baseUrl.trim().takeIf { it.isNotBlank() },
)

fun PickedModel.toLlmOverride(): LlmOverride = LlmOverride(
    provider = provider,
    model = model,
    apiKey = apiKey.trim().takeIf { it.isNotBlank() },
    baseUrl = baseUrl.trim().takeIf { it.isNotBlank() },
)
