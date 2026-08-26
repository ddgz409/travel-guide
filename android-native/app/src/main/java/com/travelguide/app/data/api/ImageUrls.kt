package com.travelguide.app.data.api

import java.net.URLEncoder

/** 对齐 RN placeImage.ts 的 normalizeImageUrl：协议补全 */
fun normalizeImageUrl(url: String): String {
    val u = url.trim()
    if (u.startsWith("//")) return "https:$u"
    if (u.startsWith("http://")) return "https://${u.substring(7)}"
    return u
}

/** 服务器相对路径转绝对地址（对齐 RN absAvatar）：头像等 /xxx 资源挂后端根路径 */
fun absServerPath(path: String?): String? {
    val p = path?.trim().orEmpty()
    if (p.isEmpty()) return null
    if (p.startsWith("http://") || p.startsWith("https://")) return p
    if (p.startsWith("/")) return "http://81.71.159.218:8000$p"
    return null
}

/**
 * 图片地址解析（对齐 RN resolveImageUrl）：
 * - /static/ 路径挂后端根路径，需剥离 apiBase 的 /api/v1 前缀；
 * - 高德 CDN（autonavi.com / .amap.com）App 直连会失败，走自家后端 /destinations/img 代理。
 */
fun resolveImageUrl(url: String): String {
    val u = normalizeImageUrl(url)
    val origin = "http://81.71.159.218:8000"
    if (u.startsWith("/static/")) return "$origin${u.replace(" ", "%20")}"
    val isAmap = Regex("autonavi\\.com|\\.amap\\.com", RegexOption.IGNORE_CASE).containsMatchIn(u)
    if (isAmap && !u.contains("/destinations/img")) {
        return "$origin/api/v1/destinations/img?url=${URLEncoder.encode(u, "UTF-8")}"
    }
    return u
}
