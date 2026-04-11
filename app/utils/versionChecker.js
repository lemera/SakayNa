import { supabase } from "../../lib/supabase";
import { Platform } from "react-native";
import * as Application from "expo-application";
import AsyncStorage from "@react-native-async-storage/async-storage";

const VERSION_CHECK_KEY = "last_version_check";

export const getCurrentAppVersion = () => {
  return Application.nativeApplicationVersion || "1.0.0";
};

export const checkAppVersion = async () => {
  const currentVersion = getCurrentAppVersion();

  try {
    const platform = Platform.OS === "ios" ? "ios" : "android";

    const { data, error } = await supabase
      .from("app_versions")
      .select("min_version, latest_version, update_url, is_force_update, release_notes")
      .eq("platform", platform)
      .single();

    if (error) throw error;
    if (!data) throw new Error("No version data found");

    const minVersion = data.min_version;
    const latestVersion = data.latest_version;

    const belowMinVersion = compareVersions(currentVersion, minVersion) < 0;
    const belowLatestVersion = compareVersions(currentVersion, latestVersion) < 0;

    const needsUpdate = belowMinVersion || belowLatestVersion;
    const isForceUpdate = belowMinVersion || !!data.is_force_update;

    const result = {
      needsUpdate,
      isForceUpdate: needsUpdate ? isForceUpdate : false,
      updateUrl: data.update_url,
      releaseNotes: data.release_notes,
      currentVersion,
      minVersion,
      latestVersion,
      lastChecked: new Date().toISOString(),
    };

    await AsyncStorage.setItem(VERSION_CHECK_KEY, JSON.stringify(result));

    return result;
  } catch (error) {
    console.log("Version check error:", error);

    const cached = await AsyncStorage.getItem(VERSION_CHECK_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      return {
        ...parsed,
        currentVersion,
      };
    }

    return {
      needsUpdate: false,
      isForceUpdate: false,
      currentVersion,
      minVersion: null,
      latestVersion: null,
      updateUrl: null,
      releaseNotes: null,
    };
  }
};

const compareVersions = (v1, v2) => {
  const parts1 = String(v1).split(".").map(Number);
  const parts2 = String(v2).split(".").map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const num1 = parts1[i] || 0;
    const num2 = parts2[i] || 0;

    if (num1 < num2) return -1;
    if (num1 > num2) return 1;
  }

  return 0;
};