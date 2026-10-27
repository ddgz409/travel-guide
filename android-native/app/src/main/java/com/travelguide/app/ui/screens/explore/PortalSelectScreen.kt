package com.travelguide.app.ui.screens.explore

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.travelguide.app.data.util.PORTALS
import com.travelguide.app.data.util.TravelMode
import com.travelguide.app.data.util.modeLabel
import com.travelguide.app.data.util.openPortal
import com.travelguide.app.ui.components.ScreenHeader
import com.travelguide.app.ui.theme.ZhijingColors

/** 选择出行平台（对齐 RN PortalSelectScreen） */
@Composable
fun PortalSelectScreen(
    from: String,
    to: String,
    mode: String,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    val travelMode = TravelMode.entries.find { it.key == mode } ?: TravelMode.FLIGHT

    Column(Modifier.fillMaxSize().background(ZhijingColors.Bg)) {
        ScreenHeader("选择出行平台", onBack)
        Text(
            "$from → $to · ${modeLabel(mode)}",
            fontSize = 14.sp,
            color = ZhijingColors.Muted,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp),
            textAlign = TextAlign.Center,
        )
        Column(
            Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            PORTALS.chunked(2).forEach { row ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    row.forEach { portal ->
                        PortalCard(
                            portal = portal,
                            travelMode = travelMode,
                            mode = mode,
                            modifier = Modifier.weight(1f),
                            onClick = {
                                openPortal(context, portal, from, to, travelMode)
                                onBack()
                            },
                        )
                    }
                    if (row.size == 1) Spacer(Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
private fun PortalCard(
    portal: com.travelguide.app.data.util.PortalConfig,
    travelMode: TravelMode,
    mode: String,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val supports = portal.modes.contains(travelMode)
    Box(
        modifier
            .aspectRatio(1.1f)
            .clip(RoundedCornerShape(20.dp))
            .background(Color(portal.color).copy(alpha = if (supports) 1f else 0.35f))
            .clickable(enabled = supports, onClick = onClick)
            .padding(16.dp),
    ) {
        Column {
            Text(
                if (mode == "train" && portal.id == "12306") "🚄" else portal.emoji,
                fontSize = 32.sp,
            )
            Spacer(Modifier.padding(top = 8.dp))
            Text(portal.name, fontSize = 18.sp, fontWeight = FontWeight.Bold, color = Color.White)
        }
    }
}
