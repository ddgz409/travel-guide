package com.travelguide.app.data.api

import java.net.URLEncoder
import java.nio.charset.StandardCharsets

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

/** 对齐 JS encodeURI：编码 path 非 ASCII（中文封面文件名），保留 `/` */
private fun encodeUriPath(path: String): String =
    path.split("/").joinToString("/") { seg ->
        if (seg.isEmpty()) ""
        else URLEncoder.encode(seg, StandardCharsets.UTF_8).replace("+", "%20")
    }

/**
 * 图片地址解析：
 * - /static/ 挂后端根路径，中文文件名必须 URI 编码，否则 Coil/OkHttp 加载失败；
 * - 高德 CDN 走 /destinations/img 代理。
 */
fun resolveImageUrl(url: String): String {
    val u = normalizeImageUrl(url)
    val origin = "http://81.71.159.218:8000"
    if (u.startsWith("/static/")) return origin + encodeUriPath(u)
    val isAmap = Regex("autonavi\\.com|\\.amap\\.com", RegexOption.IGNORE_CASE).containsMatchIn(u)
    if (isAmap && !u.contains("/destinations/img")) {
        return "$origin/api/v1/destinations/img?url=${URLEncoder.encode(u, StandardCharsets.UTF_8)}"
    }
    return u
}
