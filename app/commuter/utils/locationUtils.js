import * as Location from "expo-location";
import { Alert } from "react-native";

// Distance Formula (Haversine)
export const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Fare Calculation
export const calculateFare = (kilometers) => {
  const MIN_PRICE = 15;
  const PRICE_PER_KM = 15;
  return Math.max(kilometers * PRICE_PER_KM, MIN_PRICE);
};

// Reverse Geocode
export const reverseGeocode = async (lat, lon) => {
  try {
    const addr = await Location.reverseGeocodeAsync({
      latitude: lat,
      longitude: lon,
    });

    if (addr.length > 0) {
      const a = addr[0];
      const parts = [];

      if (a.postalCode) parts.push(a.postalCode);
      if (a.district) parts.push(a.district);
      if (a.city) parts.push(a.city);
      if (a.region) parts.push(a.region);

      return parts.length > 0
        ? parts.join(", ")
        : a.name || `Lat: ${lat.toFixed(5)}, Lon: ${lon.toFixed(5)}`;
    }

    return `Lat: ${lat.toFixed(5)}, Lon: ${lon.toFixed(5)}`;
  } catch {
    return `Lat: ${lat.toFixed(5)}, Lon: ${lon.toFixed(5)}`;
  }
};

// Dropoff Search
export const searchDropoffLocation = async (query, mapRef, setDropoffCoords, setDropoff) => {
  if (!query) return;

  try {
    const results = await Location.geocodeAsync(query);

    if (results.length > 0) {
      const loc = results[0];
      const coords = {
        latitude: loc.latitude,
        longitude: loc.longitude,
      };

      setDropoffCoords(coords);
      setDropoff(query);

      mapRef.current?.animateToRegion(
        { ...coords, latitudeDelta: 0.01, longitudeDelta: 0.01 },
        500
      );
    } else {
      Alert.alert("Location not found", "Please try a different address");
    }
  } catch (error) {
    Alert.alert("Error", "Failed to search location");
    console.error(error);
  }
};