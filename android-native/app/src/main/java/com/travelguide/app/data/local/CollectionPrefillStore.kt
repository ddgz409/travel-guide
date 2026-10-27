package com.travelguide.app.data.local

import com.travelguide.app.data.api.CollectionPlace

/** Chat open_collection_editor 跳转发布页时的预填数据 */
object CollectionPrefillStore {
    data class Prefill(
        val title: String = "",
        val summary: String = "",
        val emoji: String = "📁",
        val destination: String = "",
        val places: List<CollectionPlace> = emptyList(),
    )

    @Volatile var pending: Prefill? = null

    fun take(): Prefill? {
        val p = pending
        pending = null
        return p
    }
}
