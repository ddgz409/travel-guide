package com.travelguide.app.ui.screens.photo

import android.graphics.BitmapFactory
import android.util.Base64
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.travelguide.app.data.api.ApiClient
import com.travelguide.app.data.api.VisionBase64Payload
import com.travelguide.app.data.api.VisionRecognizeResponse
import com.travelguide.app.ui.components.ScreenHeader
import com.travelguide.app.ui.theme.ZhijingColors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private val KIND_LABELS = mapOf(
    "scenery" to "景点", "hotel" to "酒店", "ticket" to "车票",
    "map" to "地图", "food" to "美食", "other" to "其他",
)

/** 拍照识景（对齐 RN PhotoRecognizeScreen） */
@Composable
fun PhotoRecognizeScreen(
    initialUri: String? = null,
    onBack: () -> Unit,
    onOpenChat: (prefill: String) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val clipboard = LocalClipboardManager.current
    var uri by remember { mutableStateOf(initialUri) }
    var loading by remember { mutableStateOf(false) }
    var result by remember { mutableStateOf<VisionRecognizeResponse?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var copied by remember { mutableStateOf(false) }

    val pickLauncher = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { picked ->
        if (picked != null) uri = picked.toString()
    }
    val cameraLauncher = rememberLauncherForActivityResult(ActivityResultContracts.TakePicturePreview()) { bmp ->
        if (bmp != null) {
            scope.launch {
                val b64 = withContext(Dispatchers.IO) {
                    java.io.ByteArrayOutputStream().use { out ->
                        bmp.compress(android.graphics.Bitmap.CompressFormat.JPEG, 85, out)
                        Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
                    }
                }
                loading = true
                error = null
                result = null
                try {
                    result = ApiClient.vision.recognizeBase64(VisionBase64Payload(b64))
                } catch (e: Exception) {
                    error = e.message ?: "识别失败"
                } finally {
                    loading = false
                }
            }
        }
    }

    suspend fun recognize(b64: String, onResult: (VisionRecognizeResponse?) -> Unit = {}) {
        loading = true
        error = null
        result = null
        try {
            val res = ApiClient.vision.recognizeBase64(VisionBase64Payload(b64))
            result = res
            onResult(res)
        } catch (e: Exception) {
            error = e.message ?: "识别失败，请稍后重试"
        } finally {
            loading = false
        }
    }

    LaunchedEffect(uri) {
        val u = uri ?: return@LaunchedEffect
        if (result != null || loading) return@LaunchedEffect
        scope.launch {
            val b64 = withContext(Dispatchers.IO) {
                runCatching {
                    context.contentResolver.openInputStream(android.net.Uri.parse(u))?.use { stream ->
                        Base64.encodeToString(stream.readBytes(), Base64.NO_WRAP)
                    }
                }.getOrNull()
            } ?: run { error = "无法读取图片"; return@launch }
            recognize(b64)
        }
    }

    val resultText = result?.let { r ->
        listOfNotNull(
            "【图片识别】${r.title.ifBlank { "未知地点" }}（${KIND_LABELS[r.kind] ?: r.kind}）",
            r.description.takeIf { it.isNotBlank() },
            r.highlights.takeIf { it.isNotEmpty() }?.let { "亮点：${it.joinToString("；")}" },
            r.tips.takeIf { it.isNotEmpty() }?.let { "提示：${it.joinToString("；")}" },
        ).joinToString("\n")
    }.orEmpty()

    Column(Modifier.fillMaxSize().background(ZhijingColors.Bg)) {
        ScreenHeader("拍照识景", onBack)
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            if (uri != null) {
                val bmp = remember(uri) {
                    runCatching {
                        context.contentResolver.openInputStream(android.net.Uri.parse(uri!!))?.use {
                            BitmapFactory.decodeStream(it)?.asImageBitmap()
                        }
                    }.getOrNull()
                }
                if (bmp != null) {
                    Image(bmp, null, Modifier.fillMaxWidth().height(220.dp).clip(RoundedCornerShape(16.dp)), contentScale = ContentScale.Crop)
                }
            } else {
                Box(
                    Modifier.fillMaxWidth().height(180.dp).clip(RoundedCornerShape(16.dp)).background(ZhijingColors.Card),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("选择或拍摄一张照片", color = ZhijingColors.Muted)
                }
            }
            Spacer(Modifier.height(16.dp))
            RowButtons(
                onPick = { pickLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                onCamera = { cameraLauncher.launch(null) },
            )
            Spacer(Modifier.height(16.dp))
            when {
                loading -> CircularProgressIndicator(color = ZhijingColors.BrandHot)
                error != null -> Text(error!!, color = ZhijingColors.Danger, fontSize = 14.sp)
                result != null -> {
                    val r = result!!
                    Text(r.title, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(8.dp))
                    Text(r.description, fontSize = 14.sp, color = ZhijingColors.Ink)
                    if (r.highlights.isNotEmpty()) {
                        Spacer(Modifier.height(8.dp))
                        Text("亮点：${r.highlights.joinToString("；")}", fontSize = 13.sp, color = ZhijingColors.Muted)
                    }
                    Spacer(Modifier.height(16.dp))
                    ActionBtn("发给 AI 助手规划") {
                        val dest = r.title.takeIf { it.isNotBlank() }?.let { "「$it」" }.orEmpty()
                        val info = listOfNotNull(
                            r.description,
                            r.highlights.takeIf { it.isNotEmpty() }?.let { "亮点：${it.joinToString("；")}" },
                            r.tips.takeIf { it.isNotEmpty() }?.let { "信息：${it.joinToString("；")}" },
                        ).joinToString("\n")
                        onOpenChat("我想去${dest}玩，请根据下面的信息帮我安排一份行程攻略：\n$info")
                    }
                    Spacer(Modifier.height(8.dp))
                    ActionBtn(if (copied) "已复制" else "复制识别结果") {
                        clipboard.setText(AnnotatedString(resultText))
                        copied = true
                    }
                }
            }
        }
    }
}

@Composable
private fun RowButtons(onPick: () -> Unit, onCamera: () -> Unit) {
    androidx.compose.foundation.layout.Row(Modifier.fillMaxWidth()) {
        ActionBtn("相册选图", Modifier.weight(1f), onPick)
        Spacer(Modifier.padding(horizontal = 6.dp))
        ActionBtn("拍照", Modifier.weight(1f), onCamera)
    }
}

@Composable
private fun ActionBtn(text: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Box(
        modifier
            .clip(RoundedCornerShape(14.dp))
            .background(ZhijingColors.BrandSoft)
            .clickable(onClick = onClick)
            .padding(vertical = 12.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, fontSize = 14.sp, fontWeight = FontWeight.Medium, color = ZhijingColors.BrandHot)
    }
}
