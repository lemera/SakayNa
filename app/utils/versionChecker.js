import { supabase } from "../../lib/supabase";
import { Platform } from "react-native";
import * as Application from "expo-application";
import AsyncStorage from "@react-native-async-storage/async-storage";

const VERSION_CHECK_KEY = "last_version_check";

export const getCurrentAppVersion = () => {
  if (Platform.OS === "ios") {
    return Application.nativeApplicationVersion;
  } else if (Platform.OS === "android") {
    return Application.nativeApplicationVersion;
  }
  return "1.0.0";
};

export const checkAppVersion = async () => {
  try {
    const platform = Platform.OS === "ios" ? "ios" : "android";
    const currentVersion = getCurrentAppVersion();
    
    // Fetch from Supabase
    const { data, error } = await supabase
      .from("app_versions")
      .select("min_version, latest_version, update_url, is_force_update, release_notes")
      .eq("platform", platform)
      .single();
    
    if (error) throw error;
    
    const minVersion = data.min_version;
    const isForceUpdate = data.is_force_update;
    
    // Compare versions (simple string comparison - better to use semver)
    const needsUpdate = compareVersions(currentVersion, minVersion) < 0;
    
    // Save to local storage para di na mag-fetch every time
    await AsyncStorage.setItem(VERSION_CHECK_KEY, JSON.stringify({
      needsUpdate,
      isForceUpdate,
      updateUrl: data.update_url,
      releaseNotes: data.release_notes,
      minVersion,
      lastChecked: new Date().toISOString()
    }));
    
    return {
      needsUpdate,
      isForceUpdate: isForceUpdate && needsUpdate,
      updateUrl: data.update_url,
      releaseNotes: data.release_notes,
      currentVersion,
      minVersion,
    };
  } catch (error) {
    console.log("Version check error:", error);
    // Return cached data if available
    const cached = await AsyncStorage.getItem(VERSION_CHECK_KEY);
    if (cached) {
      return JSON.parse(cached);
    }
    return { needsUpdate: false, isForceUpdate: false };
  }
};

// Simple semver comparison (supports x.y.z)
const compareVersions = (v1, v2) => {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const num1 = parts1[i] || 0;
    const num2 = parts2[i] || 0;
    
    if (num1 !== num2) {
      return num1 < num2 ? -1 : 1;
    }
  }
  return 0;
};