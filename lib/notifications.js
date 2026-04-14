import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Audio } from "expo-av";
import { Platform } from "react-native";
import { supabase } from "./supabase";
import Constants from "expo-constants";

export const CHANNEL = {
  BOOKING: "booking-requests",
  RIDE: "ride-updates",
  GENERAL: "general",
};

export const NOTIFICATION_CATEGORY = {
  BOOKING_REQUEST: "BOOKING_REQUEST",
};

export const NOTIFICATION_ACTION = {
  ACCEPT_BOOKING: "ACCEPT_BOOKING",
  CANCEL_BOOKING: "CANCEL_BOOKING",
};

const BOOKING_SOUND_FILE = "new_booking.wav";
let _bookingSound = null;

export const configureNotificationHandler = () => {
  Notifications.setNotificationHandler({
    handleNotification: async () => {
      return {
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      };
    },
  });
};

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
    sound: "default",
  });
}

export async function setupNotificationCategories() {
  await Notifications.setNotificationCategoryAsync(
    NOTIFICATION_CATEGORY.BOOKING_REQUEST,
    [
      {
        identifier: NOTIFICATION_ACTION.ACCEPT_BOOKING,
        buttonTitle: "Accept",
        options: {
          opensAppToForeground: true,
        },
      },
      {
        identifier: NOTIFICATION_ACTION.CANCEL_BOOKING,
        buttonTitle: "Cancel",
        options: {
          isDestructive: true,
          opensAppToForeground: true,
        },
      },
    ]
  );
}

export async function registerForPushNotifications(driverId) {
  if (!Device.isDevice) {
    console.warn("Push notifications require a physical device");
    return null;
  }

  try {
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") {
      ({ status } = await Notifications.requestPermissionsAsync());
    }

    if (status !== "granted") {
      console.warn("Notification permission denied");
      return null;
    }

    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ??
      Constants?.easConfig?.projectId ??
      Constants?.expoConfig?.projectId;

    if (!projectId) {
      console.error("Missing EAS project ID");
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const expoPushToken = tokenData.data;

    console.log("Expo push token:", expoPushToken);

    if (driverId && expoPushToken) {
      const { error } = await supabase
        .from("drivers")
        .update({
          expo_push_token: expoPushToken,
          updated_at: new Date().toISOString(),
        })
        .eq("id", driverId);

      if (error) {
        console.error("Failed to save Expo token:", error.message);
      }
    }

    return expoPushToken;
  } catch (err) {
    console.error("registerForPushNotifications error:", err);
    return null;
  }
}

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
    console.log("playBookingSound error:", err);
  }
}

export function addNotificationResponseListener(handler) {
  return Notifications.addNotificationResponseReceivedListener(handler);
}

export function addNotificationReceivedListener(handler) {
  return Notifications.addNotificationReceivedListener(handler);
}

export async function unloadBookingSound() {
  if (_bookingSound) {
    await _bookingSound.unloadAsync();
    _bookingSound = null;
  }
}