package com.travelguide.app.ui.components

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Base64
import android.widget.Toast
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import com.travelguide.app.data.api.ApiClient
import com.travelguide.app.data.api.CitySpotDto
import com.travelguide.app.data.api.ItemUpdatePayload
import com.travelguide.app.data.api.resolveImageUrl
import com.travelguide.app.data.local.AddCheckInInput
import com.travelguide.app.data.local.CheckInStore
import com.travelguide.app.data.model.Alternative
import com.travelguide.app.data.model.PoiSearchResult
import com.travelguide.app.data.model.Trip
import com.travelguide.app.data.util.LocationCache
import com.travelguide.app.ui.theme.ZhijingColors
import kotlinx.coroutines.launch
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * 地点详情底单（对齐 RN CityDetail/PoiDetailSheet）：
 * 城市攻略页与行程详情页共用同一套接口与交互。
 * 传入 tripItemId + tripCanEdit 时进入「行程编辑模式」：
 * 底栏四按钮（反馈/打卡/导航/从行程中移除）+ 「换一个」备选区。
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun PoiDetailSheet(
    item: CitySpotDto,
    category: String,
    city: String,
    onClose: () -> Unit,
    /** 城市攻略模式：「+ 添加至」跳生成页 */
    onAdd: (() -> Unit)? = null,
    onFeedback: (String) -> Unit,
    // ---- 行程编辑模式（对齐 RN trip* props） ----
    tripId: String? = null,
    tripItemId: String? = null,
    tripItemSelected: Boolean = true,
    tripAlternatives: List<Alternative>? = null,
    tripCanEdit: Boolean = false,
    onTripUpdated: ((Trip) -> Unit)? = null,
    onSwapped: (() -> Unit)? = null,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    val tripMode = tripItemId != null && tripCanEdit

    var checked by remember(item.name) { mutableStateOf(false) }
    var checkInBusy by remember { mutableStateOf(false) }
    var poiExtra by remember(item.name) { mutableStateOf<PoiSearchResult?>(null) }
    var tripSelected by remember(tripItemId, tripItemSelected) { mutableStateOf(tripItemSelected) }
    var tripEditBusy by remember { mutableStateOf(false) }

    LaunchedEffect(item.name) {
        checked = runCatching { CheckInStore.isChecked(city, item.name) }.getOrDefault(false)
        poiExtra = runCatching {
            pickPoiMatch(ApiClient.trips.searchPois(item.name, city, 5), item.name)
        }.getOrNull()
    }

    // 合并坐标/地址/电话/营业时间（对齐 RN mergedItem + poiExtra）
    val lng = item.lng ?: poiExtra?.location?.lng
    val lat = item.lat ?: poiExtra?.location?.lat
    val address = item.address?.takeIf { it.isNotBlank() } ?: poiExtra?.address
    val displayAddress = formatPoiAddress(city, item.name, address)
    val phone = firstDialablePhone(poiExtra?.tel)
    val opentime = poiExtra?.opentime.orEmpty().trim()
    val portalKind = when (category) {
        "foods" -> "meal"
        "hotels" -> "hotel"
        else -> "attraction"
    }
    val galleryKind = if (category == "hotels") "" else category
    val categoryLabel = CATEGORY_LABEL[category] ?: "景点"

    val userLoc = remember { LocationCache.location }
    val distance = remember(userLoc, lng, lat) {
        val u = userLoc
        if (u != null && lng != null && lat != null) distanceLabel(u.lat, u.lng, lat, lng) else null
    }

    fun handleCheckIn() {
        if (checkInBusy) return
        checkInBusy = true
        scope.launch {
            try {
                if (checked) {
                    CheckInStore.remove(city, item.name)
                    checked = false
                } else {
                    CheckInStore.add(AddCheckInInput(city, item.name, category, lng, lat, address))
                    checked = true
                }
            } catch (e: Exception) {
                context.toast("打卡失败：${e.message ?: "请稍后重试"}")
            } finally {
                checkInBusy = false
            }
        }
    }

    fun handleNavigate() = context.openMapNavigation(item.name, lng, lat, address, city)

    fun handleHours() {
        if (lng != null && lat != null) context.openAmapPoiLookup(item.name, lng, lat, address, city)
        else context.openCtripPoi(city, item.name)
    }

    fun handlePhone() {
        val p = phone
        when {
            p != null -> {
                val tel = "tel:${p.replace(Regex("[^\\d+]"), "")}"
                if (!context.tryOpenUrl(tel)) context.toast("无法拨号：$p")
            }
            lng != null && lat != null -> context.openAmapPoiLookup(item.name, lng, lat, address, city)
            else -> context.toast("暂无电话，可在高德地图中查看")
        }
    }

    /** 从行程中移除 / 恢复此项（对齐 RN handleToggleTripItem） */
    fun handleToggleTripItem() {
        val tId = tripId
        val iId = tripItemId
        if (tId == null || iId == null || !tripCanEdit || tripEditBusy) return
        tripEditBusy = true
        scope.launch {
            try {
                val updated = ApiClient.trips.updateItem(tId, iId, ItemUpdatePayload(selected = !tripSelected))
                tripSelected = !tripSelected
                onTripUpdated?.invoke(updated)
            } catch (e: Exception) {
                context.toast(e.message ?: "操作失败")
            } finally {
                tripEditBusy = false
            }
        }
    }

    /** 换一个：与备选条目互换（对齐 RN handleSwapTripItem） */
    fun handleSwapTripItem(altIndex: Int) {
        val tId = tripId
        val iId = tripItemId
        if (tId == null || iId == null || !tripCanEdit || tripEditBusy) return
        tripEditBusy = true
        scope.launch {
            try {
                val updated = ApiClient.trips.swapItem(tId, iId, altIndex)
                onTripUpdated?.invoke(updated)
                context.toast("已为你换成新地点")
                onSwapped?.invoke()
                onClose()
            } catch (e: Exception) {
                context.toast(e.message ?: "换一个失败")
            } finally {
                tripEditBusy = false
            }
        }
    }

    Dialog(
        onDismissRequest = onClose,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Box(Modifier.fillMaxSize()) {
            Box(Modifier.fillMaxSize().background(Color(0x59000000)).clickable { onClose() })
            Column(
                Modifier
                    .fillMaxWidth()
                    .fillMaxHeight(0.88f)
                    .align(Alignment.BottomCenter)
                    .clip(RoundedCornerShape(topStart = 30.dp, topEnd = 30.dp))
                    .background(ZhijingColors.Card),
            ) {
                Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) {
                    // 头部：标题 + 标签 + 关闭（对齐 RN detailHead）
                    Row(
                        Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, top = 20.dp, bottom = 12.dp),
                        verticalAlignment = Alignment.Top,
                    ) {
                        Column(Modifier.weight(1f).padding(end = 12.dp)) {
                            Text(item.name, fontSize = 22.sp, fontWeight = FontWeight.ExtraBold, color = ZhijingColors.Ink, lineHeight = 30.sp)
                            Spacer(Modifier.height(10.dp))
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                DetailTag(text = fakePopularity(item.name))
                                DetailTag(text = categoryLabel, blue = true)
                                if (distance != null) {
                                    DetailTag(text = "📍 ${distance.replace("距我 ", "距离 ")}")
                                }
                            }
                        }
                        Box(
                            Modifier.size(32.dp).clip(RoundedCornerShape(26.dp)).background(Color(0xFFF5F5F5)).clickable { onClose() },
                            contentAlignment = Alignment.Center,
                        ) {
                            Text("✕", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = ZhijingColors.Muted)
                        }
                    }

                    // 在其他平台查看（对齐 RN PoiPortalLinks）
                    PortalLinks(
                        city = city,
                        name = item.name,
                        kind = portalKind,
                        lng = lng,
                        lat = lat,
                        address = address,
                    )

                    // 图集（横向滚动，最多 3 张）
                    DetailGallery(item = item, city = city, kind = galleryKind)

                    // 地点介绍（AI生成）
                    Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("地点介绍", fontSize = 17.sp, fontWeight = FontWeight.ExtraBold, color = ZhijingColors.Ink)
                            Spacer(Modifier.width(8.dp))
                            Box(
                                Modifier.clip(RoundedCornerShape(16.dp)).background(Color(0xFFF0F0F0)).padding(horizontal = 8.dp, vertical = 3.dp),
                            ) {
                                Text("AI生成", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = ZhijingColors.Muted)
                            }
                        }
                        Spacer(Modifier.height(10.dp))
                        Text(
                            item.desc.ifBlank { "$city · ${item.name}，可在下方查看攻略或发起导航。" },
                            fontSize = 14.sp,
                            color = ZhijingColors.Ink,
                            lineHeight = 22.sp,
                        )
                    }
                    Spacer(Modifier.height(18.dp))

                    // 真实评价（对齐 RN reviewCardGreen/Pink + Wow/oh no 贴纸）
                    val (positive, neutral) = remember(item.desc, category) { splitReviewPoints(item.desc, category) }
                    Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp)) {
                        Text("真实评价", fontSize = 17.sp, fontWeight = FontWeight.ExtraBold, color = ZhijingColors.Ink)
                        ReviewCard(points = positive, sticker = "Wow", bg = Color(0xFFE8F8F0), stickerColor = Color(0x594CAF50), stickerSize = 18.sp, rotation = -12f)
                        ReviewCard(points = neutral, sticker = "oh no", bg = Color(0xFFFFF0F3), stickerColor = Color(0x47E91E63), stickerSize = 16.sp, rotation = 8f)
                    }
                    Spacer(Modifier.height(18.dp))

                    // 信息列表（对齐 RN infoList：地址/营业时间/电话/反馈）
                    Column(
                        Modifier
                            .fillMaxWidth()
                            .padding(start = 20.dp, end = 20.dp, bottom = 16.dp)
                            .clip(RoundedCornerShape(26.dp))
                            .border(1.dp, ZhijingColors.Line, RoundedCornerShape(26.dp)),
                    ) {
                        InfoRow(
                            icon = "📍",
                            title = displayAddress,
                            sub = distance ?: if (userLoc != null) "点击导航" else "开启定位后可显示距离",
                            divider = true,
                        ) { handleNavigate() }
                        InfoRow(
                            icon = "🕐",
                            title = "营业时间",
                            sub = opentime.ifEmpty { "点击查看高德/携程最新营业时间" },
                            divider = true,
                        ) { handleHours() }
                        InfoRow(
                            icon = "📞",
                            title = "电话咨询",
                            sub = phone ?: "点击拨打或在高德地图查看",
                            divider = true,
                        ) { handlePhone() }
                        InfoRow(
                            icon = "❓",
                            title = "反馈问题",
                            sub = "向 AI 助手反馈地点信息",
                            divider = false,
                        ) { onFeedback("关于「$city · ${item.name}」的反馈：") }
                    }
                }

                // 「换一个」备选区（对齐 RN tripEditSection）
                val alts = tripAlternatives.orEmpty()
                if (tripMode && alts.isNotEmpty()) {
                    Column(
                        Modifier
                            .fillMaxWidth()
                            .background(ZhijingColors.Card)
                            .padding(horizontal = 16.dp)
                            .padding(top = 10.dp, bottom = 2.dp),
                    ) {
                        Box(Modifier.fillMaxWidth().height(1.dp).background(ZhijingColors.Line))
                        Spacer(Modifier.height(10.dp))
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text("换一个：", fontSize = 12.sp, color = ZhijingColors.Muted, modifier = Modifier.align(Alignment.CenterVertically))
                            alts.take(3).forEachIndexed { i, alt ->
                                Box(
                                    Modifier
                                        .clip(RoundedCornerShape(16.dp))
                                        .background(ZhijingColors.BrandSoft)
                                        .clickable(enabled = !tripEditBusy) { handleSwapTripItem(i) }
                                        .padding(horizontal = 10.dp, vertical = 6.dp),
                                ) {
                                    Text(alt.name, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = ZhijingColors.BrandHot)
                                }
                            }
                        }
                    }
                }

                // 底部操作（对齐 RN detailActions：三/四按钮随行程模式切换）
                Box(Modifier.fillMaxWidth().height(1.dp).background(ZhijingColors.Line))
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(
                            start = if (tripMode) 12.dp else 16.dp,
                            end = if (tripMode) 12.dp else 16.dp,
                            top = 10.dp,
                            bottom = 12.dp,
                        ),
                    horizontalArrangement = Arrangement.spacedBy(if (tripMode) 6.dp else 10.dp),
                ) {
                    if (tripMode) {
                        // 行程模式：反馈（对齐 RN 四列首钮）
                        Box(
                            Modifier
                                .weight(1f)
                                .height(44.dp)
                                .clip(RoundedCornerShape(34.dp))
                                .border(1.dp, ZhijingColors.Line, RoundedCornerShape(34.dp))
                                .clickable { onFeedback("关于「$city · ${item.name}」的反馈：") },
                            contentAlignment = Alignment.Center,
                        ) {
                            Text("反馈", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = ZhijingColors.Ink, maxLines = 1)
                        }
                    } else if (onAdd != null) {
                        Box(
                            Modifier
                                .weight(1f)
                                .height(44.dp)
                                .clip(RoundedCornerShape(34.dp))
                                .border(1.dp, ZhijingColors.Line, RoundedCornerShape(34.dp))
                                .clickable(onClick = onAdd),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text("+ 添加至", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = ZhijingColors.Ink)
                        }
                    }
                    CheckInButton(Modifier.weight(1f), checked, checkInBusy, compact = tripMode, onPress = ::handleCheckIn)
                    Box(
                        Modifier
                            .weight(1f)
                            .height(44.dp)
                            .clip(RoundedCornerShape(34.dp))
                            .background(ZhijingColors.Ink)
                            .border(1.dp, ZhijingColors.Ink, RoundedCornerShape(34.dp))
                            .clickable { handleNavigate() },
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("导航", fontSize = if (tripMode) 12.sp else 14.sp, fontWeight = FontWeight.Bold, color = Color.White, maxLines = 1)
                    }
                    if (tripMode) {
                        // 从行程中移除 / 恢复此项（对齐 RN detailActionRemove）
                        Box(
                            Modifier
                                .weight(1f)
                                .height(44.dp)
                                .clip(RoundedCornerShape(34.dp))
                                .background(Color(0xFFFFF5F5))
                                .border(1.dp, ZhijingColors.BrandHot, RoundedCornerShape(34.dp))
                                .clickable(enabled = !tripEditBusy) { handleToggleTripItem() },
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                if (tripEditBusy) "…" else if (tripSelected) "从行程中移除" else "恢复此项",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                color = ZhijingColors.BrandHot,
                                maxLines = 2,
                                lineHeight = 14.sp,
                                textAlign = TextAlign.Center,
                            )
                        }
                    }
                }
            }
        }
    }
}

private val CATEGORY_LABEL = mapOf(
    "spots" to "景点",
    "foods" to "美食",
    "humanities" to "人文",
    "hotels" to "酒店",
)

// ---------- 工具函数（对齐 RN CityDetail/helpers） ----------

/** 「X万人规划」：与 RN fakePopularity 相同算法（字符码和 → 1.10~9.99） */
private fun fakePopularity(name: String): String {
    val hash = name.sumOf { it.code }
    val n = ((hash % 890) + 110) / 100f
    return "%.2f万人规划".format(n)
}

private val POSITIVE_LABELS = listOf("体验不错", "值得打卡", "口碑很好", "推荐前往")
private val NEUTRAL_LABELS = listOf("温馨提示", "注意事项", "小幅不足", "可以更好")

private data class ReviewPoint(val label: String, val text: String)

/** 将描述拆成带标题的评价要点（对齐 RN splitReviewPoints） */
private fun splitReviewPoints(desc: String, category: String): Pair<List<ReviewPoint>, List<ReviewPoint>> {
    val parts = desc.split(Regex("[，。；、]")).map { it.trim() }.filter { it.length > 2 }
    fun toPoint(text: String, labels: List<String>, i: Int): ReviewPoint {
        val short = if (text.length > 8) "${text.take(6)}…" else text
        val label = if (category == "foods") "$short：" else "${labels[i % labels.size]}："
        return ReviewPoint(label, text)
    }
    if (parts.size >= 2) {
        val mid = (parts.size + 1) / 2
        return parts.take(mid).mapIndexed { i, t -> toPoint(t, POSITIVE_LABELS, i) } to
            parts.drop(mid).mapIndexed { i, t -> toPoint(t, NEUTRAL_LABELS, i) }
    }
    val fallback = parts.firstOrNull() ?: if (category == "foods") "本地特色鲜明" else "值得一游"
    return listOf(ReviewPoint("亮点：", fallback)) to listOf(ReviewPoint("提示：", "建议错峰前往，体验更佳"))
}

/** 拼接展示地址（优先真实地址，对齐 RN formatPoiAddress） */
private fun formatPoiAddress(city: String, name: String, address: String?): String {
    val addr = address.orEmpty().trim()
    return addr.ifEmpty { "$city · $name" }
}

/** 从高德 tel 字段提取可拨打号码（对齐 RN firstDialablePhone） */
private fun firstDialablePhone(tel: String?): String? {
    if (tel.isNullOrBlank()) return null
    val part = tel.split(Regex("[;,|/]")).firstOrNull()?.trim().orEmpty()
    if (part.isEmpty() || part == "-" || part == "暂无") return null
    val digits = part.replace(Regex("[^\\d+]"), "")
    if (digits.length < 7) return null
    return part
}

/** POI 匹配：精确 → 包含 → 首条（对齐 RN pickPoiMatch） */
private fun pickPoiMatch(list: List<PoiSearchResult>, name: String): PoiSearchResult? {
    if (list.isEmpty()) return null
    val target = name.trim()
    return list.find { it.name.trim() == target }
        ?: list.find { it.name.contains(target) || target.contains(it.name) }
        ?: list.first()
}

/** 「距我 X 米/公里」（对齐 RN distanceLabel + formatDistanceFromUser） */
private fun distanceLabel(uLat: Double, uLng: Double, lat: Double, lng: Double): String {
    val r = 6371000.0
    val dLat = Math.toRadians(lat - uLat)
    val dLng = Math.toRadians(lng - uLng)
    val s = sin(dLat / 2) * sin(dLat / 2) +
        cos(Math.toRadians(uLat)) * cos(Math.toRadians(lat)) * sin(dLng / 2) * sin(dLng / 2)
    val meters = 2 * r * asin(min(1.0, sqrt(s)))
    return if (meters < 1000) "距我 ${meters.roundToInt()} 米" else "距我 ${"%.1f".format(meters / 1000)} 公里"
}

// ---------- 外链跳转（对齐 RN openMapNavigation / poiPortals / openExternal） ----------

private fun Context.tryOpenUrl(url: String): Boolean =
    runCatching { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }.isSuccess

private fun Context.toast(msg: String) {
    Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
}

/** 导航：高德深链 → amapuri → H5 → geo 兜底（对齐 RN openMapNavigation） */
private fun Context.openMapNavigation(name: String, lng: Double?, lat: Double?, address: String?, city: String) {
    if (lng != null && lat != null) {
        val label = name.ifBlank { city }.ifBlank { "目的地" }
        val enc = Uri.encode(label)
        val ok = listOf(
            "androidamap://route?sourceApplication=travel-guide&dlat=$lat&dlon=$lng&dname=$enc&dev=0&t=0",
            "amapuri://route/plan/?dlat=$lat&dlon=$lng&dname=$enc&dev=0&t=0",
            "https://uri.amap.com/navigation?to=$lng,$lat,$enc&mode=car&coordinate=gaode",
            "geo:$lat,$lng?q=$lat,$lng($enc)",
        ).any { tryOpenUrl(it) }
        if (!ok) toast("无法打开地图，请安装高德地图或使用系统地图应用")
    } else {
        val kw = Uri.encode(address?.takeIf { it.isNotBlank() } ?: "${city.trim()} ${name.trim()}".trim())
        val ok = listOf(
            "androidamap://poi?sourceApplication=travel-guide&keywords=$kw",
            "https://uri.amap.com/search?keyword=$kw",
        ).any { tryOpenUrl(it) }
        if (!ok) toast("无法打开地图，暂无坐标，无法发起导航")
    }
}

/** 打开高德 POI 详情（营业时间/电话，对齐 RN openAmapPoiLookup） */
private fun Context.openAmapPoiLookup(name: String, lng: Double?, lat: Double?, address: String?, city: String) {
    val kw = Uri.encode(address?.takeIf { it.isNotBlank() } ?: "${city.trim()} ${name.trim()}".trim())
    val urls = mutableListOf<String>()
    if (lng != null && lat != null) {
        urls += "androidamap://viewMap?sourceApplication=travel-guide&poiname=${Uri.encode(name)}&lat=$lat&lon=$lng&dev=0"
    }
    urls += "androidamap://poi?sourceApplication=travel-guide&keywords=$kw"
    urls += "https://uri.amap.com/search?keyword=$kw"
    if (urls.none { tryOpenUrl(it) }) toast("无法打开地图，请安装高德地图后查看详情")
}

/** 携程：App 深链包 H5，失败开网页（对齐 RN openCtripPoi） */
private fun Context.openCtripPoi(city: String, name: String) {
    val web = "https://piao.ctrip.com/ticket/search?keyword=${Uri.encode("${city.trim()} ${name.trim()}".trim())}"
    val app = "ctrip://wireless/h5?url=${Base64.encodeToString(web.toByteArray(), Base64.NO_WRAP)}&type=5"
    if (!tryOpenUrl(app)) tryOpenUrl(web)
}

/** 去哪儿：App hy 容器，失败开网页（对齐 RN openQunarPoi） */
private fun Context.openQunarPoi(city: String, name: String) {
    val web = "https://piao.qunar.com/ticket/list.htm?keyword=${Uri.encode("${city.trim()} ${name.trim()}".trim())}"
    val app = "qunaraphone://hy?url=${Uri.encode(web)}"
    if (!tryOpenUrl(app)) tryOpenUrl(web)
}

/** 小红书：搜索深链兜底网页（对齐 RN openXhsPoi） */
private fun Context.openXhsPoi(city: String, name: String, kind: String) {
    val dest = city.trim().ifEmpty { "旅游" }
    val poi = name.trim()
    val kw = when (kind) {
        "meal" -> "$dest $poi"
        "hotel" -> "$dest $poi 酒店"
        else -> "$dest $poi 攻略"
    }
    val enc = Uri.encode(kw)
    val schemes = listOf(
        "xhsdiscover://search/result?keyword=$enc",
        "xhsdiscover://search_result?keyword=$enc",
        "xhsdiscovery://search/result?keyword=$enc",
    )
    if (schemes.any { tryOpenUrl(it) }) return
    tryOpenUrl("https://www.xiaohongshu.com/search_result?keyword=$enc")
}

// ---------- 内部组件 ----------

/** 打卡按钮：果冻弹性 + 红色取消态（对齐 RN CheckInButton，compact 用短文案） */
@Composable
private fun CheckInButton(
    modifier: Modifier,
    checked: Boolean,
    busy: Boolean,
    compact: Boolean = false,
    onPress: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val scale = remember { Animatable(1f) }
    val bg by animateColorAsState(
        if (checked) Color(0xFFE53935) else ZhijingColors.Brand,
        animationSpec = tween(180),
        label = "checkinBg",
    )
    Box(
        modifier
            .height(44.dp)
            .graphicsLayer { scaleX = scale.value; scaleY = scale.value }
            .clip(RoundedCornerShape(34.dp))
            .background(bg.copy(alpha = if (busy) 0.6f else 1f))
            .border(1.dp, bg, RoundedCornerShape(34.dp))
            .clickable(enabled = !busy) {
                scope.launch {
                    launch {
                        scale.animateTo(1.07f, tween(95))
                        scale.animateTo(1f, spring(dampingRatio = 0.56f, stiffness = 480f))
                    }
                    onPress()
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        val label = if (checked) (if (compact) "已打卡" else "取消打卡") else "打卡"
        Text(label, fontSize = if (compact) 12.sp else 14.sp, fontWeight = FontWeight.ExtraBold, color = Color.White)
    }
}

/** 「在其他平台查看」四枚门户（对齐 RN PoiPortalLinks） */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PortalLinks(
    city: String,
    name: String,
    kind: String,
    lng: Double?,
    lat: Double?,
    address: String?,
) {
    val context = LocalContext.current
    Column(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp)
            .padding(bottom = 18.dp)
            .clip(RoundedCornerShape(22.dp))
            .background(Color(0xFFF7FBFF))
            .border(1.dp, Color(0xFFD7EAF8), RoundedCornerShape(22.dp))
            .padding(14.dp),
    ) {
        Text("在其他平台查看", fontSize = 15.sp, fontWeight = FontWeight.ExtraBold, color = ZhijingColors.Ink)
        Spacer(Modifier.height(10.dp))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            PortalChip("高", Color(0xFF0091FF), "高德") { context.openAmapPoiLookup(name, lng, lat, address, city) }
            PortalChip("红", Color(0xFFE6162D), "小红书") { context.openXhsPoi(city, name, kind) }
            PortalChip("携", Color(0xFF1A6DB5), "携程") { context.openCtripPoi(city, name) }
            PortalChip("去", Color(0xFFFF6B35), "去哪儿") { context.openQunarPoi(city, name) }
        }
    }
}

@Composable
private fun PortalChip(short: String, color: Color, label: String, onClick: () -> Unit) {
    Row(
        Modifier
            .clip(RoundedCornerShape(30.dp))
            .background(Color.White)
            .border(1.dp, ZhijingColors.Line, RoundedCornerShape(30.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(20.dp).clip(RoundedCornerShape(14.dp)).background(color),
            contentAlignment = Alignment.Center,
        ) {
            Text(short, fontSize = 10.sp, fontWeight = FontWeight.ExtraBold, color = Color.White)
        }
        Spacer(Modifier.width(6.dp))
        Text(label, fontSize = 14.sp, fontWeight = FontWeight.Bold, color = ZhijingColors.Ink)
    }
}

/** 评价卡：背景色 + 旋转贴纸（对齐 RN reviewCardGreen/Pink） */
@Composable
private fun ReviewCard(
    points: List<ReviewPoint>,
    sticker: String,
    bg: Color,
    stickerColor: Color,
    stickerSize: androidx.compose.ui.unit.TextUnit,
    rotation: Float,
) {
    Box(
        Modifier
            .fillMaxWidth()
            .padding(top = 10.dp, bottom = 10.dp)
            .clip(RoundedCornerShape(26.dp))
            .background(bg)
            .padding(14.dp),
    ) {
        Column {
            points.forEach { p ->
                Text(
                    buildAnnotatedString {
                        withStyle(SpanStyle(fontWeight = FontWeight.ExtraBold)) { append(p.label) }
                        append(p.text)
                    },
                    fontSize = 14.sp,
                    color = ZhijingColors.Ink,
                    lineHeight = 22.sp,
                    modifier = Modifier.padding(bottom = 6.dp),
                )
            }
        }
        Text(
            sticker,
            fontSize = stickerSize,
            fontWeight = FontWeight.ExtraBold,
            color = stickerColor,
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(top = 8.dp, end = 10.dp)
                .graphicsLayer { rotationZ = rotation },
        )
    }
}

/** 信息行：图标 + 标题/副标题 + 箭头（对齐 RN infoRow） */
@Composable
private fun InfoRow(icon: String, title: String, sub: String, divider: Boolean, onClick: () -> Unit) {
    Column {
        Row(
            Modifier
                .fillMaxWidth()
                .clickable(onClick = onClick)
                .padding(horizontal = 14.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(icon, fontSize = 18.sp)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(title, fontSize = 15.sp, fontWeight = FontWeight.Bold, color = ZhijingColors.Ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Spacer(Modifier.height(2.dp))
                Text(sub, fontSize = 12.sp, color = ZhijingColors.Muted, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            Spacer(Modifier.width(8.dp))
            Text("›", fontSize = 18.sp, fontWeight = FontWeight.Light, color = ZhijingColors.Muted)
        }
        if (divider) {
            Box(Modifier.fillMaxWidth().height(1.dp).background(ZhijingColors.Line))
        }
    }
}

@Composable
private fun DetailTag(text: String, blue: Boolean = false) {
    Box(
        Modifier
            .clip(RoundedCornerShape(18.dp))
            .background(if (blue) ZhijingColors.BrandSoft else Color(0xFFF3F3F3))
            .padding(horizontal = 10.dp, vertical = 4.dp),
    ) {
        Text(
            text,
            fontSize = 12.sp,
            fontWeight = if (blue) FontWeight.Bold else FontWeight.SemiBold,
            color = if (blue) ZhijingColors.BrandHot else ZhijingColors.Muted,
        )
    }
}

@Composable
private fun DetailGallery(item: CitySpotDto, city: String, kind: String) {
    // 优先接口自带图集，无图走 place-images 补齐（最多 3 张）
    val direct = remember(item.name) {
        (listOfNotNull(item.image) + item.images)
            .filter { it.isNotBlank() }
            .mapNotNull { resolveImageUrl(it) }
            .distinct()
            .take(3)
    }
    var urls by remember(item.name) { mutableStateOf(direct) }
    LaunchedEffect(item.name, item.poiId) {
        if (urls.isEmpty()) {
            urls = runCatching {
                ApiClient.destinations.placeImages(city, item.name, kind, 3, item.poiId)
                    .images.mapNotNull { resolveImageUrl(it) }.take(3)
            }.getOrDefault(emptyList())
        }
    }
    if (urls.isEmpty()) return
    // 单图宽度 = 屏宽 72%（对齐 RN itemWidth = screenW * 0.72）
    val itemWidth = LocalConfiguration.current.screenWidthDp * 0.72f
    LazyRow(
        contentPadding = PaddingValues(horizontal = 20.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp),
    ) {
        items(urls, key = { it }) { url ->
            AsyncImage(
                model = url,
                contentDescription = item.name,
                modifier = Modifier.width(itemWidth.dp).height(160.dp).clip(RoundedCornerShape(26.dp)),
                contentScale = ContentScale.Crop,
            )
        }
    }
}
