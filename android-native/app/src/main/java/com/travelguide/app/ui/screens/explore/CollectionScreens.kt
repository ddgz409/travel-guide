package com.travelguide.app.ui.screens.explore

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.ui.platform.LocalContext
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
import com.travelguide.app.data.api.UserProfileInfo
import com.travelguide.app.data.api.absServerPath
import com.travelguide.app.data.local.TokenStore
import com.travelguide.app.ui.components.AvatarVariant
import com.travelguide.app.ui.components.UserAvatar
import com.travelguide.app.ui.components.rememberPlaceImage
import com.travelguide.app.ui.theme.ZhijingColors
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
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
            covers = item.coverPlaces,
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

/** 文件夹拼贴封面：底板 + 最多 3 张地点照片旋转堆叠 + emoji（对齐 RN CollectionCard） */
@Composable
private fun CollectionFolder(covers: List<CollectionPlace>, fallbackCity: String?, emoji: String) {
    // RN photo0/1/2：偏移 + 旋转角度逐张对齐；不足 3 张时用城市兜底占位补满（对齐 RN fallback）
    val slots = covers.take(3).map { Pair(it.city ?: fallbackCity ?: "北京", it.name) }.let { list ->
        val fallbackName = fallbackCity ?: "景点"
        list + List(3 - list.size) { Pair(fallbackCity ?: "北京", fallbackName) }
    }
    val transforms = listOf(
        Triple(8.dp, 4.dp, -8f),
        Triple(22.dp, 12.dp, 6f),
        Triple(14.dp, 24.dp, -3f),
    )
    Box(Modifier.size(88.dp)) {
        Box(
            Modifier
                .offset(x = 6.dp, y = 10.dp)
                .fillMaxSize()
                .clip(RoundedCornerShape(14.dp))
                .background(Color(0xFFECEFF3)),
        )
        slots.forEachIndexed { i, (city, name) ->
            val (x, y, rot) = transforms[i]
            val url = rememberPlaceImage(city, name, "spots", covers.getOrNull(i)?.poiId.orEmpty())
            Box(
                Modifier
                    .graphicsLayer(rotationZ = rot)
                    .offset(x = x, y = y)
                    .size(52.dp)
                    .border(2.dp, Color.White, RoundedCornerShape(10.dp))
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
        }
        Text(emoji, fontSize = 22.sp, modifier = Modifier.align(Alignment.BottomStart))
    }
}

/** 大家的收藏夹（对齐 RN SharedCollectionsScreen） */
@Composable
fun SharedCollectionsScreen(
    onBack: () -> Unit,
    onOpenDetail: (String) -> Unit,
    onOpenAuthor: (String, String) -> Unit,
    onPublish: () -> Unit = {},
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
            Text(
                "＋ 发布",
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                color = ZhijingColors.BrandHot,
                modifier = Modifier.clickable { onPublish() },
            )
        }

        // 共享计划横幅
        Column(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
                .clip(RoundedCornerShape(18.dp))
                .background(ZhijingColors.BrandSoft)
                .clickable { onPublish() }
                .padding(16.dp),
        ) {
            Text("地球角落 共享计划", fontSize = 15.sp, fontWeight = FontWeight.Bold, color = ZhijingColors.Ink)
            Spacer(Modifier.height(4.dp))
            Text("编辑地点与文案，分享给更多旅人 · 点此发布", fontSize = 12.sp, color = ZhijingColors.Muted)
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
    onEdit: (String) -> Unit = {},
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var detail by remember { mutableStateOf<CollectionDetail?>(null) }
    var comments by remember { mutableStateOf(emptyList<CommentOut>()) }
    var commentText by remember { mutableStateOf("") }
    var commentBusy by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf(false) }

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

    fun deleteCollection() {
        if (deleting) return
        deleting = true
        scope.launch {
            runCatching { ApiClient.collections.remove(collectionId) }.fold(
                onSuccess = {
                    android.widget.Toast.makeText(context, "已删除", android.widget.Toast.LENGTH_SHORT).show()
                    onBack()
                },
                onFailure = {
                    android.widget.Toast.makeText(context, it.message ?: "删除失败", android.widget.Toast.LENGTH_SHORT).show()
                    deleting = false
                },
            )
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
            if (d?.isOwner == true) {
                Text(
                    "编辑",
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    color = ZhijingColors.BrandHot,
                    modifier = Modifier.clickable { onEdit(collectionId) },
                )
            } else {
                Spacer(Modifier.width(44.dp))
            }
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
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            UserAvatar(
                                name = author,
                                size = 22.dp,
                                imageUri = absServerPath(d.authorAvatar),
                            )
                            Spacer(Modifier.width(6.dp))
                            Text(
                                if (d.authorId != null) "by $author ›" else "by $author",
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                color = ZhijingColors.BrandHot,
                                modifier = if (d.authorId != null) {
                                    Modifier.clickable { onOpenAuthor(d.authorId, author) }
                                } else Modifier,
                            )
                        }
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
                            if (d.isOwner) {
                                ActionChip(
                                    text = "删除",
                                    active = false,
                                    onClick = { confirmDelete = true },
                                )
                            }
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
                            val sub = listOfNotNull(p.city, p.note, p.address).filter { it.isNotBlank() }.joinToString(" · ")
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
                                    contentDescription = null,
                                    modifier = Modifier.fillMaxSize(),
                                    contentScale = ContentScale.Crop,
                                )
                            } else {
                                Text(
                                    c.username.take(1).ifBlank { "?" },
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = ZhijingColors.BrandHot,
                                )
                            }
                        }
                        Spacer(Modifier.width(8.dp))
                        Column(Modifier.weight(1f)) {
                            Text(c.username.ifBlank { "旅人" }, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            Text(c.content, fontSize = 13.sp, color = ZhijingColors.Ink)
                        }
                    }
                }
            }

            Row(
                Modifier
                    .fillMaxWidth()
                    .background(ZhijingColors.Card)
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                BasicTextField(
                    value = commentText,
                    onValueChange = { commentText = it },
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(18.dp))
                        .background(ZhijingColors.BgSurface)
                        .padding(horizontal = 14.dp, vertical = 10.dp),
                    textStyle = TextStyle(fontSize = 14.sp, color = ZhijingColors.Ink),
                    cursorBrush = SolidColor(ZhijingColors.BrandHot),
                    decorationBox = { inner ->
                        if (commentText.isEmpty()) {
                            Text("写评论…", fontSize = 14.sp, color = ZhijingColors.Muted)
                        }
                        inner()
                    },
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    if (commentBusy) "…" else "发送",
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    color = ZhijingColors.BrandHot,
                    modifier = Modifier.clickable(enabled = !commentBusy) { sendComment() },
                )
            }
        }
    }

    if (confirmDelete) {
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { if (!deleting) confirmDelete = false },
            title = { Text("删除收藏夹") },
            text = { Text("删除后无法恢复，确定吗？") },
            confirmButton = {
                androidx.compose.material3.TextButton(onClick = {
                    confirmDelete = false
                    deleteCollection()
                }) { Text("删除", color = ZhijingColors.Danger) }
            },
            dismissButton = {
                androidx.compose.material3.TextButton(onClick = { confirmDelete = false }) { Text("取消") }
            },
        )
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

/** 用户主页：头像/统计/关注按钮 + TA 的发帖（对齐 RN UserProfileScreen） */
@Composable
fun UserProfileScreen(
    userId: String,
    username: String,
    onBack: () -> Unit,
    onOpenDetail: (String) -> Unit,
    onOpenFollowList: (userId: String, username: String, tab: String) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var profile by remember { mutableStateOf<UserProfileInfo?>(null) }
    var posts by remember { mutableStateOf(emptyList<CollectionSummary>()) }
    var loading by remember { mutableStateOf(true) }
    var followBusy by remember { mutableStateOf(false) }

    LaunchedEffect(userId) {
        loading = true
        // 主页信息与发帖并行拉取（对齐 RN Promise.all）
        val (p, list) = coroutineScope {
            val dProfile = async { runCatching { ApiClient.users.profile(userId) }.getOrNull() }
            val dPosts = async {
                runCatching { ApiClient.collections.list(20, 0, userId).items }
                    .getOrDefault(emptyList())
            }
            dProfile.await() to dPosts.await()
        }
        profile = p
        posts = list
        loading = false
    }

    fun toggleFollow() {
        val p = profile ?: return
        if (followBusy) return
        if (!p.isFollowing && TokenStore.getSync() == null) {
            android.widget.Toast.makeText(context, "登录后才能关注作者", android.widget.Toast.LENGTH_SHORT).show()
            return
        }
        followBusy = true
        scope.launch {
            val ok = runCatching {
                if (p.isFollowing) ApiClient.users.unfollow(p.id) else ApiClient.users.follow(p.id)
            }.isSuccess
            if (ok) {
                profile = p.copy(
                    isFollowing = !p.isFollowing,
                    followerCount = (p.followerCount + if (p.isFollowing) -1 else 1).coerceAtLeast(0),
                )
            }
            followBusy = false
        }
    }

    Column(Modifier.fillMaxSize().background(ZhijingColors.Bg)) {
        Row(
            Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                "‹ 返回",
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                color = ZhijingColors.BrandHot,
                modifier = Modifier.clickable { onBack() },
            )
            Spacer(Modifier.weight(1f))
            Text("作者主页", fontSize = 16.sp, fontWeight = FontWeight.ExtraBold, color = ZhijingColors.Ink)
            Spacer(Modifier.weight(1f))
            Spacer(Modifier.width(48.dp))
        }

        if (loading && profile == null) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = ZhijingColors.BrandHot)
            }
        } else {
            val p = profile
            Column(
                Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp, vertical = 0.dp),
            ) {
                if (p != null) {
                    ProfileCard(
                        profile = p,
                        followBusy = followBusy,
                        onToggleFollow = ::toggleFollow,
                        onOpenFollowList = onOpenFollowList,
                    )
                }
                Text(
                    "TA 的发帖",
                    fontSize = 15.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = ZhijingColors.Ink,
                    modifier = Modifier.padding(top = 22.dp, bottom = 12.dp),
                )
                if (posts.isEmpty()) {
                    Text(
                        "TA 还没有发布过帖子",
                        fontSize = 14.sp,
                        color = ZhijingColors.Muted,
                        modifier = Modifier.fillMaxWidth().padding(top = 24.dp),
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    )
                } else {
                    posts.forEach { item ->
                        CollectionCard(item = item, onPress = { onOpenDetail(item.id) })
                    }
                }
                Spacer(Modifier.height(32.dp))
            }
        }
    }
}

/** 主页头像卡（头像 + 昵称 + 统计 + 关注按钮） */
@Composable
private fun ProfileCard(
    profile: UserProfileInfo,
    followBusy: Boolean,
    onToggleFollow: () -> Unit,
    onOpenFollowList: (userId: String, username: String, tab: String) -> Unit,
) {
    Column(
        Modifier
            .fillMaxWidth()
            .padding(top = 8.dp)
            .shadow(6.dp, RoundedCornerShape(22.dp))
            .clip(RoundedCornerShape(22.dp))
            .background(ZhijingColors.Card)
            .padding(20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        UserAvatar(
            name = profile.username,
            size = 72.dp,
            variant = AvatarVariant.CARD,
            imageUri = absServerPath(profile.avatar),
        )
        Text(
            profile.username,
            fontSize = 20.sp,
            fontWeight = FontWeight.ExtraBold,
            color = ZhijingColors.Ink,
            modifier = Modifier.padding(top = 12.dp),
        )
        Box(
            Modifier
                .padding(top = 6.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(ZhijingColors.BrandSoft)
                .padding(horizontal = 10.dp, vertical = 3.dp),
        ) {
            Text("旅行发帖者", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = ZhijingColors.BrandHot)
        }

        Row(Modifier.padding(top = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            ProfileStat(profile.postCount.toString(), "发帖")
            Box(Modifier.width(1.dp).height(28.dp).background(ZhijingColors.Line))
            ProfileStat(
                profile.followerCount.toString(), "粉丝",
                onClick = { onOpenFollowList(profile.id, profile.username, "followers") },
            )
            Box(Modifier.width(1.dp).height(28.dp).background(ZhijingColors.Line))
            ProfileStat(
                profile.followingCount.toString(), "关注",
                onClick = { onOpenFollowList(profile.id, profile.username, "following") },
            )
        }

        if (profile.isSelf) {
            Text(
                "这是你自己",
                fontSize = 14.sp,
                color = ZhijingColors.Muted,
                modifier = Modifier.padding(top = 18.dp),
            )
        } else {
            val on = profile.isFollowing
            Box(
                Modifier
                    .padding(top = 18.dp)
                    .width(156.dp)
                    .height(42.dp)
                    .clip(RoundedCornerShape(21.dp))
                    .background(if (on) ZhijingColors.BgSurface else ZhijingColors.Brand)
                    .let {
                        if (on) it.border(1.dp, ZhijingColors.Line, RoundedCornerShape(21.dp)) else it
                    }
                    .clickable(enabled = !followBusy) { onToggleFollow() },
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    if (followBusy) "…" else if (on) "已关注" else "+ 关注",
                    fontSize = 15.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = if (on) ZhijingColors.Ink else Color.White,
                )
            }
        }
    }
}

@Composable
private fun ProfileStat(num: String, label: String, onClick: (() -> Unit)? = null) {
    Column(
        Modifier
            .width(96.dp)
            .clickable(enabled = onClick != null) { onClick?.invoke() }
            .padding(vertical = 2.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(num, fontSize = 18.sp, fontWeight = FontWeight.ExtraBold, color = ZhijingColors.Ink)
        Text(label, fontSize = 12.sp, color = ZhijingColors.Muted, modifier = Modifier.padding(top = 2.dp))
    }
}
