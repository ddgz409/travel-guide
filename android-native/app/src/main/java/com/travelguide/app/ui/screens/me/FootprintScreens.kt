package com.travelguide.app.ui.screens.me

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.AnimationVector1D
import androidx.compose.animation.core.Easing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.travelguide.app.data.local.CheckInRecord
import com.travelguide.app.data.local.CheckInStore
import com.travelguide.app.data.util.ContinentId
import com.travelguide.app.data.util.FootprintListKind
import com.travelguide.app.data.util.buildFootprintStats
import com.travelguide.app.data.util.formatCheckDate
import com.travelguide.app.data.util.listFootprintEntries
import com.travelguide.app.ui.theme.ZhijingColors
import kotlin.math.PI
import kotlin.math.cos

/** 足迹簇（对齐 RN FootprintOverview/FootprintList/FootprintWeatherCard/DottedWorldMap） */

private val XL = 20.dp

// ---------- 点阵世界地图 ----------

/** . 海洋  N北美  S南美  E欧洲  F非洲  A亚洲  O大洋洲  T南极（逐行照抄 RN） */
private val WORLD = listOf(
    "..............NN.NN.........................AAAAAAAAAA.................",
    "...........NNNNNNNNNN.........NN.........AAAAAAAAAAAAAAA...............",
    ".........NNNNNNNNNNNNN......NNNNN.......AAAAAAAAAAAAAAAAA..............",
    ".......NNNNNNNN..NNNNNN.....NNNNN......AAAAAAAAAAAAAAAAAAA.............",
    "......NNNNNNNNN...NNNNN.....NNNN.......AAAAAAAAAAAAAAAAAAAA............",
    ".....NNNNNNNNNNN..NNNN......NNN.E......AAAAAAAAAAAAAAAAAAAAA...........",
    ".....NNNNNNNNNNNN.NNN........EEEE......AAAAAAAAAAAAAAAAAAAAAA..........",
    ".....NNNNNNNNNNNNNNN........EEEEE......AAAAAAAAAAAAAAAAAAAAAAA.........",
    ".....NNNNNNNNNNNNNN.........EEEEE......AAAAAAAAAAAAAAAAAAAAAAA.AA......",
    "......NNNNNNNNNNNN..........EEEEE.......AAAAAAAAAAAAAAAAAAAAAAA.A......",
    ".......NNNNNNNNNNN..........EEEE........AAAAAAAAAAAAAAAAAAAAAAA........",
    "........NNNNNNNNN...........EEE.F.......AAAAAAAAAAAAAAAAAAAAAA.........",
    ".........NNNNNNN.............FFFFF......A.AAAAAAAAAAAAAAAAAAAA.........",
    "..........NNNNN..............FFFFFF.....AAAAAAAAAAAAAAAAAAAAA..........",
    "...........NNNN.............FFFFFFFF....AAAAAAAAAAAAAAAAAAAA...........",
    "............NN..............FFFFFFFFF...AAAAAAAAAAAAAAAAAAA............",
    "............N...............FFFFFFFFFF..AAAAAAAAAAAAAAA................",
    "...........N.N..............FFFFFFFFFF...AAAAAAAAAAAAA......A..........",
    "............S...............FFFFFFFFFF....AAAAAAAAAAA......AAA.........",
    "...........SSS..............FFFFFFFFF......AAAAAAAAA......AAAAA........",
    "..........SSSSS.............FFFFFFFF........AAAAAAA.......AAAAA........",
    ".........SSSSSS.............FFFFFFF..........AAAAA.........AAA.........",
    "........SSSSSSS.............FFFFFF............AA..........OO...........",
    "........SSSSSSS..............FFFFF.......................OOOO..........",
    ".......SSSSSSSS...............FFFF......................OOOOOO.........",
    ".......SSSSSSS.................FFF.........F............OOOOOOO........",
    "........SSSSSS..................FF.........F.............OOOOOO........",
    ".........SSSSS............................................OOOO.........",
    "..........SSSS.............................................OOO.....O...",
    "...........SSS..............................................O......OO..",
    "............SS.........................................................",
    ".............S.........................................................",
    ".......................................................................",
    "...TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT.....",
    "..TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT....",
    "...TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT.....",
)

private val WORLD_COLS = WORLD.maxOf { it.length }
private val WORLD_ROWS = WORLD.map { it.padEnd(WORLD_COLS, '.') }

private val CHAR_TO_CONTINENT = mapOf(
    'N' to ContinentId.NA, 'S' to ContinentId.SA, 'E' to ContinentId.EU,
    'F' to ContinentId.AF, 'A' to ContinentId.AS, 'O' to ContinentId.OC,
    'T' to ContinentId.AN,
)

private val DOT_ON = Color(0xFF3D9A5C)
private val DOT_OFF = Color(0xFFC2C2C2)

@Composable
fun DottedWorldMap(visited: List<ContinentId>) {
    val on = remember(visited) { visited.toSet() }
    Canvas(
        Modifier
            .fillMaxWidth()
            .aspectRatio(WORLD_COLS.toFloat() / WORLD_ROWS.size),
    ) {
        val cell = size.width / WORLD_COLS
        val gap = maxOf(0.55f, cell * 0.2f)
        val dot = maxOf(2f, cell - gap)
        WORLD_ROWS.forEachIndexed { r, row ->
            row.forEachIndexed { c, ch ->
                CHAR_TO_CONTINENT[ch]?.let { id ->
                    drawCircle(
                        color = if (id in on) DOT_ON else DOT_OFF,
                        radius = dot / 2,
                        center = Offset(c * cell + cell / 2, r * cell + cell / 2),
                    )
                }
            }
        }
    }
}

// ---------- 天气卡（波浪装饰） ----------

private data class WavePalette(val base: Color, val light: Color, val mid: Color, val deep: Color)

private val PALETTES = listOf(
    WavePalette(Color(0xFFB9D9F5), Color(0xB8E8F4FC), Color(0x6B9CCCec), Color(0x4778B8E4)),
    WavePalette(Color(0xFFC5E3F7), Color(0xB3ECF7FF), Color(0x66A4D2F0), Color(0x4282BEE6)),
    WavePalette(Color(0xFFD6EAFB), Color(0xBFF5FBFF), Color(0x61AAD6F2), Color(0x3D8CC4E8)),
)

/** RN Easing.inOut(Easing.sin) */
private val SinInOut = Easing { x -> (1 - cos(PI * x)).toFloat() / 2f }

@Composable
fun FootprintWeatherCard(
    kind: FootprintListKind,
    title: String,
    sub: String? = null,
    province: String? = null,
    time: String? = null,
    tint: Int = 0,
) {
    val palette = PALETTES[Math.floorMod(tint, PALETTES.size)]
    val shift = remember { Animatable(0f) }
    LaunchedEffect(tint) {
        shift.animateTo(
            targetValue = 1f,
            animationSpec = infiniteRepeatable(
                animation = tween(5200 + tint * 400, easing = SinInOut),
                repeatMode = RepeatMode.Reverse,
            ),
        )
    }

    val s = shift.value
    // 三个波浪圆的基准位置 + 位移公式（逐条对齐 RN waveA/B/C）
    Box(
        Modifier
            .fillMaxWidth()
            .height(96.dp)
            .shadow(6.dp, RoundedCornerShape(XL))
            .clip(RoundedCornerShape(XL))
            .background(palette.base)
            .padding(horizontal = 18.dp, vertical = 14.dp),
    ) {
        androidx.compose.foundation.Canvas(Modifier.fillMaxSize()) {
            val dpx = 1.dp.toPx()
            fun blob(baseX: Float, baseY: Float, dx: Float, dy: Float, w: Float, h: Float, color: Color) {
                drawRoundRect(
                    color = color,
                    topLeft = Offset((baseX + dx) * dpx, (baseY + dy) * dpx),
                    size = Size(w * dpx, h * dpx),
                    cornerRadius = CornerRadius(999 * dpx),
                )
            }
            blob(-40f, -50f, -18 + s * 28, -8 + s * 10, 220f, 140f, palette.light)
            // waveB 锚在右下角：right:-50 bottom:-60 → x = width-200+50, y = height-130+60
            blob(size.width / dpx - 150f, size.height / dpx - 70f, 22 - s * 24, 12 - s * 8, 200f, 130f, palette.mid)
            blob(80f, 40f, -8 + s * 16, 6 - s * 14, 180f, 110f, palette.deep)
        }
        Row(Modifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically) {
            Column(
                Modifier.weight(1f).height(64.dp),
                verticalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    title,
                    fontSize = 22.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = Color(0xFF1A3A55),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                val bottom = if (kind == FootprintListKind.CITY) province.orEmpty() else sub.orEmpty()
                Text(
                    bottom,
                    fontSize = 13.sp,
                    fontWeight = if (kind == FootprintListKind.COUNTRY) FontWeight.Medium else FontWeight.SemiBold,
                    letterSpacing = if (kind == FootprintListKind.COUNTRY) 0.3.sp else 0.sp,
                    color = Color(0xFF4A6A82),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Spacer(Modifier.width(12.dp))
            Text(
                time.orEmpty(),
                fontSize = 16.sp,
                fontWeight = FontWeight.ExtraBold,
                color = Color(0xFF1A3A55),
            )
        }
    }
}

// ---------- 总览页 ----------

@Composable
fun FootprintOverviewScreen(
    onBack: () -> Unit,
    onOpenList: (FootprintListKind) -> Unit,
    onOpenCheckInMap: () -> Unit = {},
) {
    var items by remember { mutableStateOf(emptyList<CheckInRecord>()) }
    LaunchedEffect(Unit) { items = CheckInStore.list() }

    val stats = remember(items) { buildFootprintStats(items) }
    val empty = stats.placeCount == 0

    Column(Modifier.fillMaxSize().background(ZhijingColors.BgSurface)) {
        FootprintHeader("概览", onBack)

        if (empty) {
            Column(
                Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Spacer(Modifier.height(60.dp))
                Text(
                    "这里空空如也~",
                    fontSize = 26.sp,
                    fontStyle = FontStyle.Italic,
                    color = Color(0xFF8A94A8),
                    letterSpacing = 1.sp,
                )
            }
        } else {
            Column(
                Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp),
            ) {
                Spacer(Modifier.height(4.dp))

                // 统计四宫格（国家/城市可点进列表）
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    StatCard("${stats.countryCount} 国家", "🌍 到过的国家/地区", Modifier.weight(1f)) {
                        onOpenList(FootprintListKind.COUNTRY)
                    }
                    StatCard("${stats.cityCount} 城市", "🏙 打卡过的城市", Modifier.weight(1f)) {
                        onOpenList(FootprintListKind.CITY)
                    }
                }
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    StatCard("${stats.placeCount} 地点", "📍 打卡地点", Modifier.weight(1f)) {
                        onOpenList(FootprintListKind.PLACE)
                    }
                    Column(
                        Modifier
                            .weight(1f)
                            .defaultMinSize(minHeight = 100.dp)
                            .shadow(6.dp, RoundedCornerShape(XL))
                            .clip(RoundedCornerShape(XL))
                            .background(Color(0xFFE7F6DC))
                            .padding(16.dp),
                    ) {
                        Text(stats.topSeason ?: "—", fontSize = 28.sp, fontWeight = FontWeight.ExtraBold, color = ZhijingColors.Ink)
                        Spacer(Modifier.height(6.dp))
                        Text("出行最多的季节", fontSize = 13.sp, color = ZhijingColors.Muted)
                    }
                }
                Spacer(Modifier.height(12.dp))

                Box(
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(ZhijingColors.BrandSoft)
                        .clickable { onOpenCheckInMap() }
                        .padding(vertical = 14.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("查看打卡地图 ›", fontSize = 15.sp, color = ZhijingColors.BrandHot, fontWeight = FontWeight.SemiBold)
                }

                Spacer(Modifier.height(12.dp))

                // 去过最远的地方
                stats.farthest?.let { far ->
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .shadow(6.dp, RoundedCornerShape(XL))
                            .clip(RoundedCornerShape(XL))
                            .background(Color(0xFFDCEBFF))
                            .padding(18.dp),
                    ) {
                        Column {
                            Text("去过最远的地方", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Color(0xFF4A5A78))
                            Spacer(Modifier.height(8.dp))
                            Text(far.city, fontSize = 28.sp, fontWeight = FontWeight.ExtraBold, color = ZhijingColors.Ink)
                            Spacer(Modifier.height(8.dp))
                            Text(
                                "国家/地区: 中国\n地点: ${far.name}",
                                fontSize = 13.sp,
                                color = Color(0xFF5A6578),
                                lineHeight = 20.sp,
                            )
                        }
                        Box(
                            Modifier
                                .align(Alignment.TopEnd)
                                .clip(RoundedCornerShape(16.dp))
                                .background(Color(0xFFF6E08B))
                                .padding(horizontal = 10.dp, vertical = 4.dp),
                        ) {
                            Text(formatCheckDate(far.checkedAt), fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, color = ZhijingColors.Ink)
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                }

                // 最北/最南翻页卡
                val north = stats.northernmost
                val south = stats.southernmost
                if (north != null && south != null) {
                    PolePager(north, south)
                    Spacer(Modifier.height(12.dp))
                }

                // 打卡的大洲（点阵世界地图）
                Column(
                    Modifier
                        .fillMaxWidth()
                        .shadow(6.dp, RoundedCornerShape(XL))
                        .clip(RoundedCornerShape(XL))
                        .background(Color(0xFFD8F0E2))
                        .border(3.dp, Color(0xFF7BC48F), RoundedCornerShape(XL))
                        .padding(12.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(horizontal = 4.dp)) {
                        Text(
                            "<<< 打卡的大洲 " + "<".repeat(24),
                            fontSize = 13.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = Color(0xFF2E5C4A),
                            letterSpacing = 0.4.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Clip,
                            modifier = Modifier.weight(1f),
                        )
                        Spacer(Modifier.width(8.dp))
                        Text("${stats.continentCount}", fontSize = 32.sp, fontWeight = FontWeight.ExtraBold, color = Color(0xFF2E5C4A))
                    }
                    Spacer(Modifier.height(6.dp))
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .padding(bottom = 8.dp)
                            .drawBehind {
                                val y = size.height - 1
                                drawLine(Color(0xFF7BC48F), Offset(0f, y), Offset(size.width, y), 1.dp.toPx())
                            },
                    ) {
                        DottedWorldMap(stats.visitedContinents)
                    }
                }
                Spacer(Modifier.height(12.dp))

                // 去过最多的地点类型
                stats.topCategory?.let { (label, count) ->
                    Column(
                        Modifier
                            .fillMaxWidth()
                            .shadow(6.dp, RoundedCornerShape(XL))
                            .clip(RoundedCornerShape(XL))
                            .background(Color(0xFFF0D48A))
                            .padding(18.dp),
                    ) {
                        Text("去过最多的地点类型", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Color(0xFF4A5A78))
                        Spacer(Modifier.height(12.dp))
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(16.dp))
                                .background(Color(0xFF4A3728))
                                .padding(14.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(label, fontSize = 22.sp, fontWeight = FontWeight.ExtraBold, color = Color(0xFFF6E08B))
                            Text("$count", fontSize = 28.sp, fontWeight = FontWeight.ExtraBold, color = Color.White)
                        }
                    }
                }
                Spacer(Modifier.height(88.dp))
            }
        }
    }
}

/** 最北/最南水平翻页（对齐 RN PolePager） */
@Composable
private fun PolePager(north: CheckInRecord, south: CheckInRecord) {
    val pages = listOf("去过最北的地方" to north, "去过最南的地方" to south)
    val pagerState = rememberPagerState { pages.size }

    Box(
        Modifier
            .fillMaxWidth()
            .shadow(6.dp, RoundedCornerShape(XL))
            .clip(RoundedCornerShape(XL))
            .background(Color(0xFF5C4033)),
    ) {
        HorizontalPager(state = pagerState) { page ->
            val (title, item) = pages[page]
            Column(
                Modifier
                    .fillMaxWidth()
                    .defaultMinSize(minHeight = 132.dp)
                    .padding(start = 18.dp, end = 18.dp, top = 18.dp, bottom = 28.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Text(title, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Color(0xFFE8D5C4))
                Spacer(Modifier.height(16.dp))
                Text(
                    item.name,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = Color.White,
                    textAlign = TextAlign.Center,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                if (item.city.isNotBlank()) {
                    Spacer(Modifier.height(8.dp))
                    Text(item.city, fontSize = 13.sp, color = Color(0xD9E8D5C4), textAlign = TextAlign.Center, maxLines = 1)
                }
            }
        }
        Row(
            Modifier.align(Alignment.BottomCenter).padding(bottom = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            pages.forEachIndexed { i, _ ->
                val active = pagerState.currentPage == i
                Box(
                    Modifier
                        .height(6.dp)
                        .width(if (active) 14.dp else 6.dp)
                        .clip(RoundedCornerShape(3.dp))
                        .background(if (active) Color.White else Color(0x47FFFFFF)),
                )
            }
        }
    }
}

@Composable
private fun StatCard(num: String, label: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Column(
        modifier
            .defaultMinSize(minHeight = 100.dp)
            .shadow(6.dp, RoundedCornerShape(XL))
            .clip(RoundedCornerShape(XL))
            .background(Color.White)
            .clickable { onClick() }
            .padding(16.dp),
    ) {
        Text(num, fontSize = 28.sp, fontWeight = FontWeight.ExtraBold, color = ZhijingColors.Ink)
        Spacer(Modifier.height(6.dp))
        Text(label, fontSize = 13.sp, color = ZhijingColors.Muted)
    }
}

@Composable
internal fun FootprintHeader(title: String, onBack: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            "‹ 返回",
            fontSize = 16.sp,
            fontWeight = FontWeight.Bold,
            color = ZhijingColors.Ink,
            modifier = Modifier.width(48.dp).clickable { onBack() },
        )
        Text(
            title,
            fontSize = 20.sp,
            fontWeight = FontWeight.ExtraBold,
            color = ZhijingColors.Ink,
            textAlign = TextAlign.Center,
            modifier = Modifier.weight(1f),
        )
        Spacer(Modifier.width(48.dp))
    }
}

// ---------- 足迹列表页 ----------

@Composable
fun FootprintListScreen(kind: FootprintListKind, onBack: () -> Unit) {
    val title = when (kind) {
        FootprintListKind.COUNTRY -> "到过的国家"
        FootprintListKind.CITY -> "打卡过的城市"
        FootprintListKind.PLACE -> "打卡地点"
    }
    val section = when (kind) {
        FootprintListKind.COUNTRY -> "已到过的国家"
        FootprintListKind.CITY -> "已打卡城市"
        FootprintListKind.PLACE -> "已打卡地点"
    }

    var items by remember { mutableStateOf(emptyList<CheckInRecord>()) }
    LaunchedEffect(Unit) { items = CheckInStore.list() }
    val entries = remember(items, kind) { listFootprintEntries(items, kind) }

    Column(Modifier.fillMaxSize().background(ZhijingColors.BgSurface)) {
        FootprintHeader(title, onBack)
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (entries.isEmpty()) {
                item {
                    Text(
                        "这里空空如也~",
                        fontSize = 15.sp,
                        color = ZhijingColors.Muted,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth().padding(top = 48.dp),
                    )
                }
            } else {
                item {
                    Text(section, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = ZhijingColors.Muted)
                }
                items(entries, key = { it.key }) { row ->
                    val tint = entries.indexOf(row)
                    FootprintWeatherCard(
                        kind = kind,
                        title = row.title,
                        sub = row.sub,
                        province = row.province,
                        time = row.time,
                        tint = tint,
                    )
                }
            }
        }
    }
}
