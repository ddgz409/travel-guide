package com.travelguide.app.ui.navigation

import android.net.Uri

/** 生成页路由参数（对齐 RN AppStackParamList Generate） */
data class GenerateNavArgs(
    val destination: String? = null,
    val mode: String? = null,
    val autoSubmit: Boolean = false,
    val chatHint: String? = null,
    val startDate: String? = null,
    val endDate: String? = null,
    val interests: List<String>? = null,
)

fun Routes.buildGenerateRoute(args: GenerateNavArgs = GenerateNavArgs()): String {
    val params = buildList {
        if (!args.destination.isNullOrBlank()) add("dest=${Uri.encode(args.destination)}")
        if (!args.mode.isNullOrBlank()) add("mode=${args.mode}")
        if (args.autoSubmit) add("autoSubmit=true")
        if (!args.chatHint.isNullOrBlank()) add("chatHint=${Uri.encode(args.chatHint)}")
        if (!args.startDate.isNullOrBlank()) add("startDate=${Uri.encode(args.startDate)}")
        if (!args.endDate.isNullOrBlank()) add("endDate=${Uri.encode(args.endDate)}")
        if (!args.interests.isNullOrEmpty()) {
            add("interests=${Uri.encode(args.interests.joinToString(","))}")
        }
    }
    return if (params.isEmpty()) "generate" else "generate?${params.joinToString("&")}"
}

/** 兼容旧调用：dest + mode */
fun Routes.generate(dest: String? = null, mode: String? = null): String =
    buildGenerateRoute(GenerateNavArgs(destination = dest, mode = mode))
