package com.travelguide.app.ui.screens.settlement

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
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
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.travelguide.app.data.api.ApiClient
import com.travelguide.app.data.api.ExpenseDto
import com.travelguide.app.data.api.ExpenseInputDto
import com.travelguide.app.data.api.ExpenseSplitInputDto
import com.travelguide.app.data.api.MemberNamePayload
import com.travelguide.app.data.api.SettlementDataDto
import com.travelguide.app.data.api.TripMemberDto
import com.travelguide.app.data.model.User
import com.travelguide.app.ui.components.ScreenHeader
import com.travelguide.app.ui.theme.ZhijingColors
import kotlinx.coroutines.launch

private fun fmtMoney(n: Double): String {
    if (!n.isFinite()) return "0"
    // 防御：异常大数（含 2^31 这类整型溢出脏数据）不当金额展示
    if (kotlin.math.abs(n) > 99_999_999) return "—"
    val v = kotlin.math.round(n * 100) / 100.0
    return if (v == v.toLong().toDouble()) v.toLong().toString() else "%.2f".format(v)
}

/** 结余角标：圆整到元，脏数据不显示 */
private fun fmtBalanceBadge(n: Double): String? {
    if (!n.isFinite() || kotlin.math.abs(n) > 99_999_999) return null
    if (kotlin.math.abs(n) < 0.01) return null
    val yuan = kotlin.math.round(n).toLong()
    return if (yuan > 0) "+$yuan" else "$yuan"
}

private fun parseColor(hex: String): Color = runCatching {
    Color(android.graphics.Color.parseColor(if (hex.startsWith("#")) hex else "#$hex"))
}.getOrDefault(ZhijingColors.BrandHot)

/**
 * AA 分账主页（对齐 RN SettlementScreen，源：cyy 合入 wyf 后的完整版）
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun SettlementScreen(
    tripId: String,
    title: String?,
    onBack: () -> Unit,
    onOpenExpenses: () -> Unit,
    onOpenFlows: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var user by remember { mutableStateOf<User?>(null) }
    var members by remember { mutableStateOf(emptyList<TripMemberDto>()) }
    var expenses by remember { mutableStateOf(emptyList<ExpenseDto>()) }
    var settlement by remember { mutableStateOf<SettlementDataDto?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var memberSheet by remember { mutableStateOf<MemberSheetState?>(null) }
    var memberName by remember { mutableStateOf("") }
    var deleteTarget by remember { mutableStateOf<TripMemberDto?>(null) }

    fun reload() {
        scope.launch {
            loading = true
            error = null
            runCatching {
                user = runCatching { ApiClient.auth.me() }.getOrNull()
                members = ApiClient.trips.splitMembers(tripId)
                expenses = ApiClient.trips.splitExpenses(tripId)
                settlement = ApiClient.trips.splitSettlement(tripId)
            }.onFailure { error = it.message ?: "加载失败" }
            loading = false
        }
    }

    LaunchedEffect(tripId) { reload() }

    val me = remember(members, user) {
        user?.let { u -> members.find { it.userId == u.id } }
            ?: members.find { it.isOwner }
    }
    val myBalance = settlement?.balances?.find { it.memberId == me?.id }?.balance ?: 0.0
    val owedToMe = if (myBalance > 0) myBalance else 0.0
    val iOwe = if (myBalance < 0) -myBalance else 0.0
    val myFlows = settlement?.flows?.filter { it.fromMemberId == me?.id }.orEmpty()
    val needToPay = myFlows.sumOf { it.amount }
    val totalSpent = expenses.sumOf { it.amount }
    val perPerson = if (members.isNotEmpty()) totalSpent / members.size else 0.0
    val flowCount = settlement?.flows?.size ?: 0
    val clearStatus = when {
        expenses.isNotEmpty() && myBalance == 0.0 -> "已结清"
        needToPay > 0 -> "待转账"
        else -> "—"
    }

    Column(Modifier.fillMaxSize().background(ZhijingColors.Bg)) {
        ScreenHeader(title?.takeIf { it.isNotBlank() } ?: "AA 分账", onBack)

        when {
            loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = ZhijingColors.BrandHot)
            }
            error != null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(error!!, color = ZhijingColors.Danger)
                    Spacer(Modifier.height(12.dp))
                    Text("重试", color = ZhijingColors.BrandHot, modifier = Modifier.clickable { reload() })
                }
            }
            else -> Column(
                Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                // 汇总：别人欠我 / 我欠别人
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    SummaryCard("别人欠我", "¥${fmtMoney(owedToMe)}", Color(0xFF2E7D32),
                        if (owedToMe > 0) "${myFlows.size} 笔待收" else clearStatus, Modifier.weight(1f))
                    SummaryCard("我欠别人", "¥${fmtMoney(iOwe)}", ZhijingColors.Danger,
                        if (iOwe > 0) "${myFlows.size} 笔待付" else clearStatus, Modifier.weight(1f))
                }
                SummaryCard(
                    "我需要支付",
                    "¥${fmtMoney(needToPay)}",
                    ZhijingColors.BrandHot,
                    when {
                        needToPay > 0 -> "转给 ${myFlows.size} 人"
                        expenses.isNotEmpty() -> "无需转账"
                        else -> "—"
                    },
                    Modifier.fillMaxWidth(),
                )

                // 同行人
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text("同行人 · ${members.size}", fontSize = 15.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.weight(1f))
                    Text(
                        "＋ 添加",
                        fontSize = 13.sp,
                        color = ZhijingColors.BrandHot,
                        modifier = Modifier
                            .clip(RoundedCornerShape(12.dp))
                            .background(ZhijingColors.BrandSoft)
                            .clickable {
                                memberSheet = MemberSheetState.Add
                                memberName = ""
                            }
                            .padding(horizontal = 12.dp, vertical = 6.dp),
                    )
                }
                if (members.isEmpty()) {
                    Text("还没有同行人", fontSize = 13.sp, color = ZhijingColors.Muted)
                } else {
                    Row(
                        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        members.forEach { m ->
                            val isMe = m.id == me?.id
                            val bal = settlement?.balances?.find { it.memberId == m.id }?.balance ?: 0.0
                            Row(
                                Modifier
                                    .clip(RoundedCornerShape(16.dp))
                                    .background(if (isMe) ZhijingColors.BrandSoft else ZhijingColors.Card)
                                    .combinedClickable(
                                        onClick = {},
                                        onLongClick = {
                                            if (isMe) {
                                                Toast.makeText(context, "这是你本人", Toast.LENGTH_SHORT).show()
                                            } else {
                                                deleteTarget = m // 先弹出操作：改名/删除用下方 sheet
                                                memberSheet = MemberSheetState.Actions(m)
                                            }
                                        },
                                    )
                                    .padding(horizontal = 10.dp, vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                MemberDot(m.color, m.name)
                                Spacer(Modifier.width(6.dp))
                                Text(m.name, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                                if (isMe) {
                                    Spacer(Modifier.width(4.dp))
                                    Text("我", fontSize = 11.sp, color = ZhijingColors.BrandHot)
                                }
                                fmtBalanceBadge(bal)?.let { badge ->
                                    Spacer(Modifier.width(4.dp))
                                    Text(
                                        badge,
                                        fontSize = 11.sp,
                                        color = if (bal > 0) Color(0xFF2E7D32) else ZhijingColors.Danger,
                                    )
                                }
                            }
                        }
                    }
                    Text("长按同行人可改名 / 删除", fontSize = 12.sp, color = ZhijingColors.Muted)
                }

                // 入口卡
                LinkCard(
                    emoji = "💸",
                    emojiBg = Color(0xFFE8F5E9),
                    title = "结算方案",
                    sub = when {
                        flowCount > 0 -> "$flowCount 笔转账 · 人均 ¥${fmtMoney(perPerson)}"
                        expenses.isNotEmpty() -> "已结清，无需转账"
                        else -> "记完账后自动生成"
                    },
                    onClick = onOpenFlows,
                )
                LinkCard(
                    emoji = "🧾",
                    emojiBg = Color(0xFFE1F5FE),
                    title = "消费明细",
                    sub = if (expenses.isNotEmpty()) "${expenses.size} 笔 · 合计 ¥${fmtMoney(totalSpent)}" else "还没有记账",
                    onClick = onOpenExpenses,
                )
                Spacer(Modifier.height(24.dp))
            }
        }
    }

    // 操作：改名 / 删除
    when (val sheet = memberSheet) {
        is MemberSheetState.Actions -> {
            AlertDialog(
                onDismissRequest = { memberSheet = null },
                title = { Text(sheet.member.name) },
                text = { Text("选择操作") },
                confirmButton = {
                    TextButton(onClick = {
                        memberName = sheet.member.name
                        memberSheet = MemberSheetState.Rename(sheet.member)
                    }) { Text("改名") }
                },
                dismissButton = {
                    Row {
                        TextButton(onClick = {
                            deleteTarget = sheet.member
                            memberSheet = null
                        }) { Text("删除", color = ZhijingColors.Danger) }
                        TextButton(onClick = { memberSheet = null }) { Text("取消") }
                    }
                },
            )
        }
        MemberSheetState.Add, is MemberSheetState.Rename -> {
            val isRename = sheet is MemberSheetState.Rename
            AlertDialog(
                onDismissRequest = { memberSheet = null },
                title = { Text(if (isRename) "改名" else "添加同行人") },
                text = {
                    TextField(
                        value = memberName,
                        onValueChange = { memberName = it },
                        placeholder = { Text("输入姓名") },
                        singleLine = true,
                        colors = fieldColors(),
                    )
                },
                confirmButton = {
                    TextButton(onClick = {
                        if (memberName.isBlank()) return@TextButton
                        scope.launch {
                            runCatching {
                                when (sheet) {
                                    is MemberSheetState.Rename ->
                                        ApiClient.trips.renameSplitMember(
                                            tripId, sheet.member.id, MemberNamePayload(memberName.trim()),
                                        )
                                    else ->
                                        ApiClient.trips.addSplitMember(tripId, MemberNamePayload(memberName.trim()))
                                }
                            }.onFailure {
                                Toast.makeText(context, "保存失败：${it.message}", Toast.LENGTH_SHORT).show()
                            }
                            memberSheet = null
                            reload()
                        }
                    }) { Text("保存") }
                },
                dismissButton = { TextButton(onClick = { memberSheet = null }) { Text("取消") } },
            )
        }
        null -> Unit
    }

    deleteTarget?.let { m ->
        if (memberSheet == null) {
            AlertDialog(
                onDismissRequest = { deleteTarget = null },
                title = { Text("删除同行人") },
                text = { Text("确定把「${m.name}」移出本次行程吗？") },
                confirmButton = {
                    TextButton(onClick = {
                        scope.launch {
                            runCatching { ApiClient.trips.removeSplitMember(tripId, m.id) }
                                .onFailure {
                                    Toast.makeText(context, "删除失败：${it.message}", Toast.LENGTH_SHORT).show()
                                }
                            deleteTarget = null
                            reload()
                        }
                    }) { Text("删除", color = ZhijingColors.Danger) }
                },
                dismissButton = { TextButton(onClick = { deleteTarget = null }) { Text("取消") } },
            )
        }
    }
}

private sealed class MemberSheetState {
    data object Add : MemberSheetState()
    data class Rename(val member: TripMemberDto) : MemberSheetState()
    data class Actions(val member: TripMemberDto) : MemberSheetState()
}

@Composable
fun SettlementExpensesScreen(tripId: String, onBack: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var expenses by remember { mutableStateOf(emptyList<ExpenseDto>()) }
    var members by remember { mutableStateOf(emptyList<TripMemberDto>()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var sheetOpen by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<ExpenseDto?>(null) }
    var deleteExp by remember { mutableStateOf<ExpenseDto?>(null) }

    fun reload() {
        scope.launch {
            loading = true
            error = null
            runCatching {
                members = ApiClient.trips.splitMembers(tripId)
                expenses = ApiClient.trips.splitExpenses(tripId)
            }.onFailure { error = it.message }
            loading = false
        }
    }

    LaunchedEffect(tripId) { reload() }

    fun openAdd(expense: ExpenseDto? = null) {
        editing = expense
        sheetOpen = true
    }

    val totalSpent = expenses.sumOf { it.amount }

    Column(Modifier.fillMaxSize().background(ZhijingColors.Bg)) {
        ScreenHeader("消费明细", onBack)
        when {
            loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = ZhijingColors.BrandHot)
            }
            error != null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(error!!, color = ZhijingColors.Danger)
            }
            else -> Column(Modifier.fillMaxSize().padding(16.dp)) {
                Text(
                    "共 ${expenses.size} 笔" + if (totalSpent > 0) " · 合计 ¥${fmtMoney(totalSpent)}" else "",
                    fontSize = 13.sp,
                    color = ZhijingColors.Muted,
                )
                Spacer(Modifier.height(12.dp))
                Box(
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(16.dp))
                        .background(ZhijingColors.BrandHot)
                        .clickable {
                            if (members.isEmpty()) {
                                Toast.makeText(context, "请先添加同行人", Toast.LENGTH_SHORT).show()
                            } else openAdd()
                        }
                        .padding(vertical = 14.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("＋ 记一笔", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = Color.White)
                }
                Spacer(Modifier.height(12.dp))
                if (expenses.isEmpty()) {
                    Box(Modifier.fillMaxWidth().padding(top = 40.dp), contentAlignment = Alignment.Center) {
                        Text("还没有记账记录", color = ZhijingColors.Muted)
                    }
                } else {
                    LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(expenses, key = { it.id }) { e ->
                            Row(
                                Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(14.dp))
                                    .background(ZhijingColors.Card)
                                    .clickable { openAdd(e) }
                                    .padding(14.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(Modifier.weight(1f)) {
                                    Text(e.title, fontWeight = FontWeight.Medium)
                                    Text("${e.paidByName} 支付", fontSize = 12.sp, color = ZhijingColors.Muted)
                                }
                                Text("¥${fmtMoney(e.amount)}", fontWeight = FontWeight.Bold)
                                Spacer(Modifier.width(10.dp))
                                Text(
                                    "删",
                                    fontSize = 13.sp,
                                    color = ZhijingColors.Danger,
                                    modifier = Modifier.clickable { deleteExp = e },
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    if (sheetOpen) {
        ExpenseSheet(
            members = members,
            initial = editing,
            onClose = { sheetOpen = false },
            onSave = { payload ->
                val edit = editing
                if (edit != null) ApiClient.trips.updateSplitExpense(tripId, edit.id, payload)
                else ApiClient.trips.addSplitExpense(tripId, payload)
                reload()
            },
        )
    }

    deleteExp?.let { e ->
        AlertDialog(
            onDismissRequest = { deleteExp = null },
            title = { Text("删除这笔") },
            text = { Text("确定删除「${e.title}」¥${fmtMoney(e.amount)} 吗？") },
            confirmButton = {
                TextButton(onClick = {
                    scope.launch {
                        runCatching { ApiClient.trips.removeSplitExpense(tripId, e.id) }
                        deleteExp = null
                        reload()
                    }
                }) { Text("删除", color = ZhijingColors.Danger) }
            },
            dismissButton = { TextButton(onClick = { deleteExp = null }) { Text("取消") } },
        )
    }
}

@Composable
fun SettlementFlowsScreen(tripId: String, onBack: () -> Unit) {
    var settlement by remember { mutableStateOf<SettlementDataDto?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var paidSet by remember { mutableStateOf(setOf<Int>()) }

    LaunchedEffect(tripId) {
        loading = true
        runCatching { ApiClient.trips.splitSettlement(tripId) }
            .onSuccess { settlement = it; error = null }
            .onFailure { error = it.message }
        loading = false
    }

    val flows = settlement?.flows.orEmpty()
    val balances = settlement?.balances.orEmpty().filter { kotlin.math.abs(it.balance) > 0.01 }

    Column(Modifier.fillMaxSize().background(ZhijingColors.Bg)) {
        ScreenHeader("结算方案", onBack)
        when {
            loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = ZhijingColors.BrandHot)
            }
            error != null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(error!!, color = ZhijingColors.Danger)
            }
            else -> LazyColumn(
                Modifier.fillMaxSize().padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                if (balances.isNotEmpty()) {
                    item { Text("结余一览", fontWeight = FontWeight.Bold) }
                    items(balances) { b ->
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                MemberDot(b.color, b.name)
                                Spacer(Modifier.width(8.dp))
                                Text(b.name)
                            }
                            Text(
                                if (b.balance >= 0) "+¥${fmtMoney(b.balance)}" else "-¥${fmtMoney(-b.balance)}",
                                color = if (b.balance >= 0) Color(0xFF2E7D32) else ZhijingColors.Danger,
                                fontWeight = FontWeight.Medium,
                            )
                        }
                    }
                    item { Spacer(Modifier.height(8.dp)); Text("转账建议", fontWeight = FontWeight.Bold) }
                }
                if (flows.isEmpty()) {
                    item {
                        Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) {
                            Text("暂无转账建议，大家已结清 🎉", color = ZhijingColors.Muted)
                        }
                    }
                } else {
                    itemsIndexed(flows) { i, f ->
                        val paid = i in paidSet
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(14.dp))
                                .background(if (paid) ZhijingColors.BgSurface else ZhijingColors.Card)
                                .clickable {
                                    paidSet = if (paid) paidSet - i else paidSet + i
                                }
                                .padding(14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(
                                    "${f.fromName} → ${f.toName}",
                                    fontWeight = FontWeight.Medium,
                                    color = if (paid) ZhijingColors.Muted else ZhijingColors.Ink,
                                )
                                Text(
                                    if (paid) "已标记支付 · 再点取消" else "点按标记已支付",
                                    fontSize = 11.sp,
                                    color = ZhijingColors.Muted,
                                )
                            }
                            Text(
                                "¥${fmtMoney(f.amount)}",
                                fontWeight = FontWeight.Bold,
                                color = if (paid) ZhijingColors.Muted else ZhijingColors.BrandHot,
                            )
                        }
                    }
                }
            }
        }
    }
}

/**
 * 记一笔 / 编辑一笔底部表单（对齐 RN ExpenseSheet）
 * 保存失败时抛错，弹层保持打开。
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ExpenseSheet(
    members: List<TripMemberDto>,
    initial: ExpenseDto?,
    onClose: () -> Unit,
    onSave: suspend (ExpenseInputDto) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var title by remember { mutableStateOf(initial?.title.orEmpty()) }
    var amount by remember { mutableStateOf(initial?.amount?.let { fmtMoney(it) }.orEmpty()) }
    var paidBy by remember { mutableStateOf(initial?.paidByMemberId) }
    var splitIds by remember {
        mutableStateOf(
            if (initial != null) initial.splits.map { it.memberId }.toSet()
            else members.map { it.id }.toSet(),
        )
    }
    var saving by remember { mutableStateOf(false) }

    val valid = title.trim().isNotEmpty() &&
        (amount.toDoubleOrNull() ?: 0.0) > 0 &&
        paidBy != null &&
        splitIds.isNotEmpty()

    fun save() {
        if (!valid || saving) return
        val amt = amount.toDoubleOrNull() ?: return
        val pid = paidBy ?: return
        if (amt > 1_000_000) {
            Toast.makeText(context, "金额过大，请检查", Toast.LENGTH_SHORT).show()
            return
        }
        saving = true
        scope.launch {
            runCatching {
                onSave(
                    ExpenseInputDto(
                        title = title.trim(),
                        amount = kotlin.math.round(amt * 100) / 100.0,
                        paidByMemberId = pid,
                        paidAt = null,
                        splits = splitIds.map { ExpenseSplitInputDto(it, null) },
                    ),
                )
            }.fold(
                onSuccess = { onClose() },
                onFailure = {
                    Toast.makeText(context, "保存失败：${it.message}", Toast.LENGTH_SHORT).show()
                },
            )
            saving = false
        }
    }

    Dialog(
        onDismissRequest = { if (!saving) onClose() },
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Box(
            Modifier
                .fillMaxSize()
                .background(Color(0x66000000))
                .imePadding(),
            contentAlignment = Alignment.BottomCenter,
        ) {
            Box(
                Modifier
                    .fillMaxSize()
                    .clickable(enabled = !saving, onClick = onClose),
            )
            Column(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp))
                    .background(ZhijingColors.Bg)
                    .clickable(onClick = {})
                    .navigationBarsPadding()
                    .padding(horizontal = 20.dp)
                    .padding(top = 14.dp, bottom = 28.dp)
                    .verticalScroll(rememberScrollState()),
            ) {
                Box(
                    Modifier
                        .align(Alignment.CenterHorizontally)
                        .width(40.dp)
                        .height(4.dp)
                        .clip(RoundedCornerShape(2.dp))
                        .background(Color(0xFFE3E8EF)),
                )
                Spacer(Modifier.height(14.dp))
                Text(
                    if (initial != null) "编辑这笔" else "记一笔",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = ZhijingColors.Ink,
                )

                ExpenseFieldLabel("是什么钱")
                ExpenseInput(
                    value = title,
                    onValueChange = { title = it },
                    placeholder = "如：晚餐、打车、门票…",
                    singleLine = true,
                )

                ExpenseFieldLabel("金额（元）")
                ExpenseInput(
                    value = amount,
                    onValueChange = { amount = it },
                    placeholder = "0.00",
                    singleLine = true,
                    keyboardType = KeyboardType.Decimal,
                )

                ExpenseFieldLabel("谁付的钱")
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    members.forEach { m ->
                        MemberChip(
                            member = m,
                            selected = paidBy == m.id,
                            onClick = { paidBy = m.id },
                        )
                    }
                }

                ExpenseFieldLabel("分摊给谁（默认均摊）")
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    members.forEach { m ->
                        val on = m.id in splitIds
                        MemberChip(
                            member = m,
                            selected = on,
                            onClick = {
                                splitIds = if (on) splitIds - m.id else splitIds + m.id
                            },
                        )
                    }
                }

                Spacer(Modifier.height(14.dp))
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        "取消",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        color = ZhijingColors.Muted,
                        modifier = Modifier
                            .clickable(enabled = !saving, onClick = onClose)
                            .padding(8.dp),
                    )
                    Box(
                        Modifier
                            .clip(RoundedCornerShape(999.dp))
                            .background(ZhijingColors.BrandHot.copy(alpha = if (valid && !saving) 1f else 0.45f))
                            .clickable(enabled = valid && !saving, onClick = ::save)
                            .padding(horizontal = 28.dp, vertical = 13.dp),
                    ) {
                        Text(
                            if (saving) "保存中…" else "保存",
                            fontSize = 15.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = Color.White,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ExpenseFieldLabel(text: String) {
    Text(
        text,
        fontSize = 13.sp,
        fontWeight = FontWeight.Bold,
        color = ZhijingColors.Muted,
        modifier = Modifier.padding(top = 10.dp, bottom = 6.dp),
    )
}

@Composable
private fun ExpenseInput(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    singleLine: Boolean,
    keyboardType: KeyboardType = KeyboardType.Text,
) {
    BasicTextField(
        value = value,
        onValueChange = onValueChange,
        singleLine = singleLine,
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
        textStyle = TextStyle(fontSize = 16.sp, color = ZhijingColors.Ink),
        cursorBrush = SolidColor(ZhijingColors.BrandHot),
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .border(1.dp, ZhijingColors.Line, RoundedCornerShape(16.dp))
            .background(ZhijingColors.Card)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        decorationBox = { inner ->
            Box {
                if (value.isEmpty()) {
                    Text(placeholder, fontSize = 16.sp, color = Color(0xFFB9C2CC))
                }
                inner()
            }
        },
    )
}

@Composable
private fun MemberChip(
    member: TripMemberDto,
    selected: Boolean,
    onClick: () -> Unit,
) {
    Row(
        Modifier
            .clip(RoundedCornerShape(999.dp))
            .border(
                1.dp,
                if (selected) ZhijingColors.BrandHot else ZhijingColors.Line,
                RoundedCornerShape(999.dp),
            )
            .background(if (selected) ZhijingColors.BrandSoft else Color(0xFFF5F8FB))
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        MemberDot(member.color, member.name, 22.dp)
        Spacer(Modifier.width(6.dp))
        Text(
            member.name,
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold,
            color = if (selected) ZhijingColors.BrandHot else ZhijingColors.Ink,
        )
    }
}

@Composable
private fun MemberDot(color: String, name: String, size: Dp = 22.dp) {
    Box(
        Modifier.size(size).clip(CircleShape).background(parseColor(color)),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            name.take(1),
            fontSize = (size.value * 0.45f).sp,
            color = Color.White,
            fontWeight = FontWeight.Bold,
        )
    }
}

@Composable
private fun SummaryCard(label: String, value: String, valueColor: Color, sub: String, modifier: Modifier = Modifier) {
    Column(
        modifier
            .shadow(4.dp, RoundedCornerShape(16.dp))
            .clip(RoundedCornerShape(16.dp))
            .background(ZhijingColors.Card)
            .padding(14.dp),
    ) {
        Text(label, fontSize = 12.sp, color = ZhijingColors.Muted)
        Spacer(Modifier.height(4.dp))
        Text(value, fontSize = 22.sp, fontWeight = FontWeight.Bold, color = valueColor)
        Spacer(Modifier.height(2.dp))
        Text(sub, fontSize = 11.sp, color = ZhijingColors.Muted)
    }
}

@Composable
private fun LinkCard(emoji: String, emojiBg: Color, title: String, sub: String, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .shadow(4.dp, RoundedCornerShape(16.dp))
            .clip(RoundedCornerShape(16.dp))
            .background(ZhijingColors.Card)
            .clickable(onClick = onClick)
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(44.dp).clip(RoundedCornerShape(12.dp)).background(emojiBg),
            contentAlignment = Alignment.Center,
        ) { Text(emoji, fontSize = 22.sp) }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(title, fontWeight = FontWeight.SemiBold)
            Text(sub, fontSize = 12.sp, color = ZhijingColors.Muted)
        }
        Text("›", fontSize = 20.sp, color = ZhijingColors.Muted)
    }
}

@Composable
private fun fieldColors() = TextFieldDefaults.colors(
    focusedContainerColor = ZhijingColors.Card,
    unfocusedContainerColor = ZhijingColors.Card,
    focusedIndicatorColor = Color.Transparent,
    unfocusedIndicatorColor = Color.Transparent,
)
