package com.travelguide.app.data.util

import android.net.Uri

/** 分享页公开地址（对齐 RN shareUrl.ts） */
object ShareUrl {
    const val PUBLIC_SHARE_BASE = "http://81.71.159.218:8000"

    fun forToken(token: String): String =
        "${PUBLIC_SHARE_BASE.trimEnd('/')}/share/$token"

    /** 深链 intent-filter 用的 host */
    val shareHost: String
        get() = Uri.parse(PUBLIC_SHARE_BASE).host ?: "81.71.159.218"

    val sharePort: Int?
        get() = Uri.parse(PUBLIC_SHARE_BASE).port.takeIf { it != -1 }
}
