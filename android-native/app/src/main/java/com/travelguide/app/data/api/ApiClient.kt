package com.travelguide.app.data.api

import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import com.travelguide.app.data.local.TokenStore
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import java.util.concurrent.TimeUnit

/** 全局 Json 配置：后端 snake_case 字段逐个用 @SerialName 显式映射，这里宽松解析 */
val AppJson: Json = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    coerceInputValues = true
}

/**
 * Retrofit 单例。base 与 RN 版 config.ts 一致：http://81.71.159.218:8000/api/v1
 * （Manifest 已开 usesCleartextTraffic）
 */
object ApiClient {
    private const val API_BASE = "http://81.71.159.218:8000/api/v1/"

    lateinit var auth: AuthApi
        private set
    lateinit var trips: TripApi
        private set
    lateinit var destinations: DestinationApi
        private set
    lateinit var chat: ChatApi
        private set
    lateinit var collections: CollectionApi
        private set

    fun init() {
        val logging = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BASIC
        }
        val authInterceptor = okhttp3.Interceptor { chain ->
            val original = chain.request()
            val token = TokenStore.getSync()
            val request = if (token != null && original.header("Authorization") == null) {
                original.newBuilder()
                    .header("Authorization", "Bearer $token")
                    .build()
            } else {
                original
            }
            chain.proceed(request)
        }

        val client = OkHttpClient.Builder()
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .addInterceptor(authInterceptor)
            .addInterceptor(logging)
            .build()

        // SSE 专用：读超时放宽到 100s 充当空闲看门狗（对齐 RN 75s 空闲断开策略）
        val chatClient = OkHttpClient.Builder()
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(100, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .addInterceptor(authInterceptor)
            .build()

        val contentType = "application/json".toMediaType()
        val retrofit = Retrofit.Builder()
            .baseUrl(API_BASE)
            .client(client)
            .addConverterFactory(AppJson.asConverterFactory(contentType))
            .build()

        auth = retrofit.create(AuthApi::class.java)
        trips = retrofit.create(TripApi::class.java)
        destinations = retrofit.create(DestinationApi::class.java)
        collections = retrofit.create(CollectionApi::class.java)
        chat = Retrofit.Builder()
            .baseUrl(API_BASE)
            .client(chatClient)
            .addConverterFactory(AppJson.asConverterFactory(contentType))
            .build()
            .create(ChatApi::class.java)
    }
}
