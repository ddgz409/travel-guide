package com.travelguide.app.ui.screens.explore

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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.travelguide.app.data.api.ApiClient
import com.travelguide.app.data.api.UserBrief
import com.travelguide.app.data.api.absServerPath
import com.travelguide.app.ui.components.UserAvatar
import com.travelguide.app.ui.theme.ZhijingColors

/** 关注/粉丝 Tab（对齐 RN FollowListScreen Tab） */
private enum class FollowTab(val key: String, val label: String) {
    FOLLOWERS("followers", "粉丝"),
    FOLLOWING("following", "关注"),
}

/** 关注/粉丝名单（对齐 RN FollowListScreen） */
@Composable
fun FollowListScreen(
    userId: String,
    username: String,
    initialTab: String,
    onBack: () -> Unit,
    onOpenProfile: (userId: String, username: String) -> Unit,
) {
    var tab by remember {
        mutableStateOf(FollowTab.entries.firstOrNull { it.key == initialTab } ?: FollowTab.FOLLOWERS)
    }
    var items by remember { mutableStateOf(emptyList<UserBrief>()) }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(userId, tab) {
        loading = true
        items = runCatching {
            if (tab == FollowTab.FOLLOWERS) ApiClient.users.followers(userId)
            else ApiClient.users.following(userId)
        }.getOrNull()?.items.orEmpty()
        loading = false
    }

    Column(Modifier.fillMaxSize().background(ZhijingColors.Bg)) {
        Row(
            Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                "‹ 返回",
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                color = ZhijingColors.BrandHot,
                modifier = Modifier.clickable { onBack() },
            )
            Text(username, fontSize = 16.sp, fontWeight = FontWeight.ExtraBold, color = ZhijingColors.Ink)
            Spacer(Modifier.width(48.dp))
        }

        // 分段 Tab：粉底圆角容器 + 白色选中块（对齐 RN followListStyles.tabs）
        Row(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 0.dp)
                .padding(top = 6.dp, bottom = 10.dp)
                .clip(RoundedCornerShape(14.dp))
                .background(ZhijingColors.BgSurface)
                .padding(3.dp),
        ) {
            FollowTab.entries.forEach { t ->
                val on = tab == t
                Box(
                    Modifier
                        .weight(1f)
                        .height(36.dp)
                        .clip(RoundedCornerShape(11.dp))
                        .background(if (on) Color.White else Color.Transparent)
                        .clickable { tab = t },
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        t.label,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (on) ZhijingColors.Ink else ZhijingColors.Muted,
                    )
                }
            }
        }

        when {
            loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = ZhijingColors.BrandHot)
            }
            items.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
                Text(
                    if (tab == FollowTab.FOLLOWERS) "还没有粉丝" else "还没有关注任何人",
                    fontSize = 14.sp,
                    color = ZhijingColors.Muted,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 32.dp),
                )
            }
            else -> LazyColumn(contentPadding = PaddingValues(start = 20.dp, end = 20.dp, bottom = 32.dp)) {
                items(items, key = { it.id }) { u ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .clickable { onOpenProfile(u.id, u.username) }
                            .padding(vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        UserAvatar(
                            name = u.username,
                            size = 40.dp,
                            imageUri = absServerPath(u.avatar),
                        )
                        Text(
                            u.username,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold,
                            color = ZhijingColors.Ink,
                            modifier = Modifier.weight(1f),
                        )
                        Text("›", fontSize = 15.sp, color = ZhijingColors.Muted)
                    }
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .height(0.5.dp)
                            .background(ZhijingColors.Line),
                    )
                }
            }
        }
    }
}
