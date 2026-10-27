package com.travelguide.app.ui.screens.explore

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.travelguide.app.data.model.citiesGrouped
import com.travelguide.app.data.util.TravelMode
import com.travelguide.app.data.util.TRAVEL_MODES
import com.travelguide.app.ui.components.ScreenHeader
import com.travelguide.app.ui.theme.ZhijingColors

/** 出行搜索（对齐 RN TravelSearchScreen） */
@Composable
fun TravelSearchScreen(
    onBack: () -> Unit,
    onOpenPortalSelect: (from: String, to: String, mode: String) -> Unit,
) {
    var from by remember { mutableStateOf("") }
    var to by remember { mutableStateOf("") }
    var mode by remember { mutableStateOf(TravelMode.FLIGHT) }
    var modeOpen by remember { mutableStateOf(false) }
    var focusField by remember { mutableStateOf<String?>(null) }
    val focusManager = LocalFocusManager.current

    val panelGroups = when (focusField) {
        "from" -> citiesGrouped(from)
        "to" -> citiesGrouped(to)
        else -> emptyList()
    }
    val showPanel = focusField != null && panelGroups.isNotEmpty()

    Column(Modifier.fillMaxSize().background(ZhijingColors.Bg)) {
        ScreenHeader("出行搜索", onBack)

        Column(
            Modifier.fillMaxWidth().padding(horizontal = 20.dp).verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(24.dp))
            Text("✈️", fontSize = 48.sp)
            Spacer(Modifier.height(8.dp))
            Text("输入起点和终点，选择出行方式", fontSize = 14.sp, color = ZhijingColors.Muted)
            Spacer(Modifier.height(24.dp))

            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                CityInput(
                    value = from,
                    placeholder = "起点",
                    onValueChange = { from = it; focusField = "from" },
                    onFocus = { focusField = "from" },
                    modifier = Modifier.weight(1f),
                )
                Spacer(Modifier.padding(horizontal = 6.dp))
                Box {
                    Box(
                        Modifier
                            .size(44.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(ZhijingColors.Card)
                            .clickable { modeOpen = !modeOpen },
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(TRAVEL_MODES.find { it == mode }?.emoji ?: "✈️", fontSize = 22.sp)
                    }
                    if (modeOpen) {
                        Column(
                            Modifier
                                .padding(top = 48.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .background(Color.White)
                                .padding(vertical = 4.dp),
                        ) {
                            TRAVEL_MODES.forEach { m ->
                                Row(
                                    Modifier
                                        .clickable { mode = m; modeOpen = false }
                                        .padding(horizontal = 14.dp, vertical = 8.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Text(m.emoji, fontSize = 18.sp)
                                    Spacer(Modifier.padding(horizontal = 4.dp))
                                    Text(m.label, fontSize = 14.sp)
                                }
                            }
                        }
                    }
                }
                Spacer(Modifier.padding(horizontal = 6.dp))
                CityInput(
                    value = to,
                    placeholder = "终点",
                    onValueChange = { to = it; focusField = "to" },
                    onFocus = { focusField = "to" },
                    modifier = Modifier.weight(1f),
                )
            }

            if (showPanel) {
                Spacer(Modifier.height(12.dp))
                Column(
                    Modifier
                        .fillMaxWidth()
                        .height(220.dp)
                        .clip(RoundedCornerShape(16.dp))
                        .background(ZhijingColors.Card)
                        .padding(12.dp)
                        .verticalScroll(rememberScrollState()),
                ) {
                    panelGroups.forEach { (letter, cities) ->
                        Text(letter, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = ZhijingColors.Muted)
                        Row(
                            Modifier.fillMaxWidth().padding(vertical = 6.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            cities.forEach { name ->
                                val active = (if (focusField == "from") from else to) == name
                                Text(
                                    name,
                                    fontSize = 13.sp,
                                    color = if (active) Color.White else ZhijingColors.Ink,
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(14.dp))
                                        .background(if (active) ZhijingColors.BrandHot else ZhijingColors.BgSurface)
                                        .clickable {
                                            if (focusField == "from") from = name else to = name
                                            focusField = null
                                            focusManager.clearFocus()
                                        }
                                        .padding(horizontal = 12.dp, vertical = 6.dp),
                                )
                            }
                        }
                    }
                }
            }

            Spacer(Modifier.height(20.dp))
            Box(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp))
                    .background(ZhijingColors.BrandHot)
                    .clickable {
                        if (from.isBlank() || to.isBlank()) return@clickable
                        onOpenPortalSelect(from.trim(), to.trim(), mode.key)
                    }
                    .padding(vertical = 14.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text("🔍 搜索", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = Color.White)
            }
            Spacer(Modifier.height(12.dp))
            Text("💡 支持携程、去哪儿、飞猪、12306", fontSize = 12.sp, color = ZhijingColors.Muted)
        }
    }
}

@Composable
private fun CityInput(
    value: String,
    placeholder: String,
    onValueChange: (String) -> Unit,
    onFocus: () -> Unit,
    modifier: Modifier = Modifier,
) {
    TextField(
        value = value,
        onValueChange = { onValueChange(it); onFocus() },
        placeholder = { Text(placeholder, color = ZhijingColors.Muted) },
        singleLine = true,
        modifier = modifier.clip(RoundedCornerShape(14.dp)),
        colors = TextFieldDefaults.colors(
            focusedContainerColor = ZhijingColors.Card,
            unfocusedContainerColor = ZhijingColors.Card,
            focusedIndicatorColor = Color.Transparent,
            unfocusedIndicatorColor = Color.Transparent,
        ),
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
        keyboardActions = KeyboardActions(onDone = { }),
    )
}
