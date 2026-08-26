package com.travelguide.app.ui.screens.explore

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.travelguide.app.ui.theme.ZhijingColors

/**
 * 出行搜索（RN TravelSearchScreen 的过渡版）：
 * 先提供机票/火车票官方入口，后端比价能力移植后升级。
 */
@Composable
fun TravelSearchScreen(onBack: () -> Unit) {
    val context = LocalContext.current

    fun open(url: String) {
        runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
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
            Text("出行搜索", fontSize = 16.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.weight(1f))
            Spacer(Modifier.width(44.dp))
        }

        Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
            TravelLinkCard("🚄", "火车票 · 12306", "官方购票与余票查询", "https://www.12306.cn", ::open)
            TravelLinkCard("✈️", "机票 · 携程", "航班比价与预订", "https://flights.ctrip.com", ::open)
            TravelLinkCard("🧳", "综合 · 去哪儿", "机票/火车票/酒店比价", "https://www.qunar.com", ::open)
            Spacer(Modifier.height(12.dp))
            Text("App 内比价检索正在移植中，先跳转官方渠道查询", fontSize = 12.sp, color = ZhijingColors.Muted)
        }
    }
}

@Composable
private fun TravelLinkCard(icon: String, title: String, sub: String, url: String, open: (String) -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(bottom = 10.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(ZhijingColors.Card)
            .clickable { open(url) }
            .padding(horizontal = 14.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(icon, fontSize = 24.sp)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(title, fontSize = 14.sp, fontWeight = FontWeight.Bold, color = ZhijingColors.Ink)
            Spacer(Modifier.height(2.dp))
            Text(sub, fontSize = 12.sp, color = ZhijingColors.Muted)
        }
        Text("›", fontSize = 18.sp, color = ZhijingColors.Muted)
    }
}
