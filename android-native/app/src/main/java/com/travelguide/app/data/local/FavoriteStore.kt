package com.travelguide.app.data.local

import android.content.Context
import com.travelguide.app.data.api.AppJson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import java.util.concurrent.CopyOnWriteArrayList

/** 收藏夹与收藏地点（本地 SharedPreferences，对齐 RN favoriteStore.ts） */

const val DEFAULT_FOLDER_ID = "default"

@Serializable
data class FavoritePlace(
    val id: String,
    val folderId: String,
    val name: String,
    val city: String,
    val address: String,
    val lng: Double,
    val lat: Double,
    val poiId: String? = null,
    val savedAt: String,
)

@Serializable
data class FavoriteFolder(
    val id: String,
    val name: String,
    val locked: Boolean = false,
    val createdAt: String,
)

@Serializable
private data class FavoriteStoreData(
    val folders: List<FavoriteFolder> = emptyList(),
    val places: List<FavoritePlace> = emptyList(),
)

object FavoriteStore {
    private const val KEY = "travel_guide_favorites:v1"
    private var ctx: Context? = null
    private val listeners = CopyOnWriteArrayList<() -> Unit>()

    fun init(context: Context) {
        ctx = context.applicationContext
    }

    fun subscribe(listener: () -> Unit): () -> Unit {
        listeners.add(listener)
        return { listeners.remove(listener) }
    }

    private fun notifyListeners() {
        listeners.forEach { it() }
    }

    private fun defaultFolder() = FavoriteFolder(
        id = DEFAULT_FOLDER_ID,
        name = "默认收藏夹",
        locked = true,
        createdAt = "1970-01-01T00:00:00.000Z",
    )

    private suspend fun readStore(): FavoriteStoreData = withContext(Dispatchers.IO) {
        val c = ctx ?: return@withContext FavoriteStoreData(folders = listOf(defaultFolder()))
        val raw = c.getSharedPreferences("travel_guide", Context.MODE_PRIVATE).getString(KEY, null)
            ?: return@withContext FavoriteStoreData(folders = listOf(defaultFolder()))
        runCatching {
            AppJson.decodeFromString(FavoriteStoreData.serializer(), raw)
        }.getOrElse { FavoriteStoreData(folders = listOf(defaultFolder())) }.let { store ->
            val folders = store.folders.toMutableList()
            if (folders.none { it.id == DEFAULT_FOLDER_ID }) folders.add(0, defaultFolder())
            store.copy(folders = folders)
        }
    }

    private suspend fun writeStore(store: FavoriteStoreData) = withContext(Dispatchers.IO) {
        val c = ctx ?: return@withContext
        c.getSharedPreferences("travel_guide", Context.MODE_PRIVATE)
            .edit()
            .putString(KEY, AppJson.encodeToString(FavoriteStoreData.serializer(), store))
            .apply()
        notifyListeners()
    }

    suspend fun listFolders(): List<FavoriteFolder> = readStore().folders

    suspend fun listPlaces(folderId: String? = null): List<FavoritePlace> {
        val store = readStore()
        return if (folderId == null) store.places else store.places.filter { it.folderId == folderId }
    }

    suspend fun createFolder(name: String): FavoriteFolder {
        val store = readStore()
        val folder = FavoriteFolder(
            id = "f_${System.currentTimeMillis()}",
            name = name.trim().ifBlank { "未命名收藏夹" },
            locked = false,
            createdAt = java.time.Instant.now().toString(),
        )
        writeStore(store.copy(folders = store.folders + folder))
        return folder
    }

    suspend fun addPlace(
        folderId: String,
        place: FavoritePlaceInput,
    ): FavoritePlace {
        val store = readStore()
        val exists = store.places.any {
            it.folderId == folderId && it.name == place.name &&
                kotlin.math.abs(it.lng - place.lng) < 1e-5 &&
                kotlin.math.abs(it.lat - place.lat) < 1e-5
        }
        if (exists) {
            return store.places.first { it.folderId == folderId && it.name == place.name }
        }
        val next = FavoritePlace(
            id = "p_${System.currentTimeMillis()}_${(0..99999).random()}",
            folderId = folderId,
            name = place.name,
            city = place.city,
            address = place.address,
            lng = place.lng,
            lat = place.lat,
            poiId = place.poiId,
            savedAt = java.time.Instant.now().toString(),
        )
        writeStore(store.copy(places = store.places + next))
        return next
    }

    suspend fun removePlace(id: String) {
        val store = readStore()
        writeStore(store.copy(places = store.places.filter { it.id != id }))
    }

    suspend fun counts(): Pair<Int, Int> {
        val store = readStore()
        return store.folders.size to store.places.size
    }
}

data class FavoritePlaceInput(
    val name: String,
    val city: String,
    val address: String,
    val lng: Double,
    val lat: Double,
    val poiId: String? = null,
)
