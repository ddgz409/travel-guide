package com.travelguide.app.ui.screens.settings

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.travelguide.app.data.local.CustomProvider
import com.travelguide.app.data.local.LlmStore
import com.travelguide.app.data.local.LocalLlmConfig
import com.travelguide.app.ui.theme.ZhijingColors
import kotlinx.coroutines.launch

/** 管理模型（对齐 RN ModelManageScreen：当前模型 + 默认/自定义供应商切换 + 添加表单） */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun ModelManageScreen(onBack: () -> Unit) {
    var currentLlm by remember { mutableStateOf(LlmStore.DEFAULT) }
    var providers by remember { mutableStateOf<List<CustomProvider>>(emptyList()) }

    var name by remember { mutableStateOf("") }
    var baseUrl by remember { mutableStateOf("") }
    var apiKey by remember { mutableStateOf("") }
    var model by remember { mutableStateOf("") }
    var showKey by remember { mutableStateOf(false) }
    var formError by remember { mutableStateOf<String?>(null) }
    var saving by remember { mutableStateOf(false) }
    var pendingDelete by remember { mutableStateOf<CustomProvider?>(null) }

    val scope = rememberCoroutineScope()

    suspend fun refresh() {
        currentLlm = LlmStore.loadLocalLlm()
        providers = LlmStore.loadCustomProviders()
    }
    LaunchedEffect(Unit) { refresh() }

    val isDefaultActive = currentLlm.apiKey.isBlank() ||
        (currentLlm.provider == LlmStore.DEFAULT.provider && currentLlm.model == LlmStore.DEFAULT.model)

    Column(Modifier.fillMaxSize().background(ZhijingColors.Bg)) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                "‹",
                fontSize = 26.sp,
                color = ZhijingColors.Ink,
                modifier = Modifier.clickable { onBack() }.padding(8.dp),
            )
            Text("管理模型", fontSize = 17.sp, fontWeight = FontWeight.Bold, color = ZhijingColors.Ink)
        }

        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp),
        ) {
            // 当前模型
            SectionTitle("当前模型")
            ProviderCard(
                active = true,
                title = if (isDefaultActive) "智谱 GLM · glm-4-flash" else "${currentLlm.provider} · ${currentLlm.model}",
                sub = if (isDefaultActive) "服务器默认模型" else "自定义供应商",
                onClick = {},
            )

            // 默认模型
            SectionTitle("默认模型")
            ProviderCard(
                active = isDefaultActive,
                title = "智谱 GLM · glm-4-flash",
                sub = "服务器默认（无需 API Key）",
                trailing = if (!isDefaultActive) "切换" else null,
                onClick = {
                    scope.launch {
                        LlmStore.switchToDefault()
                        refresh()
                    }
                },
            )

            // 已保存的供应商
            if (providers.isNotEmpty()) {
                SectionTitle("已保存的供应商")
                providers.forEach { p ->
                    val isActive = currentLlm.provider == p.provider && currentLlm.model == p.model
                    ProviderCard(
                        active = isActive,
                        title = "${p.name} · ${p.model}",
                        sub = p.baseUrl,
                        trailing = if (isActive) "当前" else "切换",
                        onClick = {
                            scope.launch {
                                LlmStore.switchToProvider(p)
                                refresh()
                            }
                        },
                        onLongClick = { pendingDelete = p },
                    )
                    Spacer(Modifier.height(8.dp))
                }
                Text("长按可删除供应商", fontSize = 11.sp, color = ZhijingColors.Muted)
            }

            // 添加自定义供应商
            SectionTitle("添加自定义供应商")
            FieldLabel("名称")
            LlmInput(value = name, onValueChange = { name = it }, placeholder = "如：智谱 GLM")
            FieldLabel("Base URL")
            LlmInput(value = baseUrl, onValueChange = { baseUrl = it }, placeholder = "https://api.example.com/v1")
            FieldLabel("API Key")
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.weight(1f)) {
                    LlmInput(
                        value = apiKey,
                        onValueChange = { apiKey = it },
                        placeholder = "输入 API Key",
                        visualTransformation = if (showKey) VisualTransformation.None else PasswordVisualTransformation(),
                    )
                }
                Spacer(Modifier.size(8.dp))
                Text(
                    if (showKey) "🙈" else "👁️",
                    fontSize = 18.sp,
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .clickable { showKey = !showKey }
                        .padding(8.dp),
                )
            }
            FieldLabel("模型名")
            LlmInput(value = model, onValueChange = { model = it }, placeholder = "如：glm-4-flash")

            formError?.let {
                Spacer(Modifier.height(8.dp))
                Text(it, fontSize = 13.sp, color = ZhijingColors.Danger)
            }

            Spacer(Modifier.height(14.dp))
            Button(
                onClick = {
                    val n = name.trim()
                    val u = baseUrl.trim().trimEnd('/')
                    val k = apiKey.trim()
                    val m = model.trim()
                    when {
                        n.isEmpty() -> formError = "请输入供应商名称"
                        u.isEmpty() -> formError = "请输入 Base URL"
                        k.isEmpty() -> formError = "请输入 API Key"
                        m.isEmpty() -> formError = "请输入模型名"
                        else -> {
                            formError = null
                            saving = true
                            scope.launch {
                                try {
                                    val p = CustomProvider(
                                        name = n,
                                        provider = n.lowercase().replace(Regex("\\s+"), "-"),
                                        baseUrl = u,
                                        apiKey = k,
                                        model = m,
                                    )
                                    LlmStore.saveCustomProvider(p)
                                    LlmStore.switchToProvider(p)
                                    name = ""
                                    baseUrl = ""
                                    apiKey = ""
                                    model = ""
                                    refresh()
                                    formError = "已保存并切换：${p.name}"
                                } finally {
                                    saving = false
                                }
                            }
                        }
                    }
                },
                enabled = !saving,
                modifier = Modifier.fillMaxWidth().height(48.dp),
                colors = ButtonDefaults.buttonColors(containerColor = ZhijingColors.Brand),
            ) {
                Text(if (saving) "保存中…" else "保存并切换", fontSize = 15.sp)
            }
            Spacer(Modifier.height(28.dp))
        }
    }

    // 删除确认
    pendingDelete?.let { p ->
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            title = { Text("删除供应商") },
            text = { Text("确定删除「${p.name}」？") },
            confirmButton = {
                TextButton(
                    onClick = {
                        pendingDelete = null
                        scope.launch {
                            LlmStore.deleteCustomProvider(p.provider)
                            if (currentLlm.provider == p.provider) LlmStore.switchToDefault()
                            refresh()
                        }
                    },
                ) { Text("删除", color = ZhijingColors.Danger) }
            },
            dismissButton = {
                TextButton(onClick = { pendingDelete = null }) { Text("取消") }
            },
        )
    }
}

@Composable
private fun SectionTitle(text: String) {
    Spacer(Modifier.height(14.dp))
    Text(text, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = ZhijingColors.Ink)
    Spacer(Modifier.height(8.dp))
}

@Composable
private fun FieldLabel(text: String) {
    Spacer(Modifier.height(10.dp))
    Text(text, fontSize = 13.sp, color = ZhijingColors.Muted)
    Spacer(Modifier.height(4.dp))
}

@Composable
private fun LlmInput(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    visualTransformation: VisualTransformation = VisualTransformation.None,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        placeholder = { Text(placeholder) },
        singleLine = true,
        visualTransformation = visualTransformation,
        modifier = Modifier.fillMaxWidth(),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = ZhijingColors.BrandHot,
            unfocusedBorderColor = ZhijingColors.Line,
            focusedContainerColor = ZhijingColors.Card,
            unfocusedContainerColor = ZhijingColors.Card,
        ),
    )
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ProviderCard(
    active: Boolean,
    title: String,
    sub: String,
    trailing: String? = null,
    onClick: () -> Unit,
    onLongClick: (() -> Unit)? = null,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(if (active) ZhijingColors.BrandSoft else ZhijingColors.Card)
            .combinedClickable(
                onClick = onClick,
                onLongClick = onLongClick,
            )
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .size(10.dp)
                .clip(CircleShape)
                .background(if (active) ZhijingColors.Ready else ZhijingColors.Line),
        )
        Spacer(Modifier.size(10.dp))
        Column(Modifier.weight(1f)) {
            Text(title, fontSize = 14.sp, fontWeight = FontWeight.Medium, color = ZhijingColors.Ink)
            Text(sub, fontSize = 12.sp, color = ZhijingColors.Muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        trailing?.let {
            Text(
                it,
                fontSize = 12.sp,
                color = if (it == "当前") ZhijingColors.Ready else ZhijingColors.BrandHot,
            )
        }
    }
}
