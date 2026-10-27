package com.travelguide.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.travelguide.app.data.util.ShareAppId
import com.travelguide.app.data.util.ShareChoicePayload
import com.travelguide.app.data.util.shareViaApp
import com.travelguide.app.ui.theme.ZhijingColors

private data class ShareOption(val id: ShareAppId, val label: String, val hint: String, val color: androidx.compose.ui.graphics.Color)

private val SHARE_OPTIONS = listOf(
    ShareOption(ShareAppId.Weixin, "微信", "复制链接并打开微信", androidx.compose.ui.graphics.Color(0xFF07C160)),
    ShareOption(ShareAppId.Qq, "QQ", "复制链接并打开 QQ", androidx.compose.ui.graphics.Color(0xFF12B7F5)),
    ShareOption(ShareAppId.Copy, "复制链接", "复制后可粘贴到任意 App", ZhijingColors.Ink),
    ShareOption(ShareAppId.More, "更多", "系统分享菜单", androidx.compose.ui.graphics.Color(0xFF8A94A8)),
)

/** 分享链接：自选微信 / QQ / 复制 / 系统分享（对齐 RN ShareChoiceSheet） */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShareChoiceSheet(
    payload: ShareChoicePayload?,
    onClose: () -> Unit,
) {
    if (payload == null) return
    val context = LocalContext.current
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(
        onDismissRequest = onClose,
        sheetState = sheetState,
        containerColor = ZhijingColors.Card,
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp)
                .padding(bottom = 28.dp),
        ) {
            Box(
                Modifier
                    .align(Alignment.CenterHorizontally)
                    .size(width = 36.dp, height = 4.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(androidx.compose.ui.graphics.Color(0xFFE6E6E6)),
            )
            Spacer(Modifier.height(14.dp))
            Text(
                payload.title ?: "分享链接",
                fontSize = 18.sp,
                fontWeight = FontWeight.ExtraBold,
                color = ZhijingColors.Ink,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(6.dp))
            Text(
                payload.url,
                fontSize = 12.sp,
                color = ZhijingColors.Muted,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(12.dp))
            SHARE_OPTIONS.forEach { opt ->
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clickable {
                            shareViaApp(context, opt.id, payload)
                            onClose()
                        }
                        .padding(vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        Modifier
                            .size(12.dp)
                            .clip(CircleShape)
                            .background(opt.color),
                    )
                    Column(Modifier.weight(1f).padding(start = 12.dp)) {
                        Text(opt.label, fontSize = 16.sp, fontWeight = FontWeight.ExtraBold, color = ZhijingColors.Ink)
                        Text(opt.hint, fontSize = 12.sp, color = ZhijingColors.Muted)
                    }
                    Text("›", fontSize = 20.sp, color = ZhijingColors.Muted)
                }
            }
            Box(
                Modifier
                    .fillMaxWidth()
                    .clickable(onClick = onClose)
                    .padding(vertical = 12.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text("取消", fontSize = 15.sp, fontWeight = FontWeight.Bold, color = ZhijingColors.Muted)
            }
        }
    }
}
