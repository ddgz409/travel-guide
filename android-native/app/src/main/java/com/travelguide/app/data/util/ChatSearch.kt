package com.travelguide.app.data.util

/** AI 助手联网模式副标题（对齐 RN chatSearch.ts） */

private fun resolveWebSearchMode(provider: String): String =
    if (provider == "zhipu") "zhipu_native" else "bing"

fun getChatSearchSubtitle(provider: String, modelLabel: String): String =
    when (resolveWebSearchMode(provider)) {
        "zhipu_native" -> "$modelLabel · 智谱联网搜索"
        else -> "$modelLabel · 网页搜索"
    }
