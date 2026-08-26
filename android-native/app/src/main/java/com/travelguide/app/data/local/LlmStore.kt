package com.travelguide.app.data.local

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.travelguide.app.data.api.AppJson
import com.travelguide.app.data.api.LlmOverride
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
        return LlmOverride(
            provider = cfg.provider,
            model = cfg.model,
            apiKey = cfg.apiKey.trim(),
            baseUrl = cfg.baseUrl.trim().takeIf { it.isNotBlank() },
        )
    }
}
