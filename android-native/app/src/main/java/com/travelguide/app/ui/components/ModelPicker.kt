package com.travelguide.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.travelguide.app.data.local.LlmStore
import com.travelguide.app.data.local.ModelGroup
import com.travelguide.app.data.local.ModelOption
import com.travelguide.app.data.local.PickedModel
import com.travelguide.app.ui.theme.ZhijingColors
import kotlinx.coroutines.launch

/** 模型选择器状态（对齐 RN useModelPicker） */
@Stable
class ModelPickerState internal constructor(
    private val scope: kotlinx.coroutines.CoroutineScope,
    private val onOpenModelManage: () -> Unit,
) {
    var curModel by mutableStateOf(PickedModel.DEFAULT)
        private set
    internal var visible by mutableStateOf(false)
        private set
    internal var level by mutableIntStateOf(1)
        private set
    internal var selectedGroupIdx by mutableIntStateOf(0)
        private set
    internal var groups by mutableStateOf<List<ModelGroup>>(emptyList())
        private set

    suspend fun loadInitial() {
        val local = LlmStore.loadLocalLlm()
        if (local.apiKey.isNotBlank()) {
            curModel = PickedModel(
                provider = local.provider,
                model = local.model,
                label = local.model,
                apiKey = local.apiKey,
                baseUrl = local.baseUrl,
            )
        }
    }

    fun openModelPopup() {
        scope.launch {
            groups = LlmStore.getAvailableModels()
            level = 1
            visible = true
        }
    }

    fun dismiss() {
        visible = false
    }

    fun showProviders() {
        level = 1
    }

    fun showModels(groupIdx: Int) {
        selectedGroupIdx = groupIdx
        level = 2
    }

    fun pickModel(group: ModelGroup, option: ModelOption) {
        curModel = PickedModel(
            provider = group.provider,
            model = option.model,
            label = option.label,
            apiKey = group.apiKey,
            baseUrl = group.baseUrl,
        )
        visible = false
        if (group.apiKey.isNotBlank()) {
            scope.launch {
                LlmStore.saveLocalLlm(
                    com.travelguide.app.data.local.LocalLlmConfig(
                        provider = group.provider,
                        model = option.model,
                        apiKey = group.apiKey.trim(),
                        baseUrl = group.baseUrl.trim(),
                    ),
                )
            }
        }
    }

    fun openManage() {
        visible = false
        onOpenModelManage()
    }
}

@Composable
fun rememberModelPicker(onOpenModelManage: () -> Unit): ModelPickerState {
    val scope = rememberCoroutineScope()
    val state = remember(onOpenModelManage) { ModelPickerState(scope, onOpenModelManage) }
    LaunchedEffect(Unit) { state.loadInitial() }
    return state
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ModelPickerSheet(state: ModelPickerState) {
    if (!state.visible) return

    ModalBottomSheet(
        onDismissRequest = { state.dismiss() },
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = ZhijingColors.Card,
    ) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(bottom = 28.dp)) {
            if (state.level == 1) {
                Text(
                    "选择供应商",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    color = ZhijingColors.Ink,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().padding(bottom = 14.dp),
                )
                state.groups.forEachIndexed { i, g ->
                    val active = state.curModel.provider == g.provider
                    ModelPickerRow(
                        title = g.providerLabel,
                        badge = g.badge,
                        active = active,
                        showArrow = true,
                        onClick = { state.showModels(i) },
                    )
                }
            } else {
                val group = state.groups.getOrNull(state.selectedGroupIdx) ?: return@Column
                Row(
                    Modifier.fillMaxWidth().padding(bottom = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        "‹ 返回",
                        fontSize = 15.sp,
                        color = ZhijingColors.BrandHot,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.clickable { state.showProviders() }.padding(end = 12.dp),
                    )
                    Text(
                        group.providerLabel,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        color = ZhijingColors.Ink,
                    )
                }
                group.models.forEach { m ->
                    val active = state.curModel.model == m.model && state.curModel.provider == group.provider
                    ModelPickerRow(
                        title = m.label,
                        active = active,
                        showArrow = false,
                        onClick = { state.pickModel(group, m) },
                    )
                }
            }

            Box(
                Modifier
                    .fillMaxWidth()
                    .padding(top = 10.dp)
                    .clickable { state.openManage() }
                    .padding(vertical = 12.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text("管理模型 →", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = ZhijingColors.BrandHot)
            }
            Box(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(22.dp))
                    .background(ZhijingColors.Bg)
                    .clickable { state.dismiss() }
                    .padding(vertical = 12.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text("关闭", fontSize = 14.sp, color = ZhijingColors.Muted)
            }
        }
    }
}

@Composable
private fun ModelPickerRow(
    title: String,
    badge: String? = null,
    active: Boolean,
    showArrow: Boolean,
    onClick: () -> Unit,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(vertical = 3.dp)
            .clip(RoundedCornerShape(22.dp))
            .background(if (active) ZhijingColors.BrandSoft else ZhijingColors.Card)
            .border(1.dp, if (active) ZhijingColors.Brand else ZhijingColors.Line, RoundedCornerShape(22.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .size(8.dp)
                .clip(CircleShape)
                .background(if (active) ZhijingColors.Brand else ZhijingColors.Line),
        )
        Spacer(Modifier.size(10.dp))
        Text(title, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = ZhijingColors.Ink, modifier = Modifier.weight(1f))
        badge?.let {
            Text(
                it,
                fontSize = 10.sp,
                color = ZhijingColors.Muted,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier
                    .clip(RoundedCornerShape(18.dp))
                    .background(ZhijingColors.Bg)
                    .padding(horizontal = 8.dp, vertical = 3.dp),
            )
            Spacer(Modifier.size(6.dp))
        }
        if (showArrow) {
            Text("›", fontSize = 18.sp, color = ZhijingColors.Muted)
        }
    }
}
