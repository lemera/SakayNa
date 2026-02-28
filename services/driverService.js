// services/driverService.js

import { supabase } from "../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Get stored user id from AsyncStorage
export const getStoredUserId = async () => {
  try {
    const userId = await AsyncStorage.getItem("user_id");
    return userId;
  } catch (error) {
    console.log("Error getting stored user id:", error.message);
    return null;
  }
};

// Fetch driver by ID
export const fetchDriverById = async (userId) => {
  const { data, error } = await supabase
    .from("drivers")
    .select("first_name, middle_name, last_name")
    .eq("id", userId)
    .single();

  if (error) {
    throw error;
  }

  return data;
};