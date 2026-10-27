package com.travelguide.app.ui.screens.me

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
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
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
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
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.offset
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import android.widget.Toast
import coil.compose.AsyncImage
import com.travelguide.app.data.api.ApiClient
import com.travelguide.app.data.api.CollectionSummary
import com.travelguide.app.data.api.absServerPath
import com.travelguide.app.data.local.CheckInRecord
import com.travelguide.app.data.local.CheckInStore
import com.travelguide.app.data.local.FavoriteStore
import com.travelguide.app.data.local.GuestStore
import com.travelguide.app.data.local.TokenStore
import com.travelguide.app.data.model.User
import com.travelguide.app.data.util.buildFootprintStats
import com.travelguide.app.data.util.AvatarCropRect
import com.travelguide.app.data.util.prepareSquareAvatar
import com.travelguide.app.ui.components.AvatarCropSheet
import com.travelguide.app.ui.components.CheckInMapCard
import com.travelguide.app.ui.screens.explore.CollectionCard
import com.travelguide.app.ui.theme.ZhijingColors
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import java.io.File

/**
 * 我的（对齐 RN MeScreen）：头像 + 用户名 + 收藏/订阅小卡 + 足迹卡。
 * 头像：点按选图 → 裁剪环 → 上传服务器；长按恢复默认。
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun MeScreen(
    onOpenSettings: () -> Unit,
    onOpenFavorites: () -> Unit,
    onOpenSubscriptions: () -> Unit,
    onOpenFootprints: () -> Unit,
    onOpenAddFootprint: () -> Unit,
    onOpenCheckInMap: () -> Unit = {},
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var user by remember { mutableStateOf<User?>(null) }
    var avatarOverride by remember { mutableStateOf<String?>(null) }
    var avatarBusy by remember { mutableStateOf(false) }
    var cropUri by remember { mutableStateOf<Uri?>(null) }
    var showResetDialog by remember { mutableStateOf(false) }
    var checkIns by remember { mutableStateOf(emptyList<CheckInRecord>()) }
    var checkedPrefectureIds by remember { mutableStateOf(emptyList<String>()) }
    var mapLoading by remember { mutableStateOf(true) }
    var favFolderCount by remember { mutableStateOf(0) }
    var favPlaceCount by remember { mutableStateOf(0) }

    fun reloadFavoriteCounts() {
        scope.launch {
            val (fc, pc) = FavoriteStore.counts()
            favFolderCount = fc
            favPlaceCount = pc
        }
    }

    suspend fun refreshFootprints() {
        checkIns = CheckInStore.list()
        checkedPrefectureIds = CheckInStore.checkedPrefectureIds()
        mapLoading = false
    }

    LaunchedEffect(Unit) {
        user = runCatching { ApiClient.auth.me() }.getOrNull()
        refreshFootprints()
        reloadFavoriteCounts()
    }
    DisposableEffect(Unit) {
        val unsub = FavoriteStore.subscribe { reloadFavoriteCounts() }
        onDispose { unsub() }
    }
    val footStats = remember(checkIns) { buildFootprintStats(checkIns) }
    val isGuest = GuestStore.isGuestSync() && TokenStore.getSync() == null
    val displayName = when {
        user != null -> user!!.username
        isGuest -> "游客"
        else -> "未登录"
    }

    // 选图后进入裁剪页（对齐 RN pickAvatarSourceUri → AvatarCropSheet）
    val pickLauncher = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        if (user == null) {
            Toast.makeText(context, "请先登录", Toast.LENGTH_SHORT).show()
            return@rememberLauncherForActivityResult
        }
        cropUri = uri
    }

    fun onConfirmCrop(crop: AvatarCropRect) {
        val uri = cropUri ?: return
        avatarBusy = true
        scope.launch {
            val result = runCatching {
                val source = uri.copyToCache(context)
                val cropped = prepareSquareAvatar(context, source, crop)
                val part = MultipartBody.Part.createFormData(
                    "file",
                    "avatar.jpg",
                    cropped.asRequestBody("image/jpeg".toMediaType()),
                )
                ApiClient.users.uploadAvatar(part)
            }
            result.fold(
                onSuccess = {
                    avatarOverride = it.avatar
                    cropUri = null
                },
                onFailure = {
                    Toast.makeText(context, "头像上传失败，请重试", Toast.LENGTH_SHORT).show()
                },
            )
            avatarBusy = false
        }
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

            // 头像 + 用户名（点按换头像，长按恢复默认，对齐 RN MeScreen）
            Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                Box(
                    Modifier.combinedClickable(
                        onClick = {
                            if (user == null) {
                                Toast.makeText(context, "登录后可设置头像", Toast.LENGTH_SHORT).show()
                            } else if (!avatarBusy) {
                                pickLauncher.launch(
                                    PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                                )
                            }
                        },
                        onLongClick = {
                            if (!avatarOverride.isNullOrBlank() || !user?.avatar.isNullOrBlank()) {
                                showResetDialog = true
                            }
                        },
                    ),
                ) {
                    AvatarCircle(user, 110.dp, avatarOverride)
                    if (avatarBusy) {
                        Box(
                            Modifier.matchParentSize().background(Color.Black.copy(alpha = 0.25f), CircleShape),
                            contentAlignment = Alignment.Center,
                        ) {
                            CircularProgressIndicator(Modifier.size(28.dp), color = Color.White, strokeWidth = 2.dp)
                        }
                    }
                }
                Spacer(Modifier.height(10.dp))
                Text(
                    displayName,
                    fontSize = 19.sp,
                    fontWeight = FontWeight.Bold,
                    color = ZhijingColors.Ink,
                )
                Spacer(Modifier.height(6.dp))
                Box(
                    Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .background(ZhijingColors.BrandSoft)
                        .clickable { onOpenAddFootprint() }
                        .padding(horizontal = 14.dp, vertical = 7.dp),
                ) {
                    Text("➕ 添加足迹", fontSize = 12.sp, color = ZhijingColors.BrandHot, fontWeight = FontWeight.SemiBold)
                }
            }
            Spacer(Modifier.height(20.dp))

            // 收藏 / 订阅小卡
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                MiniCard(
                    "⭐",
                    "我的收藏",
                    "收藏夹 · $favFolderCount    地点 · $favPlaceCount",
                    Modifier.weight(1f),
                    onOpenFavorites,
                )
                MiniCard("🔔", "我的订阅", "探索页共享收藏夹", Modifier.weight(1f), onOpenSubscriptions)
            }
            Spacer(Modifier.height(12.dp))

            // 足迹卡（对齐 RN footCard：淡蓝底 + 右上装饰圆 + 最新打卡角标）
            Box(
                Modifier
                    .fillMaxWidth()
                    .shadow(6.dp, RoundedCornerShape(20.dp))
                    .clip(RoundedCornerShape(20.dp))
                    .background(Color(0xFFEEF3FF))
                    .clickable { onOpenFootprints() }
                    .padding(18.dp),
            ) {
                Box(
                    Modifier
                        .align(Alignment.TopEnd)
                        .offset(x = 20.dp, y = (-30).dp)
                        .size(180.dp)
                        .clip(CircleShape)
                        .background(Color(0x73FFFFFF)),
                )
                Column(Modifier.defaultMinSize(minHeight = 96.dp)) {
                    Text("我的足迹", fontSize = 18.sp, fontWeight = FontWeight.ExtraBold, color = ZhijingColors.Ink)
                    if (footStats.placeCount > 0) {
                        Spacer(Modifier.height(6.dp))
                        Text(
                            "国家/地区 · ${footStats.countryCount}  城市 · ${footStats.cityCount}",
                            fontSize = 13.sp,
                            color = ZhijingColors.Muted,
                        )
                        footStats.latest?.let { latest ->
                            Spacer(Modifier.height(6.dp))
                            Text(
                                latest.address?.takeIf { it.isNotBlank() } ?: latest.name,
                                fontSize = 11.sp,
                                color = Color(0xFF8A94A8),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    } else {
                        Spacer(Modifier.height(12.dp))
                        Text(
                            "这里空空如也~",
                            fontSize = 22.sp,
                            fontStyle = FontStyle.Italic,
                            color = Color(0xFF8A94A8),
                            letterSpacing = 1.sp,
                        )
                    }
                }
                if (footStats.placeCount > 0) {
                    Box(
                        Modifier
                            .align(Alignment.BottomEnd)
                            .size(28.dp)
                            .clip(CircleShape)
                            .background(Color(0xFF4FC3F7)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("✓", fontSize = 14.sp, fontWeight = FontWeight.ExtraBold, color = Color.White)
                    }
                }
            }
        }
        item {
            Spacer(Modifier.height(12.dp))
            CheckInMapCard(
                checkedPrefectureIds = checkedPrefectureIds,
                loading = mapLoading,
                onClick = onOpenCheckInMap,
            )
        }
    }

    AvatarCropSheet(
        visible = cropUri != null,
        imageUri = cropUri,
        busy = avatarBusy,
        onCancel = { if (!avatarBusy) cropUri = null },
        onConfirm = ::onConfirmCrop,
    )

    // 恢复默认头像（对齐 RN onAvatarLongPress）
    if (showResetDialog) {
        AlertDialog(
            onDismissRequest = { showResetDialog = false },
            title = { Text("恢复默认头像", fontWeight = FontWeight.Bold) },
            text = { Text("将改回昵称首字显示") },
            confirmButton = {
                TextButton(onClick = {
                    showResetDialog = false
                    scope.launch {
                        runCatching { ApiClient.users.removeAvatar() }
                        avatarOverride = null
                        user = user?.copy(avatar = null)
                    }
                }) { Text("恢复", color = ZhijingColors.Danger) }
            },
            dismissButton = {
                TextButton(onClick = { showResetDialog = false }) {
                    Text("取消", color = ZhijingColors.Muted)
                }
            },
        )
    }
}

/** 内容 Uri 拷到缓存文件（multipart 上传需要真实文件） */
private fun Uri.copyToCache(context: android.content.Context): File {
    val mime = context.contentResolver.getType(this)
    val ext = android.webkit.MimeTypeMap.getSingleton().getExtensionFromMimeType(mime) ?: "jpg"
    val dst = File(context.cacheDir, "avatar_upload_${System.currentTimeMillis()}.$ext")
    context.contentResolver.openInputStream(this)?.use { input ->
        dst.outputStream().use { input.copyTo(it) }
    } ?: error("读取图片失败")
    return dst
}

@Composable
private fun AvatarCircle(user: User?, size: androidx.compose.ui.unit.Dp, overridePath: String? = null) {
    val url = absServerPath(overridePath ?: user?.avatar)
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
