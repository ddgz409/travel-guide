package com.travelguide.app.ui.components

import android.net.Uri
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.travelguide.app.data.util.AvatarCropRect
import com.travelguide.app.data.util.decodeImageBitmap
import com.travelguide.app.data.util.readImageSize
import com.travelguide.app.ui.theme.ZhijingColors
import java.io.File
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** 选图后拖动照片对齐圆框，点「完成」裁切（对齐 RN AvatarCropSheet） */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AvatarCropSheet(
    visible: Boolean,
    imageUri: Uri?,
    busy: Boolean,
    onCancel: () -> Unit,
    onConfirm: (AvatarCropRect) -> Unit,
) {
    if (!visible || imageUri == null) return

    val context = LocalContext.current
    val density = LocalDensity.current
    val configuration = LocalConfiguration.current
    val frameDp = minOf((configuration.screenWidthDp - 56).dp, 300.dp)
    val framePx = with(density) { frameDp.toPx() }

    var imgW by remember { mutableIntStateOf(0) }
    var imgH by remember { mutableIntStateOf(0) }
    var coverScale by remember { mutableFloatStateOf(1f) }
    var displayW by remember { mutableFloatStateOf(0f) }
    var displayH by remember { mutableFloatStateOf(0f) }
    var offsetX by remember { mutableFloatStateOf(0f) }
    var offsetY by remember { mutableFloatStateOf(0f) }
    var previewBitmap by remember { mutableStateOf<androidx.compose.ui.graphics.ImageBitmap?>(null) }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(imageUri, framePx) {
        loading = true
        previewBitmap = null
        withContext(Dispatchers.IO) {
            val size = readImageSize(context, imageUri) ?: return@withContext
            val (w, h) = size
            val cs = max(framePx / w, framePx / h)
            val dw = w * cs
            val dh = h * cs
            val cache = File(context.cacheDir, "avatar_crop_src_${System.currentTimeMillis()}.jpg")
            context.contentResolver.openInputStream(imageUri)?.use { input ->
                cache.outputStream().use { input.copyTo(it) }
            }
            val bmp = decodeImageBitmap(cache, maxEdge = 1600)
            val preview = bmp?.let {
                android.graphics.Bitmap.createScaledBitmap(it, dw.roundToInt(), dh.roundToInt(), true)
            }
            withContext(Dispatchers.Main) {
                imgW = w
                imgH = h
                coverScale = cs
                displayW = dw
                displayH = dh
                offsetX = (framePx - dw) / 2f
                offsetY = (framePx - dh) / 2f
                previewBitmap = preview?.asImageBitmap()
                loading = false
            }
            cache.delete()
        }
    }

    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(
        onDismissRequest = { if (!busy) onCancel() },
        sheetState = sheetState,
        containerColor = ZhijingColors.Card,
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp)
                .padding(bottom = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                "调整头像",
                fontSize = 18.sp,
                fontWeight = FontWeight.ExtraBold,
                color = ZhijingColors.Ink,
                modifier = Modifier.padding(bottom = 20.dp),
            )

            Box(
                Modifier
                    .size(frameDp)
                    .clip(CircleShape)
                    .background(Color(0xFFF0F2F5))
                    .border(3.dp, Color.White, CircleShape),
                contentAlignment = Alignment.TopStart,
            ) {
                when {
                    loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(28.dp),
                            color = ZhijingColors.Brand,
                            strokeWidth = 2.dp,
                        )
                    }
                    previewBitmap != null -> {
                        val bmp = previewBitmap!!
                        Image(
                            bitmap = bmp,
                            contentDescription = null,
                            modifier = Modifier
                                .offset { IntOffset(offsetX.roundToInt(), offsetY.roundToInt()) }
                                .size(
                                    with(density) { displayW.toDp() },
                                    with(density) { displayH.toDp() },
                                )
                                .pointerInput(displayW, displayH, framePx) {
                                    detectDragGestures { change, drag ->
                                        change.consume()
                                        val minX = framePx - displayW
                                        val minY = framePx - displayH
                                        offsetX = (offsetX + drag.x).coerceIn(minX, 0f)
                                        offsetY = (offsetY + drag.y).coerceIn(minY, 0f)
                                    }
                                },
                            contentScale = ContentScale.FillBounds,
                        )
                    }
                }
            }

            Text(
                "拖动照片，把想要的部分移进圆框",
                fontSize = 13.sp,
                color = ZhijingColors.Muted,
                modifier = Modifier.padding(top = 14.dp),
            )

            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(top = 24.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Box(
                    Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(999.dp))
                        .border(1.dp, ZhijingColors.Line, RoundedCornerShape(999.dp))
                        .clickable(enabled = !busy, onClick = onCancel)
                        .padding(vertical = 14.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("取消", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = ZhijingColors.Ink)
                }
                Box(
                    Modifier
                        .weight(1f)
                        .height(50.dp)
                        .clip(RoundedCornerShape(999.dp))
                        .background(ZhijingColors.Brand)
                        .clickable(
                            enabled = !busy && !loading && imgW > 0,
                            indication = null,
                            interactionSource = remember { MutableInteractionSource() },
                        ) {
                            val cs = coverScale
                            if (cs <= 0f || imgW <= 0 || imgH <= 0) return@clickable
                            val size = (framePx / cs).roundToInt()
                            val maxX = max(0, imgW - size)
                            val maxY = max(0, imgH - size)
                            val originX = min(maxX, max(0, (-offsetX / cs).roundToInt()))
                            val originY = min(maxY, max(0, (-offsetY / cs).roundToInt()))
                            onConfirm(AvatarCropRect(originX, originY, size))
                        },
                    contentAlignment = Alignment.Center,
                ) {
                    if (busy) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(22.dp),
                            color = Color.White,
                            strokeWidth = 2.dp,
                        )
                    } else {
                        Text("完成", fontSize = 16.sp, fontWeight = FontWeight.ExtraBold, color = Color.White)
                    }
                }
            }
        }
    }
}
