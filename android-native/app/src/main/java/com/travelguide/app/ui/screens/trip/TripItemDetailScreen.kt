package com.travelguide.app.ui.screens.trip

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.travelguide.app.data.api.ApiClient
import com.travelguide.app.data.model.Trip
import com.travelguide.app.ui.components.ScreenHeader
import com.travelguide.app.ui.theme.ZhijingColors

/** 单条行程项详情（对齐 RN TripItemDetailScreen + ItemBlock） */
@Composable
fun TripItemDetailScreen(
    tripId: String,
    itemId: String,
    onBack: () -> Unit,
) {
    var trip by remember { mutableStateOf<Trip?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(tripId) {
        runCatching { ApiClient.trips.get(tripId) }.fold(
            onSuccess = { trip = it },
            onFailure = { error = it.message },
        )
    }

    val found = remember(trip, itemId) {
        trip?.days?.firstNotNullOfOrNull { day ->
            val idx = day.items.indexOfFirst { it.id == itemId }
            if (idx >= 0) Triple(day, day.items[idx], idx) else null
        }
    }

    Column(Modifier.fillMaxSize().background(ZhijingColors.Bg)) {
        ScreenHeader("行程详情", onBack)
        when {
            error != null && trip == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(error!!, color = ZhijingColors.Danger)
            }
            trip == null || found == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = ZhijingColors.BrandHot)
            }
            else -> {
                val (day, item, idx) = found!!
                val hasNext = day.items.drop(idx + 1).any { it.selected && it.location != null }
                Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp)) {
                    TripItemBlock(
                        item = item,
                        tripId = tripId,
                        destination = trip!!.destination,
                        canEdit = trip!!.canEdit == true,
                        hasNextRoute = hasNext,
                        onChanged = { trip = it },
                    )
                }
            }
        }
    }
}
