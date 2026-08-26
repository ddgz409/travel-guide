package com.travelguide.app.ui.screens.me

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.travelguide.app.data.api.ApiClient
import com.travelguide.app.data.api.CollectionSummary
import com.travelguide.app.data.api.absServerPath
import com.travelguide.app.data.model.User
import com.travelguide.app.ui.screens.explore.CollectionCard
import com.travelguide.app.ui.theme.ZhijingColors

/**
 * 我的（对齐 RN MeScreen）：头像 + 用户名 + 收藏/订阅小卡 + 足迹卡。
 * 足迹/收藏本地存储与头像裁剪为后续阶段，先复原框架与入口。
 */
@Composable
fun MeScreen(
    onOpenSettings: () -> Unit,
    onOpenFavorites: () -> Unit,
    onOpenSubscriptions: () -> Unit,
    onOpenFootprints: () -> Unit,
) {
    var user by remember { mutableStateOf<User?>(null) }
    LaunchedEffect(Unit) {
        user = runCatching { ApiClient.auth.me() }.getOrNull()
    }

    LazyColumn(
        Modifier.fillMaxSize().background(ZhijingColors.Bg),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp),
    ) {
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                Box(
                    Modifier
                        .size(38.dp)
                        .shadow(6.dp, CircleShape)
                        .clip(CircleShape)
                        .background(Color.White)
                        .clickable { onOpenSettings() },
                    contentAlignment = Alignment.Center,
                ) { Text("⚙", fontSize = 18.sp) }
            }
            Spacer(Modifier.height(6.dp))

            // 头像 + 用户名
            Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                AvatarCircle(user, 110.dp)
                Spacer(Modifier.height(10.dp))
                Text(
                    user?.username ?: "…",
                    fontSize = 19.sp,
                    fontWeight = FontWeight.Bold,
                    color = ZhijingColors.Ink,
                )
                Spacer(Modifier.height(6.dp))
                Box(
                    Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .background(ZhijingColors.BrandSoft)
                        .clickable { onOpenFootprints() }
                        .padding(horizontal = 14.dp, vertical = 7.dp),
                ) {
                    Text("➕ 添加足迹", fontSize = 12.sp, color = ZhijingColors.BrandHot, fontWeight = FontWeight.SemiBold)
                }
            }
            Spacer(Modifier.height(20.dp))

            // 收藏 / 订阅小卡
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                MiniCard("⭐", "我的收藏", "收藏夹与地点", Modifier.weight(1f), onOpenFavorites)
                MiniCard("🔔", "我的订阅", "探索页共享收藏夹", Modifier.weight(1f), onOpenSubscriptions)
            }
            Spacer(Modifier.height(12.dp))

            // 足迹卡
            Column(
                Modifier
                    .fillMaxWidth()
                    .shadow(6.dp, RoundedCornerShape(20.dp))
                    .clip(RoundedCornerShape(20.dp))
                    .background(ZhijingColors.Card)
                    .clickable { onOpenFootprints() }
                    .padding(18.dp),
            ) {
                Text("我的足迹", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = ZhijingColors.Ink)
                Spacer(Modifier.height(10.dp))
                Text(
                    "这里空空如也~\n去过哪里，点亮哪里的足迹地图",
                    fontSize = 13.sp,
                    color = ZhijingColors.Muted,
                    lineHeight = 20.sp,
                )
            }
        }
    }
}

@Composable
private fun AvatarCircle(user: User?, size: androidx.compose.ui.unit.Dp) {
    val url = absServerPath(user?.avatar)
    Box(
        Modifier
            .size(size)
            .shadow(8.dp, CircleShape)
            .clip(CircleShape)
            .background(ZhijingColors.BrandSoft),
        contentAlignment = Alignment.Center,
    ) {
        if (url != null) {
            AsyncImage(
                model = url,
                contentDescription = "头像",
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop,
            )
        } else {
            Text(
                (user?.username ?: "客").take(1),
                fontSize = 40.sp,
                fontWeight = FontWeight.Bold,
                color = ZhijingColors.BrandHot,
            )
        }
    }
}

@Composable
private fun MiniCard(icon: String, title: String, sub: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Column(
        modifier
            .shadow(6.dp, RoundedCornerShape(18.dp))
            .clip(RoundedCornerShape(18.dp))
            .background(ZhijingColors.Card)
            .clickable { onClick() }
            .padding(14.dp),
    ) {
        Text(icon, fontSize = 22.sp)
        Spacer(Modifier.height(8.dp))
        Text(title, fontSize = 14.sp, fontWeight = FontWeight.Bold, color = ZhijingColors.Ink)
        Spacer(Modifier.height(3.dp))
        Text(sub, fontSize = 11.sp, color = ZhijingColors.Muted, maxLines = 1)
    }
}

/** 我的收藏（RN 版为本地收藏库，原生版后续移植；先复原入口与空态） */
@Composable
fun FavoritesScreen(onBack: () -> Unit) {
    SimpleScaffold("我的收藏", onBack) {
        EmptyHint("⭐", "还没有收藏", "行程详情里的收藏功能正在移植中")
    }
}

/** 我的订阅：已订阅的共享收藏夹（对齐 RN MySubscriptionsScreen） */
@Composable
fun MySubscriptionsScreen(onBack: () -> Unit, onOpenDetail: (String) -> Unit) {
    var items by remember { mutableStateOf(emptyList<CollectionSummary>()) }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(Unit) {
        items = runCatching { ApiClient.collections.subscribed().items }.getOrDefault(emptyList())
        loading = false
    }

    Column(Modifier.fillMaxSize().background(ZhijingColors.Bg)) {
        SubHeader("我的订阅", onBack)
        if (loading) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = ZhijingColors.BrandHot)
            }
        } else if (items.isEmpty()) {
            EmptyHint("🔔", "还没有订阅", "去探索页订阅喜欢的收藏夹")
        } else {
            LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp)) {
                items(items, key = { it.id }) { item ->
                    CollectionCard(item = item, onPress = { onOpenDetail(item.id) })
                }
            }
        }
    }
}

/** 足迹总览（RN 版为本地打卡记录，原生版后续移植；先复原入口与空态） */
@Composable
fun FootprintOverviewScreen(onBack: () -> Unit) {
    SimpleScaffold("我的足迹", onBack) {
        EmptyHint("👣", "这里空空如也~", "添加足迹功能正在移植中，敬请期待")
    }
}

@Composable
private fun SimpleScaffold(title: String, onBack: () -> Unit, content: @Composable () -> Unit) {
    Column(Modifier.fillMaxSize().background(ZhijingColors.Bg)) {
        SubHeader(title, onBack)
        content()
    }
}

@Composable
private fun SubHeader(title: String, onBack: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            "‹ 返回",
            fontSize = 15.sp,
            color = ZhijingColors.BrandHot,
            modifier = Modifier.clickable { onBack() },
        )
        Spacer(Modifier.weight(1f))
        Text(title, fontSize = 16.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.weight(1f))
        Spacer(Modifier.width(44.dp))
    }
}

@Composable
private fun EmptyHint(emoji: String, title: String, sub: String) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(emoji, fontSize = 40.sp)
            Spacer(Modifier.height(12.dp))
            Text(title, fontSize = 15.sp, fontWeight = FontWeight.Bold, color = ZhijingColors.Ink)
            Spacer(Modifier.height(6.dp))
            Text(sub, fontSize = 12.sp, color = ZhijingColors.Muted)
        }
    }
}
