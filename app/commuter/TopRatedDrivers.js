// screens/commuter/TopRatedDrivers.js
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Image,
  TouchableOpacity,
  Modal,
  TextInput,
  Animated,
  Dimensions,
  Alert,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { supabase } from "../../lib/supabase";
import * as Location from "expo-location";
import * as Haptics from 'expo-haptics';
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";

const { width, height } = Dimensions.get('window');

export default function TopRatedDriversScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [drivers, setDrivers] = useState([]);
  const [filteredDrivers, setFilteredDrivers] = useState([]);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [userLocation, setUserLocation] = useState(null);
  const [mapModalVisible, setMapModalVisible] = useState(false);
  const [sortBy, setSortBy] = useState("rating"); // rating, distance, trips
  
  const modalAnimation = useRef(new Animated.Value(height)).current;
  const mapModalAnimation = useRef(new Animated.Value(height)).current;

  useFocusEffect(
    useCallback(() => {
      loadTopRatedDrivers();
      getUserLocation();
    }, [])
  );

  useEffect(() => {
    filterAndSortDrivers();
  }, [searchQuery, filterType, sortBy, drivers]);

  const getUserLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const location = await Location.getCurrentPositionAsync({});
        setUserLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
      }
    } catch (err) {
      console.log("Error getting location:", err);
    }
  };

const loadTopRatedDrivers = async () => {
  try {
    setLoading(true);
    
    // First, check if there are any drivers at all
    const { data: allDrivers, error: allError } = await supabase
      .from("drivers")
      .select("id, first_name, last_name, is_active, average_rating, total_reviews");
    
    if (allError) throw allError;
    
    console.log("📊 ALL drivers in database:", allDrivers?.length || 0);
    console.log("📊 Active drivers:", allDrivers?.filter(d => d.is_active === true).length || 0);
    console.log("📊 Inactive drivers:", allDrivers?.filter(d => d.is_active === false).length || 0);
    
    // If no active drivers but there are drivers, show a helpful message
    if (allDrivers && allDrivers.length > 0 && allDrivers.filter(d => d.is_active === true).length === 0) {
      console.log("⚠️ Found drivers but none are active. Activating them...");
      
      // Automatically activate all drivers
      const { error: updateError } = await supabase
        .from("drivers")
        .update({ is_active: true })
        .eq("is_active", false);
      
      if (updateError) {
        console.error("Error activating drivers:", updateError);
      } else {
        console.log("✅ Activated all drivers");
      }
    }
    
    // Now fetch drivers with their ratings and related data
    const { data: driversData, error: driversError } = await supabase
      .from("drivers")
      .select(`
        id,
        first_name,
        last_name,
        profile_picture,
        average_rating,
        total_reviews,
        is_active,
        online_status,
        driver_vehicles (
          vehicle_type,
          vehicle_color,
          plate_number
        ),
        driver_locations (
          latitude,
          longitude,
          is_online,
          last_updated
        )
      `)
      .eq("is_active", true)  // Now this will find drivers
      .order("average_rating", { ascending: false, nullsFirst: false });

    if (driversError) throw driversError;

    console.log("🎯 Active drivers after activation:", driversData?.length || 0);
    
    if (!driversData || driversData.length === 0) {
      console.log("❌ No active drivers found");
      setDrivers([]);
      setFilteredDrivers([]);
      setLoading(false);
      return;
    }

    // Log all drivers and their ratings for debugging
    driversData.forEach(driver => {
      console.log(`  - ${driver.first_name} ${driver.last_name}: rating=${driver.average_rating || 0}, reviews=${driver.total_reviews || 0}, active=${driver.is_active}, online=${driver.online_status}`);
    });

    // Process drivers with proper rating handling
    const processedDrivers = driversData
      .map(driver => {
        // Ensure rating is a number and round to 1 decimal
        const rawRating = parseFloat(driver.average_rating) || 0;
        const roundedRating = Math.round(rawRating * 10) / 10;
        
        const vehicle = driver.driver_vehicles?.[0] || {};
        const location = driver.driver_locations?.[0];
        
        // Calculate distance if user location exists
        let distance = null;
        if (userLocation && location && location.latitude && location.longitude) {
          distance = calculateDistance(
            userLocation.latitude,
            userLocation.longitude,
            location.latitude,
            location.longitude
          );
        }

        return {
          ...driver,
          average_rating: roundedRating,
          raw_rating: rawRating,
          total_reviews: driver.total_reviews || 0,
          vehicle_type: vehicle.vehicle_type || "Tricycle",
          vehicle_color: vehicle.vehicle_color || "N/A",
          plate_number: vehicle.plate_number || "N/A",
          latitude: location?.latitude || null,
          longitude: location?.longitude || null,
          is_online: driver.online_status === 'online' || location?.is_online || false,
          last_updated: location?.last_updated,
          distance_km: distance,
        };
      })
      // Filter drivers with at least 4.0 rating AND at least 1 review
      .filter(driver => {
        const hasMinimumRating = driver.average_rating >= 4.0;
        const hasAtLeastOneReview = driver.total_reviews > 0;
        
        if (!hasMinimumRating) {
          console.log(`  ❌ ${driver.first_name} ${driver.last_name}: rating ${driver.average_rating} < 4.0`);
        } else if (!hasAtLeastOneReview) {
          console.log(`  ⚠️ ${driver.first_name} ${driver.last_name}: rating ${driver.average_rating} but no reviews yet`);
        } else {
          console.log(`  ✅ ${driver.first_name} ${driver.last_name}: ${driver.average_rating} stars (${driver.total_reviews} reviews)`);
        }
        
        return hasMinimumRating && hasAtLeastOneReview;
      });

    console.log(`✅ Processed ${processedDrivers.length} top rated drivers with reviews`);

    setDrivers(processedDrivers);
    filterAndSortDrivers();
    
  } catch (err) {
    console.error("Error loading top rated drivers:", err);
    Alert.alert("Error", "Failed to load top rated drivers. Please try again.");
  } finally {
    setLoading(false);
    setRefreshing(false);
  }
};

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const filterAndSortDrivers = () => {
    let filtered = [...drivers];

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(driver =>
        `${driver.first_name} ${driver.last_name}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
        driver.vehicle_type?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        driver.plate_number?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply online filter
    if (filterType === "online") {
      filtered = filtered.filter(driver => driver.is_online === true);
    } else if (filterType === "offline") {
      filtered = filtered.filter(driver => driver.is_online === false);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      if (sortBy === "rating") {
        return b.average_rating - a.average_rating;
      } else if (sortBy === "distance") {
        // Put drivers without distance at the end
        if (a.distance_km === null) return 1;
        if (b.distance_km === null) return -1;
        return a.distance_km - b.distance_km;
      } else if (sortBy === "trips") {
        return (b.total_reviews || 0) - (a.total_reviews || 0);
      }
      return 0;
    });

    setFilteredDrivers(filtered);
  };

  const handleDriverPress = (driver) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedDriver(driver);
    showModal();
  };

  const showModal = () => {
    setShowDetailsModal(true);
    Animated.spring(modalAnimation, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  };

  const closeModal = () => {
    Animated.timing(modalAnimation, {
      toValue: height,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setShowDetailsModal(false);
      setSelectedDriver(null);
    });
  };

  const showMapModal = () => {
    setMapModalVisible(true);
    Animated.spring(mapModalAnimation, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  };

  const closeMapModal = () => {
    Animated.timing(mapModalAnimation, {
      toValue: height,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setMapModalVisible(false);
    });
  };

  const handleBookDriver = (driver) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    closeModal();
    
    if (!driver.is_online) {
      Alert.alert("Driver Offline", "This driver is currently offline. Please try again later.");
      return;
    }
    
    // Navigate to booking screen with preselected driver
    navigation.navigate("Home", {
      preselectedDriver: driver,
    });
  };

  const renderStars = (rating, size = 16, showNumber = true) => {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

    return (
      <View style={styles.starsContainer}>
        {[...Array(fullStars)].map((_, i) => (
          <Ionicons key={`full-${i}`} name="star" size={size} color="#FFB800" />
        ))}
        {hasHalfStar && (
          <Ionicons name="star-half" size={size} color="#FFB800" />
        )}
        {[...Array(emptyStars)].map((_, i) => (
          <Ionicons key={`empty-${i}`} name="star-outline" size={size} color="#FFB800" />
        ))}
        {showNumber && (
          <Text style={styles.ratingText}>({rating.toFixed(1)})</Text>
        )}
      </View>
    );
  };

  const renderDriverCard = ({ item, index }) => {
    const isEven = index % 2 === 0;
    
    return (
      <Pressable
        style={[styles.driverCard, isEven ? styles.cardLeft : styles.cardRight]}
        onPress={() => handleDriverPress(item)}
      >
        {/* Online Status Badge */}
        <View style={[
          styles.onlineBadge,
          item.is_online ? styles.onlineBadgeActive : styles.onlineBadgeInactive
        ]}>
          <View style={[
            styles.onlineDot,
            item.is_online ? styles.onlineDotActive : styles.onlineDotInactive
          ]} />
          <Text style={styles.onlineText}>
            {item.is_online ? "Online" : "Offline"}
          </Text>
        </View>

        {/* Driver Avatar */}
        <View style={styles.avatarContainer}>
          {item.profile_picture ? (
            <Image source={{ uri: item.profile_picture }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Ionicons name="person" size={40} color="#FFF" />
            </View>
          )}
        </View>

        {/* Driver Info */}
        <Text style={styles.driverName}>
          {item.first_name} {item.last_name}
        </Text>
        
        {renderStars(item.average_rating, 14)}
        
        <Text style={styles.reviewCount}>
          {item.total_reviews} {item.total_reviews === 1 ? 'review' : 'reviews'}
        </Text>

        {/* Vehicle Info */}
        <View style={styles.vehicleInfo}>
          <Ionicons name="car-outline" size={14} color="#666" />
          <Text style={styles.vehicleText} numberOfLines={1}>
            {item.vehicle_color} {item.vehicle_type}
          </Text>
        </View>

        {/* Distance and Plate */}
        <View style={styles.distanceContainer}>
          {item.distance_km !== null && item.distance_km !== undefined && (
            <View style={styles.distanceBadge}>
              <Ionicons name="location-outline" size={12} color="#10B981" />
              <Text style={styles.distanceText}>
                {item.distance_km < 1 
                  ? `${Math.round(item.distance_km * 1000)}m` 
                  : `${item.distance_km.toFixed(1)}km`}
              </Text>
            </View>
          )}
          <Text style={styles.plateText} numberOfLines={1}>
            {item.plate_number}
          </Text>
        </View>

        {/* Book Button */}
        <TouchableOpacity
          style={[styles.bookButton, !item.is_online && styles.bookButtonDisabled]}
          onPress={() => handleBookDriver(item)}
          disabled={!item.is_online}
        >
          <Text style={styles.bookButtonText}>
            {item.is_online ? "Book Now" : "Offline"}
          </Text>
          {item.is_online && (
            <Ionicons name="arrow-forward" size={16} color="#FFF" />
          )}
        </TouchableOpacity>
      </Pressable>
    );
  };

  const renderHeader = () => (
    <View style={styles.headerSection}>
      <Text style={styles.sectionTitle}>Top Rated Drivers</Text>
      <Text style={styles.sectionSubtitle}>
        Choose from our best-rated drivers with 4+ stars
      </Text>
      {drivers.length > 0 && (
        <Text style={styles.statsText}>
          {drivers.length} top-rated {drivers.length === 1 ? 'driver' : 'drivers'} available
        </Text>
      )}
    </View>
  );

  const renderFilters = () => (
    <View style={styles.filtersSection}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#999" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, vehicle or plate..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor="#999"
        />
        {searchQuery !== "" && (
          <Pressable onPress={() => setSearchQuery("")}>
            <Ionicons name="close-circle" size={20} color="#999" />
          </Pressable>
        )}
      </View>

      {/* Filter and Sort Row */}
      <View style={styles.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
          <Pressable
            style={[styles.filterChip, filterType === "all" && styles.filterChipActive]}
            onPress={() => setFilterType("all")}
          >
            <Text style={[styles.filterChipText, filterType === "all" && styles.filterChipTextActive]}>
              All ({drivers.length})
            </Text>
          </Pressable>
          <Pressable
            style={[styles.filterChip, filterType === "online" && styles.filterChipActive]}
            onPress={() => setFilterType("online")}
          >
            <Ionicons name="wifi" size={14} color={filterType === "online" ? "#FFF" : "#666"} />
            <Text style={[styles.filterChipText, filterType === "online" && styles.filterChipTextActive]}>
              Online ({drivers.filter(d => d.is_online).length})
            </Text>
          </Pressable>
          <Pressable
            style={[styles.filterChip, filterType === "offline" && styles.filterChipActive]}
            onPress={() => setFilterType("offline")}
          >
            <Ionicons name="wifi-outline" size={14} color={filterType === "offline" ? "#FFF" : "#666"} />
            <Text style={[styles.filterChipText, filterType === "offline" && styles.filterChipTextActive]}>
              Offline ({drivers.filter(d => !d.is_online).length})
            </Text>
          </Pressable>
        </ScrollView>

        <Pressable
          style={styles.sortButton}
          onPress={() => {
            const nextSort = sortBy === "rating" ? "distance" : sortBy === "distance" ? "trips" : "rating";
            setSortBy(nextSort);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
        >
          <Ionicons name="funnel-outline" size={18} color="#183B5C" />
          <Text style={styles.sortButtonText}>
            {sortBy === "rating" && "Top Rated"}
            {sortBy === "distance" && "Nearest"}
            {sortBy === "trips" && "Most Trips"}
          </Text>
        </Pressable>
      </View>
    </View>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIcon}>
        <Ionicons name="star-outline" size={64} color="#D1D5DB" />
      </View>
      <Text style={styles.emptyTitle}>No Top Rated Drivers Found</Text>
      <Text style={styles.emptyText}>
        {searchQuery 
          ? "No drivers match your search. Try different keywords."
          : "No drivers with 4+ star ratings and reviews available at the moment.\n\nDrivers need to maintain a 4-star rating and have at least one review to appear here."}
      </Text>
      <Pressable 
        style={styles.refreshButton}
        onPress={loadTopRatedDrivers}
      >
        <Ionicons name="refresh-outline" size={20} color="#183B5C" />
        <Text style={styles.refreshButtonText}>Refresh</Text>
      </Pressable>
    </View>
  );

  // Driver Details Modal
  const DriverDetailsModal = () => (
    <Modal
      visible={showDetailsModal}
      transparent={true}
      animationType="none"
      onRequestClose={closeModal}
    >
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={closeModal}>
        <Animated.View
          style={[
            styles.modalContent,
            { transform: [{ translateY: modalAnimation }] }
          ]}
        >
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
            {selectedDriver && (
              <View>
                {/* Modal Header */}
                <View style={styles.modalHeader}>
                  <Pressable onPress={closeModal} style={styles.modalCloseButton}>
                    <Ionicons name="close" size={24} color="#666" />
                  </Pressable>
                  <Text style={styles.modalTitle}>Driver Details</Text>
                  <View style={{ width: 40 }} />
                </View>

                <ScrollView showsVerticalScrollIndicator={false}>
                  {/* Driver Profile */}
                  <View style={styles.modalProfileSection}>
                    <View style={styles.modalAvatarContainer}>
                      {selectedDriver.profile_picture ? (
                        <Image source={{ uri: selectedDriver.profile_picture }} style={styles.modalAvatar} />
                      ) : (
                        <View style={styles.modalAvatarPlaceholder}>
                          <Ionicons name="person" size={60} color="#FFF" />
                        </View>
                      )}
                      <View style={[
                        styles.modalOnlineBadge,
                        selectedDriver.is_online ? styles.onlineBadgeActive : styles.onlineBadgeInactive
                      ]}>
                        <Text style={styles.modalOnlineText}>
                          {selectedDriver.is_online ? "Online" : "Offline"}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.modalDriverName}>
                      {selectedDriver.first_name} {selectedDriver.last_name}
                    </Text>
                    
                    <View style={styles.modalRatingContainer}>
                      {renderStars(selectedDriver.average_rating, 20)}
                    </View>
                    
                    <Text style={styles.modalReviewCount}>
                      {selectedDriver.total_reviews} {selectedDriver.total_reviews === 1 ? 'review' : 'reviews'} • {selectedDriver.average_rating.toFixed(1)} average rating
                    </Text>
                  </View>

                  {/* Vehicle Details */}
                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>Vehicle Details</Text>
                    <View style={styles.modalDetailCard}>
                      <View style={styles.modalDetailRow}>
                        <Ionicons name="car-outline" size={20} color="#666" />
                        <Text style={styles.modalDetailLabel}>Vehicle Type</Text>
                        <Text style={styles.modalDetailValue}>{selectedDriver.vehicle_type}</Text>
                      </View>
                      <View style={styles.modalDetailRow}>
                        <Ionicons name="color-palette-outline" size={20} color="#666" />
                        <Text style={styles.modalDetailLabel}>Color</Text>
                        <Text style={styles.modalDetailValue}>{selectedDriver.vehicle_color}</Text>
                      </View>
                      <View style={styles.modalDetailRow}>
                        <Ionicons name="card-outline" size={20} color="#666" />
                        <Text style={styles.modalDetailLabel}>Plate Number</Text>
                        <Text style={styles.modalDetailValue}>{selectedDriver.plate_number}</Text>
                      </View>
                    </View>
                  </View>

                  {/* Location & Distance */}
                  {selectedDriver.latitude && selectedDriver.longitude && (
                    <View style={styles.modalSection}>
                      <Text style={styles.modalSectionTitle}>Location</Text>
                      <TouchableOpacity
                        style={styles.modalLocationCard}
                        onPress={showMapModal}
                      >
                        <Ionicons name="map-outline" size={24} color="#183B5C" />
                        <View style={styles.modalLocationInfo}>
                          <Text style={styles.modalLocationTitle}>View on Map</Text>
                          {selectedDriver.distance_km && (
                            <Text style={styles.modalLocationDistance}>
                              {selectedDriver.distance_km < 1 
                                ? `${Math.round(selectedDriver.distance_km * 1000)}m away` 
                                : `${selectedDriver.distance_km.toFixed(1)}km away`}
                            </Text>
                          )}
                        </View>
                        <Ionicons name="chevron-forward" size={20} color="#666" />
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Action Buttons */}
                  <View style={styles.modalActionButtons}>
                    <TouchableOpacity
                      style={[styles.modalBookButton, !selectedDriver.is_online && styles.bookButtonDisabled]}
                      onPress={() => handleBookDriver(selectedDriver)}
                      disabled={!selectedDriver.is_online}
                    >
                      <Ionicons name="car-outline" size={20} color="#FFF" />
                      <Text style={styles.modalBookButtonText}>
                        {selectedDriver.is_online ? "Book This Driver" : "Driver Offline"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </View>
            )}
          </TouchableOpacity>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );

  // Map Modal
  const MapModal = () => (
    <Modal
      visible={mapModalVisible}
      transparent={true}
      animationType="none"
      onRequestClose={closeMapModal}
    >
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={closeMapModal}>
        <Animated.View
          style={[
            styles.mapModalContent,
            { transform: [{ translateY: mapModalAnimation }] }
          ]}
        >
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
            <View style={styles.mapModalHeader}>
              <Text style={styles.mapModalTitle}>Driver Location</Text>
              <Pressable onPress={closeMapModal} style={styles.mapModalClose}>
                <Ionicons name="close" size={24} color="#666" />
              </Pressable>
            </View>
            
            {selectedDriver && selectedDriver.latitude && selectedDriver.longitude && (
              <View style={styles.mapContainer}>
                <MapView
                  style={styles.map}
                  provider={PROVIDER_GOOGLE}
                  initialRegion={{
                    latitude: selectedDriver.latitude,
                    longitude: selectedDriver.longitude,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                  }}
                >
                  <Marker
                    coordinate={{
                      latitude: selectedDriver.latitude,
                      longitude: selectedDriver.longitude,
                    }}
                    title={`${selectedDriver.first_name} ${selectedDriver.last_name}`}
                    description={`${selectedDriver.vehicle_color} ${selectedDriver.vehicle_type} • ${selectedDriver.plate_number}`}
                  >
                    <View style={styles.mapMarker}>
                      <Ionicons name="car" size={20} color="#FFF" />
                    </View>
                  </Marker>
                </MapView>
              </View>
            )}
          </TouchableOpacity>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#183B5C" />
        <Text style={styles.loadingText}>Loading top rated drivers...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#183B5C" />
        </Pressable>
        <Text style={styles.headerTitleText}>Top Rated</Text>
        <View style={{ width: 40 }} />
      </View>

      {renderFilters()}

      <FlatList
        data={filteredDrivers}
        renderItem={renderDriverCard}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.columnWrapper}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={loadTopRatedDrivers}
            tintColor="#183B5C"
          />
        }
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmptyState}
      />

      <DriverDetailsModal />
      <MapModal />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F7FA",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F5F7FA",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#666",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  backButton: {
    padding: 8,
  },
  headerTitleText: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#183B5C",
  },
  headerSection: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  sectionTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#183B5C",
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: "#666",
    lineHeight: 20,
  },
  statsText: {
    fontSize: 12,
    color: "#10B981",
    marginTop: 8,
    fontWeight: "500",
  },
  filtersSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F5F7FA",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: "#333",
  },
  filterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  filterScroll: {
    flex: 1,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
    marginRight: 8,
    gap: 4,
  },
  filterChipActive: {
    backgroundColor: "#183B5C",
  },
  filterChipText: {
    fontSize: 13,
    color: "#666",
    fontWeight: "500",
  },
  filterChipTextActive: {
    color: "#FFF",
  },
  sortButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0F7FF",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  sortButtonText: {
    fontSize: 12,
    color: "#183B5C",
    fontWeight: "500",
  },
  listContent: {
    padding: 12,
  },
  columnWrapper: {
    justifyContent: "space-between",
  },
  driverCard: {
    backgroundColor: "#FFF",
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    width: (width - 36) / 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  cardLeft: {
    marginRight: 6,
  },
  cardRight: {
    marginLeft: 6,
  },
  onlineBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 4,
  },
  onlineBadgeActive: {
    backgroundColor: "#E8F5E9",
  },
  onlineBadgeInactive: {
    backgroundColor: "#F3F4F6",
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  onlineDotActive: {
    backgroundColor: "#10B981",
  },
  onlineDotInactive: {
    backgroundColor: "#9CA3AF",
  },
  onlineText: {
    fontSize: 10,
    fontWeight: "500",
    color: "#333",
  },
  avatarContainer: {
    alignItems: "center",
    marginBottom: 12,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#183B5C",
    justifyContent: "center",
    alignItems: "center",
  },
  driverName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    textAlign: "center",
    marginBottom: 4,
  },
  starsContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    marginBottom: 4,
  },
  ratingText: {
    fontSize: 12,
    color: "#666",
    marginLeft: 4,
  },
  reviewCount: {
    fontSize: 11,
    color: "#999",
    textAlign: "center",
    marginBottom: 8,
  },
  vehicleInfo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginBottom: 8,
  },
  vehicleText: {
    fontSize: 11,
    color: "#666",
    flex: 1,
  },
  distanceContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  distanceBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 12,
    gap: 2,
  },
  distanceText: {
    fontSize: 10,
    color: "#10B981",
    fontWeight: "500",
  },
  plateText: {
    fontSize: 10,
    color: "#999",
    fontFamily: "monospace",
    flex: 1,
    textAlign: "right",
  },
  bookButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#183B5C",
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
  },
  bookButtonDisabled: {
    backgroundColor: "#E5E7EB",
  },
  bookButtonText: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "600",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    paddingHorizontal: 40,
    lineHeight: 20,
  },
  refreshButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0F7FF",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 25,
    marginTop: 20,
    gap: 8,
  },
  refreshButtonText: {
    fontSize: 14,
    color: "#183B5C",
    fontWeight: "600",
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 20,
    maxHeight: "90%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  modalCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  modalProfileSection: {
    alignItems: "center",
    marginBottom: 24,
  },
  modalAvatarContainer: {
    position: "relative",
    marginBottom: 12,
  },
  modalAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  modalAvatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#183B5C",
    justifyContent: "center",
    alignItems: "center",
  },
  modalOnlineBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  modalOnlineText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#333",
  },
  modalDriverName: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 6,
  },
  modalRatingContainer: {
    marginBottom: 4,
  },
  modalReviewCount: {
    fontSize: 13,
    color: "#666",
  },
  modalSection: {
    marginBottom: 20,
  },
  modalSectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 12,
  },
  modalDetailCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 16,
  },
  modalDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  modalDetailLabel: {
    flex: 1,
    fontSize: 14,
    color: "#666",
    marginLeft: 12,
  },
  modalDetailValue: {
    fontSize: 14,
    fontWeight: "500",
    color: "#333",
  },
  modalLocationCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0F7FF",
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  modalLocationInfo: {
    flex: 1,
  },
  modalLocationTitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#183B5C",
    marginBottom: 2,
  },
  modalLocationDistance: {
    fontSize: 12,
    color: "#10B981",
  },
  modalActionButtons: {
    marginTop: 20,
    marginBottom: 30,
  },
  modalBookButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#183B5C",
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  modalBookButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
  // Map Modal
  mapModalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 20,
    height: height * 0.7,
  },
  mapModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  mapModalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  mapModalClose: {
    padding: 8,
  },
  mapContainer: {
    height: height * 0.55,
    borderRadius: 16,
    overflow: "hidden",
  },
  map: {
    flex: 1,
  },
  mapMarker: {
    backgroundColor: "#183B5C",
    padding: 8,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#FFF",
  },
});