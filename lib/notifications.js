// lib/notifications.js
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Audio } from "expo-av";
import { Platform } from "react-native";
import { supabase } from "./supabase";
import Constants from "expo-constants";

// Channel IDs
export const CHANNEL = {
  BOOKING: "booking-requests",
  RIDE: "ride-updates",
  GENERAL: "general",
};

const BOOKING_SOUND_FILE = "new_booking.wav";
let _bookingSound = null;

// 1. Configure Foreground Notification Handler
export const configureNotificationHandler = () => {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const isBooking = notification?.request?.content?.data?.type === "booking_request";

      return {
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: !isBooking,     // We play custom sound manually for booking
        shouldSetBadge: true,
      };
    },
  });
  console.log("✅ Notification handler configured");
};

// 2. Setup Android Notification Channels
export async function setupNotificationChannels() {
  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync(CHANNEL.BOOKING, {
    name: "Booking Requests",
    importance: Notifications.AndroidImportance.MAX,
    sound: BOOKING_SOUND_FILE,
    vibrationPattern: [0, 400, 200, 400],
    lightColor: "#10B981",
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: true,
    enableVibrate: true,
    showBadge: true,
  });

  await Notifications.setNotificationChannelAsync(CHANNEL.RIDE, {
    name: "Ride Updates",
    importance: Notifications.AndroidImportance.HIGH,
    sound: "default",
  });

  await Notifications.setNotificationChannelAsync(CHANNEL.GENERAL, {
    name: "General",
    importance: Notifications.AndroidImportance.DEFAULT,
  });

  console.log("✅ Android notification channels setup complete");
}

// 3. Register Push Token (Fixed & Improved)
export async function registerForPushNotifications(driverId) {
  if (!Device.isDevice) {
    console.warn("⚠️ Push notifications require a physical device");
    return null;
  }

  try {
    console.log(`🚀 Starting push registration for driver: ${driverId}`);

    // Request permission
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") {
      ({ status } = await Notifications.requestPermissionsAsync());
    }

    if (status !== "granted") {
      console.warn("❌ Notification permission denied");
      return null;
    }

    // Get Project ID
    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ??
      Constants?.easConfig?.projectId ??
      Constants?.expoConfig?.projectId;

    if (!projectId) {
      console.error("❌ Missing EAS Project ID in app config");
      return null;
    }

    // Get Expo Token
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const expoPushToken = tokenData.data;

    console.log("✅ Expo Push Token retrieved:", expoPushToken);

    // Save to database
    if (driverId && expoPushToken) {
      const { error } = await supabase
        .from("drivers")
        .update({
          expo_push_token: expoPushToken,
          updated_at: new Date().toISOString(),
        })
        .eq("id", driverId);

      if (error) {
        console.error("❌ Failed to save token:", error.message);
      } else {
        console.log(`🎉 Push token successfully saved for driver ${driverId}`);
      }
    }

    return expoPushToken;
  } catch (err) {
    console.error("❌ registerForPushNotifications error:", err);
    return null;
  }
}

// 4. Play Booking Sound
export async function playBookingSound() {
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      allowsRecordingIOS: false,
    });

    if (_bookingSound) {
      await _bookingSound.setPositionAsync(0);
      await _bookingSound.playAsync();
      return;
    }

    const { sound } = await Audio.Sound.createAsync(
      require("../assets/sounds/new_booking.wav"),
      { shouldPlay: true, volume: 1.0 }
    );
    _bookingSound = sound;
  } catch (err) {
    console.log("❌ playBookingSound error:", err);
  }
}

// 5. Show Booking Notification (Local)
export async function showBookingNotification({ title, body, data = {} }) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: BOOKING_SOUND_FILE,
      priority: "max",
      data: { ...data, type: "booking_request" },
      ...(Platform.OS === "android" && { channelId: CHANNEL.BOOKING }),
    },
    trigger: null,
  });
}

// 6. Show Ride Update Notification
export async function showRideNotification({ title, body, data = {} }) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: true,
      data: { ...data, type: "ride_update" },
      ...(Platform.OS === "android" && { channelId: CHANNEL.RIDE }),
    },
    trigger: null,
  });
}

// 7. Listeners
export function addNotificationResponseListener(handler) {
  return Notifications.addNotificationResponseReceivedListener(handler);
}

export function addNotificationReceivedListener(handler) {
  return Notifications.addNotificationReceivedListener(handler);
}

// 8. Cleanup
export async function unloadBookingSound() {
  if (_bookingSound) {
    await _bookingSound.unloadAsync();
    _bookingSound = null;
  }
}