import { supabase } from "../../lib/supabase";
import * as Application from "expo-application";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";

const VERSION_CHECK_KEY = "last_version_check";
const APP_PLATFORM = "android";

export const getCurrentAppVersion = () => {
  const isExpoGo = Constants.appOwnership === "expo";

  // Sa Expo Go, minsan ang nativeApplicationVersion ay version ng Expo Go app
  // kaya fallback tayo sa app.json/app.config version
  if (isExpoGo) {
    return Constants.expoConfig?.version || "1.0.0";
  }

  return (
    Application.nativeApplicationVersion ||
    Constants.expoConfig?.version ||
    "1.0.0"
  );
};

export const checkAppVersion = async () => {
  const currentVersion = getCurrentAppVersion();

  try {
    const { data, error } = await supabase
      .from("app_versions")
      .select(
        "min_version, latest_version, update_url, is_force_update, release_notes"
      )
      .eq("platform", APP_PLATFORM)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error("No Android version data found");

    const minVersion = data.min_version || null;
    const latestVersion = data.latest_version || null;

    const belowMinVersion =
      minVersion != null && compareVersions(currentVersion, minVersion) < 0;

    const belowLatestVersion =
      latestVersion != null &&
      compareVersions(currentVersion, latestVersion) < 0;

    const needsUpdate = belowMinVersion || belowLatestVersion;
    const isForceUpdate = belowMinVersion || !!data.is_force_update;

    const result = {
      needsUpdate,
      isForceUpdate: needsUpdate ? isForceUpdate : false,
      updateUrl: data.update_url || null,
      releaseNotes: data.release_notes || null,
      currentVersion,
      minVersion,
      latestVersion,
      platform: APP_PLATFORM,
      lastChecked: new Date().toISOString(),
    };

    await AsyncStorage.setItem(VERSION_CHECK_KEY, JSON.stringify(result));

    return result;
  } catch (error) {
    console.log("Version check error:", error);

    try {
      const cached = await AsyncStorage.getItem(VERSION_CHECK_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        return {
          ...parsed,
          currentVersion,
          platform: APP_PLATFORM,
        };
      }
    } catch (cacheError) {
      console.log("Version cache read error:", cacheError);
    }

    return {
      needsUpdate: false,
      isForceUpdate: false,
      currentVersion,
      minVersion: null,
      latestVersion: null,
      updateUrl: null,
      releaseNotes: null,
      platform: APP_PLATFORM,
      lastChecked: new Date().toISOString(),
    };
  }
};

const compareVersions = (v1, v2) => {
  const parts1 = String(v1)
    .split(".")
    .map((part) => parseInt(part, 10) || 0);

  const parts2 = String(v2)
    .split(".")
    .map((part) => parseInt(part, 10) || 0);

  const maxLength = Math.max(parts1.length, parts2.length);

  for (let i = 0; i < maxLength; i++) {
    const num1 = parts1[i] || 0;
    const num2 = parts2[i] || 0;

    if (num1 < num2) return -1;
    if (num1 > num2) return 1;
  }

  return 0;
};