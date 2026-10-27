package com.travelguide.app.data.local

import android.content.Context
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Base64
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.travelguide.app.data.api.AppJson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import java.io.File
import java.io.FileOutputStream
import kotlin.math.max

private val Context.mapPhotoDataStore by preferencesDataStore(name = "zhijing_map_photos")

/** 旅行地图：各省一张相册照片（对齐 RN mapPhotoStore.ts） */
object MapPhotoStore {
    private const val KEY = "travel_guide_map_photos:v1"
    private const val THUMB_EDGE = 480

    @Volatile private var context: Context? = null
    private val listeners = mutableSetOf<() -> Unit>()

    fun init(appContext: Context) {
        context = appContext.applicationContext
    }

    fun subscribe(listener: () -> Unit): () -> Unit {
        listeners.add(listener)
        return { listeners.remove(listener) }
    }

    private fun notifyListeners() {
        listeners.toList().forEach { it.invoke() }
    }

    private fun photosDir(): File {
        val dir = File(context!!.filesDir, "map-province-photos")
        if (!dir.exists()) dir.mkdirs()
        return dir
    }

    private suspend fun readStore(): Map<String, String> {
        val ctx = context ?: return emptyMap()
        val raw = ctx.mapPhotoDataStore.data.first()[stringPreferencesKey(KEY)]
        if (raw.isNullOrBlank()) return emptyMap()
        return runCatching {
            AppJson.decodeFromString(MapSerializer(String.serializer(), String.serializer()), raw)
        }.getOrDefault(emptyMap()).filterValues { path ->
            path.isNotBlank() && File(path).exists()
        }
    }

    private suspend fun writeStore(store: Map<String, String>) {
        val ctx = context ?: return
        ctx.mapPhotoDataStore.edit {
            it[stringPreferencesKey(KEY)] = AppJson.encodeToString(
                MapSerializer(String.serializer(), String.serializer()),
                store,
            )
        }
    }

    suspend fun getAllProvincePhotos(): Map<String, String> = readStore()

    suspend fun buildProvincePhotoDataUris(store: Map<String, String>? = null): Map<String, String> =
        withContext(Dispatchers.IO) {
            val src = store ?: readStore()
            val out = mutableMapOf<String, String>()
            for ((key, path) in src) {
                uriToDataUri(path)?.let { out[key] = it }
            }
            out
        }

    private fun uriToDataUri(path: String): String? = runCatching {
        val bytes = File(path).readBytes()
        "data:image/jpeg;base64,${Base64.encodeToString(bytes, Base64.NO_WRAP)}"
    }.getOrNull()

    suspend fun setProvincePhoto(provinceKey: String, pickedUri: Uri): String? = withContext(Dispatchers.IO) {
        val ctx = context ?: return@withContext null
        val store = readStore().toMutableMap()
        store[provinceKey]?.let { old ->
            runCatching { File(old).delete() }
        }
        val dest = File(photosDir(), "$provinceKey.jpg")
        persistThumb(ctx, pickedUri, dest)
        store[provinceKey] = dest.absolutePath
        writeStore(store)
        notifyListeners()
        dest.absolutePath
    }

    suspend fun clearProvincePhoto(provinceKey: String) = withContext(Dispatchers.IO) {
        val store = readStore().toMutableMap()
        store.remove(provinceKey)?.let { path ->
            runCatching { File(path).delete() }
        }
        writeStore(store)
        notifyListeners()
    }

    private fun persistThumb(context: Context, sourceUri: Uri, dest: File) {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        context.contentResolver.openInputStream(sourceUri)?.use {
            BitmapFactory.decodeStream(it, null, bounds)
        }
        var sample = 1
        val maxDim = max(bounds.outWidth, bounds.outHeight)
        while (maxDim / sample > THUMB_EDGE) sample *= 2

        context.contentResolver.openInputStream(sourceUri).use { input ->
            val bitmap = BitmapFactory.decodeStream(
                input,
                null,
                BitmapFactory.Options().apply { inSampleSize = sample },
            ) ?: error("无法读取图片")
            val scale = THUMB_EDGE.toFloat() / max(bitmap.width, bitmap.height)
            val w = (bitmap.width * scale).toInt().coerceAtLeast(1)
            val h = (bitmap.height * scale).toInt().coerceAtLeast(1)
            val scaled = if (scale < 1f) {
                android.graphics.Bitmap.createScaledBitmap(bitmap, w, h, true).also {
                    if (it !== bitmap) bitmap.recycle()
                }
            } else bitmap
            FileOutputStream(dest).use { out ->
                scaled.compress(android.graphics.Bitmap.CompressFormat.JPEG, 78, out)
            }
            scaled.recycle()
        }
    }
}
