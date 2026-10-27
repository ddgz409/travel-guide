package com.travelguide.app.data.util

import android.content.Context
import android.content.Intent
import android.net.Uri
import java.net.URLEncoder

/** 旅行平台 App 深链跳转（对齐 RN travelPortals.ts） */

enum class TravelMode(val key: String, val label: String, val emoji: String) {
    FLIGHT("flight", "飞机", "✈️"),
    TRAIN("train", "火车", "🚆"),
    CAR("car", "汽车", "🚗"),
    BIKE("bike", "自行车", "🚲"),
    WALK("walk", "行人", "🚶"),
}

data class PortalConfig(
    val id: String,
    val name: String,
    val emoji: String,
    val color: Long,
    val modes: List<TravelMode>,
    val webUrl: ((String, String, TravelMode) -> String)? = null,
    val appUrl: ((String, String, TravelMode) -> String)? = null,
)

val TRAVEL_MODES = TravelMode.entries.toList()

val PORTALS = listOf(
    PortalConfig(
        id = "ctrip",
        name = "携程",
        emoji = "✈️",
        color = 0xFF1A6DB5,
        modes = listOf(TravelMode.FLIGHT, TravelMode.TRAIN, TravelMode.CAR),
        webUrl = ::ctripTravelWeb,
    ),
    PortalConfig(
        id = "qunar",
        name = "去哪儿",
        emoji = "✈️",
        color = 0xFFFF6B35,
        modes = listOf(TravelMode.FLIGHT, TravelMode.TRAIN, TravelMode.CAR),
        webUrl = ::qunarTravelWeb,
    ),
    PortalConfig(
        id = "fliggy",
        name = "飞猪",
        emoji = "✈️",
        color = 0xFFFF0036,
        modes = listOf(TravelMode.FLIGHT, TravelMode.TRAIN, TravelMode.CAR),
        appUrl = { _, _, _ -> "fliggy://" },
    ),
    PortalConfig(
        id = "12306",
        name = "12306",
        emoji = "🚄",
        color = 0xFFC62828,
        modes = listOf(TravelMode.TRAIN),
        appUrl = { _, _, _ -> "cn.12306://" },
    ),
)

private fun enc(s: String) = URLEncoder.encode(s.trim(), "UTF-8")

private fun ctripTravelWeb(from: String, to: String, mode: TravelMode): String {
    val f = enc(from)
    val t = enc(to)
    return when (mode) {
        TravelMode.TRAIN -> "https://m.ctrip.com/webapp/train/list?from=$f&to=$t"
        TravelMode.FLIGHT -> "https://m.ctrip.com/webapp/flight/list/?triptype=1&dcityname=$f&acityname=$t"
        else -> "https://m.ctrip.com/webapp/bus/list?from=$f&to=$t"
    }
}

private fun qunarTravelWeb(from: String, to: String, mode: TravelMode): String {
    val f = enc(from)
    val t = enc(to)
    return when (mode) {
        TravelMode.TRAIN -> "https://touch.qunar.com/h5/train/search?from=$f&to=$t"
        TravelMode.FLIGHT -> "https://touch.qunar.com/h5/flight/search?depCity=$f&arrCity=$t"
        else -> "https://touch.qunar.com/h5/bus/search?from=$f&to=$t"
    }
}

private fun ctripAppUrl(web: String): String =
    "ctrip://wireless/h5?url=${enc(web)}&type=5"

private fun qunarAppUrl(web: String): String =
    "qunaraphone://hy?url=${enc(web)}"

fun openPortal(context: Context, portal: PortalConfig, from: String, to: String, mode: TravelMode) {
    val url = if (portal.webUrl != null) {
        val web = portal.webUrl.invoke(from, to, mode)
        when (portal.id) {
            "ctrip" -> ctripAppUrl(web)
            "qunar" -> qunarAppUrl(web)
            else -> web
        }
    } else {
        portal.appUrl?.invoke(from, to, mode) ?: return
    }
    runCatching {
        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
    }
}

fun modeLabel(mode: String): String =
    TRAVEL_MODES.find { it.key == mode }?.label ?: mode
