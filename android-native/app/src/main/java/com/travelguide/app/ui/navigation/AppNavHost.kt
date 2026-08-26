package com.travelguide.app.ui.navigation

import android.net.Uri
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import androidx.compose.runtime.Composable
import com.travelguide.app.data.local.TokenStore
import com.travelguide.app.ui.screens.LoginScreen
import com.travelguide.app.ui.screens.chat.ChatScreen
import com.travelguide.app.ui.screens.city.CityGuideScreen
import com.travelguide.app.ui.screens.explore.CollectionDetailScreen
import com.travelguide.app.ui.screens.explore.SharedCollectionsScreen
import com.travelguide.app.ui.screens.explore.TravelSearchScreen
import com.travelguide.app.ui.screens.explore.UserProfileScreen
import com.travelguide.app.ui.screens.generate.GenerateScreen
import com.travelguide.app.ui.screens.main.MainScreen
import com.travelguide.app.ui.screens.me.FavoritesScreen
import com.travelguide.app.ui.screens.me.FootprintOverviewScreen
import com.travelguide.app.ui.screens.me.MySubscriptionsScreen
import com.travelguide.app.ui.screens.settings.ModelManageScreen
import com.travelguide.app.ui.screens.settings.SettingsScreen
import com.travelguide.app.ui.screens.share.ShareScreen
import com.travelguide.app.ui.screens.trip.TripDetailScreen

/** 路由表（对齐 RN App.tsx 栈；主框架为底部 Tab 的 MAIN） */
object Routes {
    const val LOGIN = "login"
    const val MAIN = "main"
    const val TRIP_DETAIL = "tripDetail/{tripId}"
    const val CHAT = "chat/{tripId}"
    const val GENERATE = "generate?dest={dest}"
    const val SHARE = "share"
    const val SETTINGS = "settings"
    const val MODEL_MANAGE = "modelManage"
    const val SHARED_COLLECTIONS = "sharedCollections"
    const val COLLECTION_DETAIL = "collectionDetail/{collectionId}"
    const val USER_PROFILE = "userProfile/{userId}/{username}"
    const val CITY_GUIDE = "cityGuide/{city}"
    const val TRAVEL_SEARCH = "travelSearch"
    const val FAVORITES = "favorites"
    const val MY_SUBSCRIPTIONS = "mySubscriptions"
    const val FOOTPRINT_OVERVIEW = "footprintOverview"

    fun tripDetail(tripId: String) = "tripDetail/$tripId"
    fun chat(tripId: String) = "chat/$tripId"
    fun generate(dest: String? = null) =
        if (dest.isNullOrBlank()) "generate" else "generate?dest=${Uri.encode(dest)}"
    fun collectionDetail(id: String) = "collectionDetail/$id"
    fun userProfile(userId: String, username: String) = "userProfile/$userId/${Uri.encode(username)}"
    fun cityGuide(city: String) = "cityGuide/${Uri.encode(city)}"
}

@Composable
fun AppNavHost() {
    val navController = rememberNavController()
    // 已登录直接进主框架（默认探索页）；未登录进登录页（对齐 RN 版 auth-gate 逻辑）
    val start = if (TokenStore.getSync() == null) Routes.LOGIN else Routes.MAIN

    NavHost(navController = navController, startDestination = start) {
        composable(Routes.LOGIN) {
            LoginScreen(
                onLoggedIn = {
                    navController.navigate(Routes.MAIN) {
                        popUpTo(Routes.LOGIN) { inclusive = true }
                    }
                },
            )
        }
        composable(Routes.MAIN) {
            MainScreen(
                onOpenTrip = { tripId -> navController.navigate(Routes.tripDetail(tripId)) },
                onOpenGenerate = { dest -> navController.navigate(Routes.generate(dest)) },
                onOpenShare = { navController.navigate(Routes.SHARE) },
                onOpenSettings = { navController.navigate(Routes.SETTINGS) },
                onOpenChat = { navController.navigate(Routes.chat("none")) },
                onOpenCityGuide = { city -> navController.navigate(Routes.cityGuide(city)) },
                onOpenSharedCollections = { navController.navigate(Routes.SHARED_COLLECTIONS) },
                onOpenCollectionDetail = { id -> navController.navigate(Routes.collectionDetail(id)) },
                onOpenUserProfile = { uid, name -> navController.navigate(Routes.userProfile(uid, name)) },
                onOpenTravelSearch = { navController.navigate(Routes.TRAVEL_SEARCH) },
                onOpenFavorites = { navController.navigate(Routes.FAVORITES) },
                onOpenSubscriptions = { navController.navigate(Routes.MY_SUBSCRIPTIONS) },
                onOpenFootprints = { navController.navigate(Routes.FOOTPRINT_OVERVIEW) },
            )
        }
        composable(
            route = Routes.GENERATE,
            arguments = listOf(
                navArgument("dest") { type = NavType.StringType; nullable = true; defaultValue = null },
            ),
        ) { entry ->
            GenerateScreen(
                initialDestination = entry.arguments?.getString("dest"),
                onBack = { navController.popBackStack() },
                onGenerated = { tripId ->
                    navController.navigate(Routes.tripDetail(tripId)) {
                        popUpTo(Routes.MAIN)
                    }
                },
            )
        }
        composable(
            route = Routes.TRIP_DETAIL,
            arguments = listOf(navArgument("tripId") { type = NavType.StringType }),
        ) { backStackEntry ->
            val tripId = backStackEntry.arguments?.getString("tripId").orEmpty()
            TripDetailScreen(
                tripId = tripId,
                onBack = { navController.popBackStack() },
                onOpenChat = { navController.navigate(Routes.chat(tripId)) },
            )
        }
        composable(
            route = Routes.CHAT,
            arguments = listOf(navArgument("tripId") { type = NavType.StringType }),
        ) { backStackEntry ->
            val chatTripId = backStackEntry.arguments?.getString("tripId")
            ChatScreen(
                tripId = chatTripId?.takeIf { it != "none" },
                onBack = { navController.popBackStack() },
                onOpenTrip = { id -> navController.navigate(Routes.tripDetail(id)) },
            )
        }
        composable(Routes.SHARE) {
            ShareScreen(
                initialToken = null,
                onBack = { navController.popBackStack() },
                onOpenTrip = { id ->
                    navController.navigate(Routes.tripDetail(id)) {
                        popUpTo(Routes.MAIN)
                    }
                },
            )
        }
        composable(Routes.SETTINGS) {
            SettingsScreen(
                onBack = { navController.popBackStack() },
                onOpenModelManage = { navController.navigate(Routes.MODEL_MANAGE) },
                onLoggedOut = {
                    navController.navigate(Routes.LOGIN) {
                        popUpTo(0) { inclusive = true }
                    }
                },
            )
        }
        composable(Routes.MODEL_MANAGE) {
            ModelManageScreen(onBack = { navController.popBackStack() })
        }
        composable(Routes.SHARED_COLLECTIONS) {
            SharedCollectionsScreen(
                onBack = { navController.popBackStack() },
                onOpenDetail = { id -> navController.navigate(Routes.collectionDetail(id)) },
                onOpenAuthor = { uid, name -> navController.navigate(Routes.userProfile(uid, name)) },
            )
        }
        composable(
            route = Routes.COLLECTION_DETAIL,
            arguments = listOf(navArgument("collectionId") { type = NavType.StringType }),
        ) { entry ->
            CollectionDetailScreen(
                collectionId = entry.arguments?.getString("collectionId").orEmpty(),
                onBack = { navController.popBackStack() },
                onOpenAuthor = { uid, name -> navController.navigate(Routes.userProfile(uid, name)) },
            )
        }
        composable(
            route = Routes.USER_PROFILE,
            arguments = listOf(
                navArgument("userId") { type = NavType.StringType },
                navArgument("username") { type = NavType.StringType },
            ),
        ) { entry ->
            UserProfileScreen(
                userId = entry.arguments?.getString("userId").orEmpty(),
                username = entry.arguments?.getString("username").orEmpty(),
                onBack = { navController.popBackStack() },
                onOpenDetail = { id -> navController.navigate(Routes.collectionDetail(id)) },
            )
        }
        composable(
            route = Routes.CITY_GUIDE,
            arguments = listOf(navArgument("city") { type = NavType.StringType }),
        ) { entry ->
            CityGuideScreen(
                city = entry.arguments?.getString("city").orEmpty(),
                onBack = { navController.popBackStack() },
                onOpenGenerate = { dest -> navController.navigate(Routes.generate(dest)) },
            )
        }
        composable(Routes.TRAVEL_SEARCH) {
            TravelSearchScreen(onBack = { navController.popBackStack() })
        }
        composable(Routes.FAVORITES) {
            FavoritesScreen(onBack = { navController.popBackStack() })
        }
        composable(Routes.MY_SUBSCRIPTIONS) {
            MySubscriptionsScreen(
                onBack = { navController.popBackStack() },
                onOpenDetail = { id -> navController.navigate(Routes.collectionDetail(id)) },
            )
        }
        composable(Routes.FOOTPRINT_OVERVIEW) {
            FootprintOverviewScreen(onBack = { navController.popBackStack() })
        }
    }
}
