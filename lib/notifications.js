// lib/notifications.js
//
// Central notification service for the driver app.
// Handles:
//   • Push token registration (Expo + native device token)
//   • Android notification channel setup with custom sound
//   • Foreground sound playback via expo-av
//   • Local notification scheduling (foreground alert banner)
//   • Listener wiring helpers

import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Audio } from "expo-av";
import { Platform } from "react-native";
import { supabase } from "./supabase"; // adjust path if needed
import Constants from "expo-constants";

// ─── Channel IDs ─────────────────────────────────────────────────────────────
export const CHANNEL = {
  BOOKING:  "booking-requests",   // loud alert — new ride request
  RIDE:     "ride-updates",       // softer — status changes
  GENERAL:  "general",            // default
};

// ─── Sound file name (must match assets/sounds/ and app.json) ────────────────
const BOOKING_SOUND_FILE = "new_booking.wav";

// ─── Module-level sound object (re-used across calls) ────────────────────────
let _bookingSound = null;

export async function requestNotificationPermission() {
  if (!Device.isDevice) {
    console.warn("⚠️ Push notifications require a physical device");
    return false;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  return finalStatus === "granted";
}
// ─── 1. Configure foreground notification handler ─────────────────────────────
// Call this ONCE near your app entry point (e.g. App.js).
export const configureNotificationHandler = () => {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const isBooking =
        notification?.request?.content?.data?.type === "booking_request";

      return {
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: !isBooking,
        shouldSetBadge: true,
      };
    },
  });
};

// ─── 2. Create Android notification channels ───────────────────────────────────
// Must be called before the first notification is shown.
export async function setupNotificationChannels() {
  if (Platform.OS !== "android") return;

  // Booking request channel — max importance, custom sound
  await Notifications.setNotificationChannelAsync(CHANNEL.BOOKING, {
    name:               "Booking Requests",
    importance:         Notifications.AndroidImportance.MAX,
    sound:              BOOKING_SOUND_FILE,   // filename only, no path
    vibrationPattern:   [0, 400, 200, 400],
    lightColor:         "#10B981",
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd:          true,                 // override Do-Not-Disturb like Shopee
    enableVibrate:      true,
    showBadge:          true,
  });

  // Ride updates — default sound, lower priority
  await Notifications.setNotificationChannelAsync(CHANNEL.RIDE, {
    name:       "Ride Updates",
    importance: Notifications.AndroidImportance.HIGH,
    sound:      "default",
  });

  // General — default
  await Notifications.setNotificationChannelAsync(CHANNEL.GENERAL, {
    name:       "General",
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

// ─── 3. Request permissions & register push token ────────────────────────────
export async function registerForPushNotifications(driverId) {
  if (!Device.isDevice) {
    console.warn("⚠️ Push notifications require a physical device");
    return null;
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.warn("⚠️ Push notification permission denied");
    return null;
  }

  try {
    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ??
      Constants?.easConfig?.projectId;

    console.log("📌 Resolved projectId:", projectId);

    if (!projectId) {
      throw new Error("Missing EAS projectId in app config");
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    const expoPushToken = tokenData.data;
    console.log("📲 Expo push token:", expoPushToken);

    if (driverId && expoPushToken) {
      const { error } = await supabase
        .from("drivers")
        .update({ expo_push_token: expoPushToken })
        .eq("id", driverId);

      if (error) {
        console.log("❌ Failed saving push token:", error);
      }
    }

    return expoPushToken;
  } catch (err) {
    console.log("❌ registerForPushNotifications:", err);
    return null;
  }
}

// ─── 4. Play the booking alert sound (foreground) ────────────────────────────
// Loads the sound once and re-uses it. Call this whenever a new request arrives.
export async function playBookingSound() {
  try {
    // Ensure audio plays even when device is on silent (iOS)
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS:   true,
      allowsRecordingIOS:     false,
      staysActiveInBackground: false,
    });

    if (_bookingSound) {
      // Rewind and replay if already loaded
      await _bookingSound.setPositionAsync(0);
      await _bookingSound.playAsync();
      return;
    }

    const { sound } = await Audio.Sound.createAsync(
      require("../assets/sounds/new_booking.wav"),
      { shouldPlay: true, volume: 1.0 },
    );
    _bookingSound = sound;

    // Auto-unload after playback to free memory
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.didJustFinish && !status.isLooping) {
        // Keep the sound object loaded for fast replay; just stop it
      }
    });
  } catch (err) {
    console.log("❌ playBookingSound:", err);
  }
}

// ─── 5. Show a local "heads-up" notification (foreground banner) ──────────────
// Use this when you want the system tray banner + sound together.
// For foreground, Notifications.setNotificationHandler suppresses sound for
// booking type, so we play it manually via playBookingSound() first.
export async function showBookingNotification({ title, body, data = {} }) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound:     BOOKING_SOUND_FILE,
      priority:  "max",
      vibrate:   [0, 400, 200, 400],
      data:      { ...data, type: "booking_request" },
      // Android: tie to the loud channel
      ...(Platform.OS === "android" && { channelId: CHANNEL.BOOKING }),
    },
    trigger: null, // fire immediately
  });
}

// ─── 6. Show a quieter ride-update notification ───────────────────────────────
export async function showRideNotification({ title, body, data = {} }) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: true, // default system sound
      data:  { ...data, type: "ride_update" },
      ...(Platform.OS === "android" && { channelId: CHANNEL.RIDE }),
    },
    trigger: null,
  });
}

// ─── 7. Add response listener (user tapped notification) ─────────────────────
// Returns a subscription — call .remove() on cleanup.
export function addNotificationResponseListener(handler) {
  return Notifications.addNotificationResponseReceivedListener(handler);
}

// ─── 8. Add foreground listener (notification arrives while app is open) ──────
export function addNotificationReceivedListener(handler) {
  return Notifications.addNotificationReceivedListener(handler);
}

// ─── 9. Unload sound on app teardown ─────────────────────────────────────────
export async function unloadBookingSound() {
  if (_bookingSound) {
    await _bookingSound.unloadAsync();
    _bookingSound = null;
  }
}