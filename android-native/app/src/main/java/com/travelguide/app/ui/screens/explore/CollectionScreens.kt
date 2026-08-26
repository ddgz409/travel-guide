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
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.travelguide.app.data.api.ApiClient
import com.travelguide.app.data.api.CollectionDetail
import com.travelguide.app.data.api.CollectionPlace
import com.travelguide.app.data.api.CollectionSummary
import com.travelguide.app.data.api.CommentCreate
import com.travelguide.app.data.api.CommentOut
import com.travelguide.app.data.api.absServerPath
import com.travelguide.app.ui.components.rememberPlaceImage
import com.travelguide.app.ui.theme.ZhijingColors
import kotlinx.coroutines.launch

/** 收藏夹封面统计文案（对齐 RN formatCollectionMeta） */
private fun collectionMeta(places: Int, subs: Int, likes: Int) =
    "$places 地点 · $subs 订阅 · $likes 喜欢"

/** 探索页共享收藏夹卡片（对齐 RN CollectionCard） */
@Composable
fun CollectionCard(
    item: CollectionSummary,
    onPress: () -> Unit,
    onDelete: (() -> Unit)? = null,
    onAuthorPress: (() -> Unit)? = null,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(bottom = 12.dp)
            .shadow(6.dp, RoundedCornerShape(22.dp))
            .clip(RoundedCornerShape(22.dp))
            .background(ZhijingColors.Card)
            .clickable { onPress() }
            .padding(14.dp),
    ) {
        CollectionFolder(
            cover = item.coverPlaces.firstOrNull(),
            fallbackCity = item.city,
            emoji = item.emoji,
        )
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(
                item.title,
                fontSize = 16.sp,
                fontWeight = FontWeight.ExtraBold,
                color = ZhijingColors.Ink,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                lineHeight = 21.sp,
            )
            Spacer(Modifier.height(4.dp))
            val author = item.authorDisplay.ifBlank { "旅人" }
            if (onAuthorPress != null) {
                Text(
                    "by $author ›",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    color = ZhijingColors.BrandHot,
                    maxLines = 1,
                    modifier = Modifier.clickable { onAuthorPress() },
                )
            } else {
                Text("by $author", fontSize = 12.sp, color = ZhijingColors.Muted, maxLines = 1)
            }
            Spacer(Modifier.height(6.dp))
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    collectionMeta(item.placeCount, item.subscriberCount, item.likeCount),
                    fontSize = 11.sp,
                    color = ZhijingColors.Muted,
                )
                if (onDelete != null) {
                    Text(
                        "删除",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = ZhijingColors.Danger,
                        modifier = Modifier
                            .clip(RoundedCornerShape(12.dp))
                            .background(Color(0xB3FFFFFF))
                            .clickable { onDelete() }
                            .padding(horizontal = 10.dp, vertical = 4.dp),
                    )
                }
            }
        }
    }
}

/** 文件夹拼贴封面：底板 + 首张地点照片 + emoji（对齐 RN 简化） */
@Composable
private fun CollectionFolder(cover: CollectionPlace?, fallbackCity: String?, emoji: String) {
    Box(Modifier.size(88.dp)) {
        Box(
            Modifier
                .offset(x = 6.dp, y = 10.dp)
                .fillMaxSize()
                .clip(RoundedCornerShape(14.dp))
                .background(Color(0xFFECEFF3)),
        )
        val city = cover?.city ?: fallbackCity ?: "北京"
        val name = cover?.name ?: (fallbackCity ?: "景点")
        val url = rememberPlaceImage(city, name, "spots", cover?.poiId.orEmpty())
        Box(
            Modifier
                .offset(x = 10.dp, y = 6.dp)
                .size(56.dp)
                .graphicsLayer(rotationZ = -6f)
                .clip(RoundedCornerShape(10.dp))
                .background(ZhijingColors.BrandSoft),
        ) {
            if (url != null) {
                AsyncImage(
                    model = url,
                    contentDescription = name,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop,
                )
            }
        }
        Text(emoji, fontSize = 22.sp, modifier = Modifier.align(Alignment.BottomStart))
    }
}

/** 大家的收藏夹（对齐 RN SharedCollectionsScreen；发布入口待移植） */
@Composable
fun SharedCollectionsScreen(
    onBack: () -> Unit,
    onOpenDetail: (String) -> Unit,
    onOpenAuthor: (String, String) -> Unit,
) {
    var items by remember { mutableStateOf(emptyList<CollectionSummary>()) }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(Unit) {
        items = runCatching { ApiClient.collections.list(50).items }.getOrDefault(emptyList())
        loading = false
    }

    Column(Modifier.fillMaxSize().background(ZhijingColors.Bg)) {
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
            Text("大家的收藏夹", fontSize = 16.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.weight(1f))
            Spacer(Modifier.width(44.dp))
        }

        // 共享计划横幅
        Column(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
                .clip(RoundedCornerShape(18.dp))
                .background(ZhijingColors.BrandSoft)
                .padding(16.dp),
        ) {
            Text("地球角落 共享计划", fontSize = 15.sp, fontWeight = FontWeight.Bold, color = ZhijingColors.Ink)
            Spacer(Modifier.height(4.dp))
            Text("编辑地点与文案，分享给更多旅人", fontSize = 12.sp, color = ZhijingColors.Muted)
        }
        Spacer(Modifier.height(12.dp))

        if (loading) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = ZhijingColors.BrandHot)
            }
        } else {
            LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp)) {
                if (items.isEmpty()) {
                    item {
                        Box(Modifier.fillMaxWidth().padding(vertical = 48.dp), contentAlignment = Alignment.Center) {
                            Text("还没有共享收藏夹，来做第一个吧", fontSize = 13.sp, color = ZhijingColors.Muted)
                        }
                    }
                }
                items(items, key = { it.id }) { item ->
                    CollectionCard(
                        item = item,
                        onPress = { onOpenDetail(item.id) },
                        onAuthorPress = item.authorId?.let { uid ->
                            { onOpenAuthor(uid, item.authorDisplay) }
                        },
                    )
                }
            }
        }
    }
}

/** 合集详情：地点清单 + 订阅/喜欢 + 评论（对齐 RN CollectionDetailScreen 核心） */
@Composable
fun CollectionDetailScreen(
    collectionId: String,
    onBack: () -> Unit,
    onOpenAuthor: (String, String) -> Unit,
) {
    val scope = rememberCoroutineScope()
    var detail by remember { mutableStateOf<CollectionDetail?>(null) }
    var comments by remember { mutableStateOf(emptyList<CommentOut>()) }
    var commentText by remember { mutableStateOf("") }
    var commentBusy by remember { mutableStateOf(false) }

    LaunchedEffect(collectionId) {
        detail = runCatching { ApiClient.collections.detail(collectionId) }.getOrNull()
        comments = runCatching { ApiClient.collections.comments(collectionId).items }.getOrDefault(emptyList())
    }

    fun toggleSubscribe() {
        val d = detail ?: return
        val next = !d.subscribed
        detail = d.copy(
            subscribed = next,
            subscriberCount = d.subscriberCount + if (next) 1 else -1,
        )
        scope.launch {
            runCatching {
                if (next) ApiClient.collections.subscribe(collectionId)
                else ApiClient.collections.unsubscribe(collectionId)
            }
        }
    }

    fun toggleLike() {
        val d = detail ?: return
        val next = !d.liked
        detail = d.copy(liked = next, likeCount = d.likeCount + if (next) 1 else -1)
        scope.launch {
            runCatching {
                if (next) ApiClient.collections.like(collectionId)
                else ApiClient.collections.unlike(collectionId)
            }
        }
    }

    fun sendComment() {
        val text = commentText.trim()
        if (text.isEmpty() || commentBusy) return
        commentBusy = true
        scope.launch {
            val saved = runCatching {
                ApiClient.collections.addComment(collectionId, CommentCreate(text))
            }.getOrNull()
            if (saved != null) {
                comments = listOf(saved) + comments
                detail = detail?.let { it.copy(commentCount = it.commentCount + 1) }
                commentText = ""
            }
            commentBusy = false
        }
    }

    val d = detail
    Column(Modifier.fillMaxSize().background(ZhijingColors.Bg)) {
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
            Text("收藏夹", fontSize = 16.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.weight(1f))
            Spacer(Modifier.width(44.dp))
        }

        if (d == null) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = ZhijingColors.BrandHot)
            }
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 12.dp),
            ) {
                item {
                    Column(
                        Modifier
                            .fillMaxWidth()
                            .shadow(6.dp, RoundedCornerShape(20.dp))
                            .clip(RoundedCornerShape(20.dp))
                            .background(ZhijingColors.Card)
                            .padding(16.dp),
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(d.emoji.ifBlank { "📁" }, fontSize = 30.sp)
                            Spacer(Modifier.width(10.dp))
                            Column(Modifier.weight(1f)) {
                                Text(
                                    d.title,
                                    fontSize = 17.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = ZhijingColors.Ink,
                                )
                                if (!d.summary.isNullOrBlank()) {
                                    Spacer(Modifier.height(3.dp))
                                    Text(d.summary, fontSize = 12.sp, color = ZhijingColors.Muted)
                                }
                            }
                        }
                        Spacer(Modifier.height(10.dp))
                        val author = d.authorDisplay.ifBlank { "旅人" }
                        Text(
                            if (d.authorId != null) "by $author ›" else "by $author",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = ZhijingColors.BrandHot,
                            modifier = if (d.authorId != null) {
                                Modifier.clickable { onOpenAuthor(d.authorId, author) }
                            } else Modifier,
                        )
                        Spacer(Modifier.height(4.dp))
                        Text(
                            collectionMeta(d.placeCount, d.subscriberCount, d.likeCount),
                            fontSize = 11.sp,
                            color = ZhijingColors.Muted,
                        )
                        Spacer(Modifier.height(12.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            ActionChip(
                                text = if (d.subscribed) "已订阅 ✓" else "+ 订阅",
                                active = d.subscribed,
                                onClick = ::toggleSubscribe,
                            )
                            ActionChip(
                                text = if (d.liked) "❤ ${d.likeCount}" else "♡ ${d.likeCount}",
                                active = d.liked,
                                onClick = ::toggleLike,
                            )
                        }
                    }
                    Spacer(Modifier.height(14.dp))
                    Text("${d.places.size} 个地点", fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(8.dp))
                }

                items(d.places) { p ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .padding(bottom = 8.dp)
                            .clip(RoundedCornerShape(14.dp))
                            .background(ZhijingColors.Card)
                            .padding(horizontal = 12.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            "📍",
                            fontSize = 15.sp,
                        )
                        Spacer(Modifier.width(10.dp))
                        Column(Modifier.weight(1f)) {
                            Text(p.name, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = ZhijingColors.Ink)
                            val sub = listOfNotNull(p.city, p.address).filter { it.isNotBlank() }.joinToString(" · ")
                            if (sub.isNotBlank()) {
                                Text(sub, fontSize = 11.sp, color = ZhijingColors.Muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                        }
                    }
                }

                item {
                    Spacer(Modifier.height(10.dp))
                    Text("评论", fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(8.dp))
                    if (comments.isEmpty()) {
                        Text("还没有评论，说点什么吧～", fontSize = 12.sp, color = ZhijingColors.Muted)
                    }
                }
                items(comments, key = { it.id }) { c ->
                    Row(Modifier.fillMaxWidth().padding(bottom = 10.dp)) {
                        Box(
                            Modifier.size(30.dp).clip(CircleShape).background(ZhijingColors.BrandSoft),
                            contentAlignment = Alignment.Center,
                        ) {
                            val avatarUrl = absServerPath(c.avatar)
                            if (avatarUrl != null) {
                                AsyncImage(
                                    model = avatarUrl,
                                    contentDescription = c.username,
                                    modifier = Modifier.fillMaxSize(),
                                    contentScale = ContentScale.Crop,
                                )
                            } else {
                                Text(
                                    c.username.take(1),
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = ZhijingColors.BrandHot,
                                )
                            }
                        }
                        Spacer(Modifier.width(8.dp))
                        Column(Modifier.weight(1f)) {
                            Text(c.username, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = ZhijingColors.Ink)
                            Spacer(Modifier.height(2.dp))
                            Text(c.content, fontSize = 13.sp, color = ZhijingColors.Ink)
                        }
                    }
                }
            }

            // 评论输入（全局 imePadding 已在 MainActivity 处理）
            Row(
                Modifier
                    .fillMaxWidth()
                    .background(ZhijingColors.Bg)
                    .padding(horizontal = 16.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                BasicTextField(
                    value = commentText,
                    onValueChange = { commentText = it },
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(999.dp))
                        .background(ZhijingColors.BgSurface)
                        .padding(horizontal = 14.dp, vertical = 10.dp),
                    singleLine = true,
                    textStyle = TextStyle(fontSize = 13.sp, color = ZhijingColors.Ink),
                    cursorBrush = SolidColor(ZhijingColors.BrandHot),
                    decorationBox = { inner ->
                        if (commentText.isEmpty()) {
                            Text("说点什么…", fontSize = 13.sp, color = ZhijingColors.Muted)
                        }
                        inner()
                    },
                )
                Spacer(Modifier.width(8.dp))
                Box(
                    Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .background(if (commentBusy) ZhijingColors.Muted else ZhijingColors.BrandHot)
                        .clickable(enabled = !commentBusy) { sendComment() }
                        .padding(horizontal = 16.dp, vertical = 10.dp),
                ) {
                    Text("发送", fontSize = 13.sp, color = Color.White, fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

@Composable
private fun ActionChip(text: String, active: Boolean, onClick: () -> Unit) {
    Box(
        Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(if (active) ZhijingColors.BrandHot else ZhijingColors.BgSurface)
            .clickable { onClick() }
            .padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        Text(
            text,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            color = if (active) Color.White else ZhijingColors.Ink,
        )
    }
}

/** 用户主页：该作者发布的收藏夹（对齐 RN UserProfileScreen 简化） */
@Composable
fun UserProfileScreen(
    userId: String,
    username: String,
    onBack: () -> Unit,
    onOpenDetail: (String) -> Unit,
) {
    var items by remember { mutableStateOf(emptyList<CollectionSummary>()) }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(userId) {
        items = runCatching { ApiClient.collections.list(50, 0, userId).items }.getOrDefault(emptyList())
        loading = false
    }

    Column(Modifier.fillMaxSize().background(ZhijingColors.Bg)) {
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
            Text("$username 的主页", fontSize = 16.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.weight(1f))
            Spacer(Modifier.width(44.dp))
        }

        if (loading) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = ZhijingColors.BrandHot)
            }
        } else {
            LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp)) {
                if (items.isEmpty()) {
                    item {
                        Box(Modifier.fillMaxWidth().padding(vertical = 48.dp), contentAlignment = Alignment.Center) {
                            Text("这位旅人还没有发布收藏夹", fontSize = 13.sp, color = ZhijingColors.Muted)
                        }
                    }
                }
                items(items, key = { it.id }) { item ->
                    CollectionCard(item = item, onPress = { onOpenDetail(item.id) })
                }
            }
        }
    }
}
