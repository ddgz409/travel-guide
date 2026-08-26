package com.travelguide.app.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * 核心领域模型 —— 与 packages/shared/src/types.ts 一一对齐。
 * 后端为 snake_case，Json 配置统一 SnakeCase 命名策略（见 ApiClient）。
 */

// ---------- 认证 / 用户 ----------

@Serializable
data class User(
    val id: String,
    val username: String,
    @SerialName("created_at") val createdAt: String = "",
    val avatar: String? = null,
)

@Serializable
data class Token(
    @SerialName("access_token") val accessToken: String,
    @SerialName("token_type") val tokenType: String = "bearer",
    val user: User,
)

// ---------- 行程核心 ----------

@Serializable
data class Location(
    val lng: Double,
    val lat: Double,
    val address: String? = null,
)

@Serializable
data class RouteStep(
    val type: String = "",
    val instruction: String? = null,
    @SerialName("distance_m") val distanceM: Double? = null,
    @SerialName("line_name") val lineName: String? = null,
    @SerialName("line_type") val lineType: String? = null,
    @SerialName("departure_stop") val departureStop: String? = null,
    @SerialName("arrival_stop") val arrivalStop: String? = null,
    @SerialName("via_stops") val viaStops: Int? = null,
    val road: String? = null,
)

@Serializable
data class TransportScheme(
    @SerialName("distance_m") val distanceM: Double = 0.0,
    @SerialName("duration_s") val durationS: Double = 0.0,
    val cost: Double? = null,
    @SerialName("walking_distance_m") val walkingDistanceM: Double? = null,
    val detail: List<RouteStep> = emptyList(),
    val polyline: List<List<Double>>? = null,
)

@Serializable
data class TransportEndpoint(
    val lng: Double,
    val lat: Double,
    val name: String? = null,
)

@Serializable
data class TransportToNext(
    val mode: String = "",
    @SerialName("distance_m") val distanceM: Double = 0.0,
    @SerialName("duration_s") val durationS: Double = 0.0,
    val detail: List<RouteStep>? = null,
    @SerialName("departure_time") val departureTime: String? = null,
    @SerialName("arrival_time") val arrivalTime: String? = null,
    val schemes: List<TransportScheme>? = null,
    @SerialName("scheme_index") val schemeIndex: Int? = null,
    val polyline: List<List<Double>>? = null,
    @SerialName("from_location") val fromLocation: TransportEndpoint? = null,
    @SerialName("to_location") val toLocation: TransportEndpoint? = null,
    @SerialName("to_name") val toName: String? = null,
    @SerialName("from_name") val fromName: String? = null,
)

@Serializable
data class Alternative(
    @SerialName("poi_id") val poiId: String? = null,
    val name: String = "",
    val location: Location? = null,
    val rating: Double? = null,
    val address: String? = null,
)

@Serializable
data class Item(
    // 路线方案草稿（preferences.route_options[].days[].items）无 id，给默认值避免解析失败
    val id: String = "",
    val seq: Int = 0,
    @SerialName("time_slot") val timeSlot: String = "",
    val type: String = "",
    val name: String = "",
    @SerialName("poi_id") val poiId: String? = null,
    val location: Location? = null,
    val description: String? = null,
    @SerialName("duration_min") val durationMin: Int? = null,
    val cost: Double? = null,
    val rating: Double? = null,
    val selected: Boolean = true,
    val alternatives: List<Alternative>? = null,
    @SerialName("transport_to_next") val transportToNext: TransportToNext? = null,
)

@Serializable
data class Day(
    val id: String = "",
    @SerialName("day_index") val dayIndex: Int = 0,
    val date: String = "",
    val city: String? = null,
    val summary: String? = null,
    val items: List<Item> = emptyList(),
)

@Serializable
data class ExternalTip(
    val source: String = "",
    val title: String = "",
    val snippet: String = "",
    val url: String = "",
)

@Serializable
data class ExternalRefs(
    val xiaohongshu: List<ExternalTip> = emptyList(),
    val ctrip: List<ExternalTip> = emptyList(),
)

@Serializable
data class RouteOption(
    val id: String,
    val title: String = "",
    val theme: String = "",
    val tagline: String? = null,
    val highlights: List<String>? = null,
    @SerialName("estimated_cost") val estimatedCost: Double? = null,
    val days: List<Day>? = null,
)

@Serializable
data class TripPreferences(
    val interests: List<String>? = null,
    @SerialName("budget_level") val budgetLevel: String? = null,
    val transport: String? = null,
    @SerialName("selected_route_id") val selectedRouteId: String? = null,
    @SerialName("route_options") val routeOptions: List<RouteOption>? = null,
)

@Serializable
data class HotelCandidate(
    val name: String = "",
    val url: String = "",
    val score: Double? = null,
    val tags: List<String>? = null,
    @SerialName("good_rate") val goodRate: Double? = null,
    @SerialName("open_year") val openYear: Int? = null,
    @SerialName("metro_distance_m") val metroDistanceM: Double? = null,
    @SerialName("avg_dist_m") val avgDistM: Double? = null,
    @SerialName("nearest_attraction") val nearestAttraction: String? = null,
    @SerialName("nearest_dist_m") val nearestDistM: Double? = null,
)

@Serializable
data class Collaborator(
    @SerialName("user_id") val userId: String = "",
    val username: String = "",
    val role: String = "collaborator",
    @SerialName("joined_at") val joinedAt: String? = null,
    val avatar: String? = null,
)

@Serializable
data class Trip(
    val id: String,
    val title: String = "",
    val destination: String = "",
    val route: List<String>? = null,
    @SerialName("start_date") val startDate: String = "",
    @SerialName("end_date") val endDate: String = "",
    val travelers: Int = 1,
    @SerialName("budget_total") val budgetTotal: Double? = null,
    val preferences: TripPreferences = TripPreferences(),
    @SerialName("external_refs") val externalRefs: ExternalRefs? = null,
    @SerialName("hotel_fetch_status") val hotelFetchStatus: String? = null,
    @SerialName("hotel_candidates") val hotelCandidates: List<HotelCandidate>? = null,
    val status: String = "ready",
    @SerialName("error_msg") val errorMsg: String? = null,
    @SerialName("share_token") val shareToken: String? = null,
    @SerialName("share_mode") val shareMode: String? = null,
    @SerialName("can_edit") val canEdit: Boolean? = null,
    val collaborators: List<Collaborator>? = null,
    @SerialName("created_at") val createdAt: String = "",
    @SerialName("updated_at") val updatedAt: String = "",
    val days: List<Day> = emptyList(),
)

@Serializable
data class TripListItem(
    val id: String,
    val title: String = "",
    val destination: String = "",
    @SerialName("start_date") val startDate: String = "",
    @SerialName("end_date") val endDate: String = "",
    val travelers: Int = 1,
    @SerialName("budget_total") val budgetTotal: Double? = null,
    val status: String = "ready",
    @SerialName("created_at") val createdAt: String = "",
)

// ---------- POI 搜索 ----------

@Serializable
data class PoiSearchResult(
    @SerialName("poi_id") val poiId: String = "",
    val name: String = "",
    val location: Location? = null,
    val rating: Double? = null,
    val type: String = "",
    val address: String = "",
    val tel: String? = null,
    val opentime: String? = null,
)

// ---------- 请求体 ----------

@Serializable
data class AuthPayload(val username: String, val password: String)

@Serializable
data class ItemCreate(
    val name: String,
    @SerialName("poi_id") val poiId: String? = null,
    val location: Location? = null,
    val type: String? = null,
    @SerialName("time_slot") val timeSlot: String? = null,
    val description: String? = null,
    @SerialName("duration_min") val durationMin: Int? = null,
    val cost: Double? = null,
    val rating: Double? = null,
)

@Serializable
data class ReorderEntry(
    @SerialName("item_id") val itemId: String,
    @SerialName("new_seq") val newSeq: Int,
)

@Serializable
data class ReorderPayload(val items: List<ReorderEntry>)
