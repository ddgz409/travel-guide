package com.travelguide.app.ui.screens.city

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.travelguide.app.data.api.ApiClient
import com.travelguide.app.data.api.CityInfo
import com.travelguide.app.data.api.CitySpotDto
import com.travelguide.app.data.api.resolveImageUrl
import com.travelguide.app.ui.components.PoiDetailSheet
import com.travelguide.app.ui.components.rememberPlaceImage
import com.travelguide.app.ui.theme.ZhijingColors
import kotlinx.coroutines.launch

/** Tab 与数据源映射（对齐 RN TABS：景点/美食/人文） */
private enum class GuideTab(val label: String, val kind: String) {
    SPOTS("景点", "spots"),
    FOODS("美食", "foods"),
    HUMANITIES("人文", "humanities"),
}

private fun CityInfo.pick(tab: GuideTab): List<CitySpotDto> = when (tab) {
    GuideTab.SPOTS -> spots
    GuideTab.FOODS -> foods
    GuideTab.HUMANITIES -> humanities
}

private sealed interface TabState {
    data object Idle : TabState
    data object Loading : TabState
    data class Ready(val items: List<CitySpotDto>) : TabState
    data object Error : TabState
}

/**
 * 城市攻略页（对齐 RN CityGuideScreen）：
 * 两列图片网格浏览城市真实美食/景点/人文，点击弹出详情底单。
 */
@Composable
fun CityGuideScreen(
    city: String,
    onBack: () -> Unit,
    onOpenGenerate: (String) -> Unit,
    onOpenChat: (String) -> Unit,
) {
    var active by remember(city) { mutableStateOf(GuideTab.SPOTS) }
    val states = remember(city) { mutableStateMapOf<GuideTab, TabState>() }
    val scope = rememberCoroutineScope()
    // 内存缓存：城市信息一次拉取，切 Tab 不重复请求（对齐 RN 的缓存策略）
    var cachedInfo by remember(city) { mutableStateOf<CityInfo?>(null) }

    fun load(tab: GuideTab) {
        if (states[tab] is TabState.Loading || states[tab] is TabState.Ready) return
        states[tab] = TabState.Loading
        scope.launch {
            try {
                val info = cachedInfo ?: ApiClient.destinations.info(city).also { cachedInfo = it }
                states[tab] = TabState.Ready(info.pick(tab))
            } catch (_: Exception) {
                states[tab] = TabState.Error
            }
        }
    }

    LaunchedEffect(city) { load(GuideTab.SPOTS) }

    val tabLabel = active.label

    // 详情底单选中项（提升到页面层，保证「添加至」回调可用）
    var selected by remember(city) { mutableStateOf<Pair<CitySpotDto, GuideTab>?>(null) }

    Column(Modifier.fillMaxSize().background(ZhijingColors.Bg)) {
        // 顶栏（对齐 RN topBar）
        Row(
            Modifier.fillMaxWidth().background(ZhijingColors.Card).padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier.size(40.dp).clickable { onBack() },
                contentAlignment = Alignment.Center,
            ) {
                Text("‹", fontSize = 24.sp, fontWeight = FontWeight.Light, color = ZhijingColors.Ink)
            }
            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(city, fontSize = 17.sp, fontWeight = FontWeight.ExtraBold, color = ZhijingColors.Ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text("热门目的地", fontSize = 11.sp, color = ZhijingColors.Muted)
            }
            Spacer(Modifier.width(40.dp))
        }

        // Tab 栏（对齐 RN tabBar：文字 + 底部小指示条）
        Row(
            Modifier.fillMaxWidth().background(ZhijingColors.Card),
        ) {
            GuideTab.entries.forEach { t ->
                val on = t == active
                Column(
                    Modifier
                        .weight(1f)
                        .clickable {
                            active = t
                            if (states[t] == null || states[t] is TabState.Idle) load(t)
                        }
                        .padding(top = 12.dp, bottom = 10.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        t.label,
                        fontSize = 15.sp,
                        fontWeight = if (on) FontWeight.ExtraBold else FontWeight.SemiBold,
                        color = if (on) ZhijingColors.Ink else ZhijingColors.Muted,
                    )
                    Spacer(Modifier.height(6.dp))
                    Box(
                        Modifier
                            .width(22.dp)
                            .height(3.dp)
                            .clip(RoundedCornerShape(2.dp))
                            .background(if (on) ZhijingColors.BrandHot else Color.Transparent),
                    )
                }
            }
        }

        // 内容
        when (val st = states[active]) {
            null, TabState.Idle, TabState.Loading -> GridSkeleton()
            TabState.Error -> CenterBlock(
                icon = null,
                text = "${tabLabel}加载失败，请检查网络",
                btnText = "重试",
                onBtn = {
                    states[active] = TabState.Idle
                    load(active)
                },
            )
            is TabState.Ready -> if (st.items.isEmpty()) {
                CenterBlock(
                    icon = "🗺️",
                    text = "暂无${city}的${tabLabel}信息",
                    btnText = "重新搜索",
                    onBtn = {
                        cachedInfo = null
                        states[active] = TabState.Idle
                        load(active)
                    },
                )
            } else {
                GuideGrid(
                    items = st.items,
                    city = city,
                    kind = active.kind,
                    onPick = { selected = it to active },
                )
            }
        }
    }

    // 详情底单（共享组件，对齐 RN CityGuideScreen 复用 PoiDetailSheet）
    val cur = selected
    if (cur != null) {
        PoiDetailSheet(
            item = cur.first,
            category = cur.second.kind,
            city = city,
            onClose = { selected = null },
            onAdd = {
                selected = null
                onOpenGenerate(city)
            },
            onFeedback = { msg ->
                selected = null
                onOpenChat(msg)
            },
        )
    }
}

// ---------- 两列图片网格 ----------

@Composable
private fun GuideGrid(
    items: List<CitySpotDto>,
    city: String,
    kind: String,
    onPick: (CitySpotDto) -> Unit,
) {
    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        modifier = Modifier.fillMaxSize(),
    ) {
        items(items, key = { it.name }) { item ->
            GuideCard(item = item, city = city, kind = kind, onClick = { onPick(item) })
        }
    }
}

@Composable
private fun GuideCard(
    item: CitySpotDto,
    city: String,
    kind: String,
    onClick: () -> Unit,
) {
    // 优先用接口自带图（已 resolve）；无图走 place-images 兜底
    val direct = remember(item.image, item.images) {
        val raw = item.image?.takeIf { it.isNotBlank() }
            ?: item.images.firstOrNull { it.isNotBlank() }
        raw?.let { resolveImageUrl(it) }
    }
    val fallback = rememberPlaceImage(city, item.name, kind, item.poiId.orEmpty())
    val url = direct ?: fallback

    Column(
        Modifier
            .fillMaxWidth()
            .shadow(4.dp, RoundedCornerShape(22.dp))
            .clip(RoundedCornerShape(22.dp))
            .background(ZhijingColors.Card)
            .clickable(onClick = onClick),
    ) {
        Box(Modifier.fillMaxWidth().aspectRatio(1f).background(ZhijingColors.BrandSoft)) {
            if (url != null) {
                AsyncImage(
                    model = url,
                    contentDescription = item.name,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop,
                )
            }
        }
        Text(
            item.name,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            color = ZhijingColors.Ink,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 11.dp),
        )
    }
}

// ---------- 骨架屏（微光呼吸，对齐 RN SkeletonCard） ----------

@Composable
private fun GridSkeleton() {
    val transition = rememberInfiniteTransition(label = "shimmer")
    val alpha by transition.animateFloat(
        initialValue = 0.35f,
        targetValue = 0.9f,
        animationSpec = infiniteRepeatable(tween(800), RepeatMode.Reverse),
        label = "shimmerAlpha",
    )
    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        modifier = Modifier.fillMaxSize(),
    ) {
        items(4) {
            Column(
                Modifier
                    .fillMaxWidth()
                    .shadow(4.dp, RoundedCornerShape(22.dp))
                    .clip(RoundedCornerShape(22.dp))
                    .background(ZhijingColors.Card),
            ) {
                Box(Modifier.fillMaxWidth().aspectRatio(1f).background(Color(0xFFE5E7EB).copy(alpha = alpha)))
                Box(
                    Modifier
                        .padding(horizontal = 10.dp)
                        .padding(top = 11.dp, bottom = 15.dp)
                        .fillMaxWidth(0.55f)
                        .height(12.dp)
                        .clip(RoundedCornerShape(16.dp))
                        .background(Color(0xFFE5E7EB).copy(alpha = alpha)),
                )
            }
        }
    }
}

// ---------- 空态/错误态（对齐 RN center） ----------

@Composable
private fun CenterBlock(icon: String?, text: String, btnText: String, onBtn: () -> Unit) {
    Column(
        Modifier.fillMaxSize().padding(40.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        if (icon != null) {
            Text(icon, fontSize = 40.sp)
            Spacer(Modifier.height(12.dp))
        }
        Text(
            text,
            fontSize = 14.sp,
            color = ZhijingColors.Muted,
            textAlign = TextAlign.Center,
            lineHeight = 20.sp,
        )
        Spacer(Modifier.height(20.dp))
        Box(
            Modifier
                .clip(RoundedCornerShape(22.dp))
                .background(ZhijingColors.BrandHot)
                .clickable(onClick = onBtn)
                .padding(horizontal = 24.dp, vertical = 12.dp),
        ) {
            Text(btnText, fontSize = 15.sp, fontWeight = FontWeight.Bold, color = Color.White)
        }
    }
}
