  import { Alert } from "react-native";

  // Google API Key
  const GOOGLE_API_KEY = "AIzaSyCPuMCVa_9EB832dXm1P0t2Nv1UqBYQgws";

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
  // Fare Calculation:
  // - Minimum fare covers first 1 km -> ₱15
  // - If distance <= 1 km => ₱15
  // - For distance > 1 km, first km is ₱15, each additional km costs ₱20 per km (fractional allowed)
  export const calculateFare = (kilometers) => {
    // Fare rules requested:
    // - Minimum fare: ₱15 (covers up to 1.0 km)
    // - Each additional full km after the first costs ₱15
    // - For any fractional km beyond whole kms:
    //    - if fractional > 0 and <= 0.5 -> charge +₱5
    //    - if fractional > 0.5 -> charge +₱15 (equivalent to charging for the next full km)
    // Examples:
    // 0.5 -> 15
    // 1.0 -> 15
    // 1.5 -> 20 (15 + 5)
    // 2.0 -> 30 (15 + 15)
    // 2.3 -> 35 (15 + 15 + 5)
    // 2.5 -> 35 (15 + 15 + 5)
    // 3.0 -> 45 (15 + 15 + 15)

    const km = Math.max(0, Number(kilometers) || 0);
    if (km <= 1) return 15;

    const extra = km - 1; // km beyond first
    const fullExtraKm = Math.floor(extra); // full km units beyond first
    const frac = parseFloat((extra - fullExtraKm).toFixed(3));

    let fare = 15 + fullExtraKm * 15;

    if (frac > 0) {
      if (frac <= 0.5) fare += 5;
      else fare += 15;
    }

    return fare;
  };

  // Parse distance strings returned by Google Directions (e.g., "12.3 km", "900 m") into kilometers (number)
  export const parseDistanceTextToKm = (text) => {
    if (!text) return null;
    const t = String(text).toLowerCase().trim();
    try {
      if (t.includes("km")) {
        const num = parseFloat(t.replace(/,/g, "").split("km")[0].trim());
        return isNaN(num) ? null : num;
      }
      if (t.includes("m")) {
        const num = parseFloat(t.replace(/,/g, "").split("m")[0].trim());
        return isNaN(num) ? null : num / 1000;
      }
    } catch (e) {
      console.error("parseDistanceTextToKm error:", e);
    }
    return null;
  };

  // Reverse Geocode using Google Geocoding API
  export const reverseGeocode = async (lat, lon) => {
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&key=${GOOGLE_API_KEY}`
      );
      const data = await response.json();

      console.log("Geocode status:", data.status);

      if (data.status === "OK" && data.results.length > 0) {
        return data.results[0].formatted_address;
      }

      if (data.status === "ZERO_RESULTS") {
        return "Unknown location";
      }

      if (data.status === "REQUEST_DENIED") {
        console.log("API issue:", data.error_message);
        return "Location unavailable";
      }

      return "Location unavailable";
    } catch (error) {
      console.error("Reverse geocode error:", error);
      return "Location unavailable";
    }
  };
  // Dropoff Search using Google Geocoding API reverseGeocode 
  export const searchDropoffLocation = async (query, mapRef, setDropoffCoords, setDropoff) => {
    if (!query) return;

    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${GOOGLE_API_KEY}`
      );
      const data = await response.json();

      if (data.results && data.results.length > 0) {
        const result = data.results[0];
        const coords = {
          latitude: result.geometry.location.lat,
          longitude: result.geometry.location.lng,
        };

        // Prefer short area name when available (pass formatted_address for fallback parsing)
        let displayName = result.formatted_address;
        try {
          const area = formatAreaFromComponents(result.address_components, result.formatted_address);
          if (area) displayName = area;
        } catch (e) {
          // fall back to formatted_address
        }

        setDropoffCoords(coords);
        setDropoff(displayName);

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

  // Get Google Places Details
  export const getGooglePlaceDetails = async (placeId) => {
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&key=${GOOGLE_API_KEY}`
      );
      const data = await response.json();
      if (data.result) {
        const { geometry, formatted_address } = data.result;
        return {
          latitude: geometry.location.lat,
          longitude: geometry.location.lng,
          address: formatted_address,
        };
      }
    } catch (error) {
      console.error("Error getting place details:", error);
    }
  };

  // Get Google API Key
  export const getGoogleApiKey = () => GOOGLE_API_KEY;

  // Decode polyline from Google Directions API (polyline encoding algorithm)
  const decodePolyline = (encoded) => {
    const points = [];
    let index = 0, lat = 0, lng = 0;
    
    while (index < encoded.length) {
      let result = 0;
      let shift = 0;
      let byte;
      
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      
      const deltaLat = result & 1 ? ~(result >> 1) : result >> 1;
      lat += deltaLat;
      
      result = 0;
      shift = 0;
      
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      
      const deltaLng = result & 1 ? ~(result >> 1) : result >> 1;
      lng += deltaLng;
      
      points.push({
        latitude: lat / 1e5,
        longitude: lng / 1e5,
      });
    }
    
    return points;
  };

  // Get routes from Google Directions API
  export const getRoutePolyline = async (pickupLat, pickupLng, dropoffLat, dropoffLng) => {
    try {
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${pickupLat},${pickupLng}&destination=${dropoffLat},${dropoffLng}&key=${GOOGLE_API_KEY}&mode=driving`;
      console.log("Fetching route from:", url);
      
      const response = await fetch(url);
      const data = await response.json();
      
      console.log("Google Directions API response:", data.status);
      
      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        console.log("Route found, decoding polyline...");
        
        const polylinePoints = decodePolyline(route.overview_polyline.points);
        console.log("Decoded polyline points:", polylinePoints.length);
        
        const distance = route.legs[0]?.distance?.text || "N/A";
        const duration = route.legs[0]?.duration?.text || "N/A";
        
        return {
          polylinePoints,
          distance,
          duration,
          success: true,
        };
      } else {
        console.log("No routes found in response");
        return { success: false, polylinePoints: [] };
      }
    } catch (error) {
      console.error("Error fetching route:", error);
      return { success: false, polylinePoints: [] };
    }
  };

  // Get detailed address components for a lat/lng using Geocoding API
  export const getAddressDetails = async (lat, lon) => {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&key=${GOOGLE_API_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        const result = data.results[0];
        // log for debugging when area not resolved
        console.log('getAddressDetails result:', {
          formatted_address: result.formatted_address,
          place_id: result.place_id,
          types: result.types,
          components: result.address_components?.map(c => ({ long_name: c.long_name, types: c.types }))
        });

        return {
          formatted_address: result.formatted_address,
          components: result.address_components,
          place_id: result.place_id,
        };
      }
      return null;
    } catch (err) {
      console.error("Error in getAddressDetails:", err);
      return null;
    }
  };

  // Try to find a nearby place name using Places Nearby Search as a fallback formatAreaFromComponents
  export const getNearbyPlaceName = async (lat, lon, radius = 200) => {
    try {
      const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lon}&radius=${radius}&key=${GOOGLE_API_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        // Prefer an establishment or point of interest name
        const place = data.results[0];
        return place.name || place.vicinity || null;
      }
      return null;
    } catch (err) {
      console.error('Error in getNearbyPlaceName:', err);
      return null;
    }
  };

  // Format a short area string from Google address components
  const formatShortFromFormatted = (formatted) => {
    if (!formatted) return null;
    const parts = formatted.split(",").map((p) => p.trim()).filter(Boolean);
    // Remove country if it's the last part (common: "..., Philippines")
    const filtered = parts.filter(p => p.toLowerCase() !== 'philippines');
    if (filtered.length === 0) return null;
    // If address starts with street number, prefer later tokens. Try first two tokens if first token is likely a locality (no digits), else take last two.
    const hasDigits = (s) => /\d/.test(s);
    if (!hasDigits(filtered[0])) {
      return filtered.slice(0, Math.min(2, filtered.length)).join(', ');
    }
    return filtered.slice(Math.max(0, filtered.length - 2)).join(', ');
  };

  export const formatFullAddress = (components = [], formattedAddress = null) => {
    if (!components || !components.length) return formattedAddress || "Unknown location";

    const getType = (type) => components.find(c => c.types.includes(type))?.long_name;

    const route = getType("route");
    const sublocality = getType("sublocality_level_1") || getType("sublocality") || getType("neighborhood");
    const locality = getType("locality") || getType("postal_town");
    const admin1 = getType("administrative_area_level_1");

    // Include all available parts
    const parts = [];
    if (sublocality) parts.push(sublocality);
    if (route) parts.push(route);
    if (locality) parts.push(locality);
    if (admin1) parts.push(admin1);

    if (parts.length) return parts.join(", ");

    // Fallback to formatted_address
    return formattedAddress || "Unknown location";
  };