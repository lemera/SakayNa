// UserTypeScreen.js
import React, { useState, useRef, useEffect } from "react";
import { 
  View, 
  Text, 
  Image, 
  Pressable, 
  Animated, 
  Dimensions,
  Platform,
  useWindowDimensions,
  ScrollView
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from 'react-native-vector-icons/Feather';
import { LinearGradient } from 'expo-linear-gradient';
import { styles } from "./styles/UserTypeStyles.js";

export default function UserTypeScreen({ navigation }) {
  const [selectedType, setSelectedType] = useState(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;
  const { width, height } = useWindowDimensions();

  // Responsive breakpoints
  const isTablet = width >= 768;
  const isDesktop = width >= 1024;
  const isSmallPhone = width <= 375;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleSelect = async (type) => {
    setSelectedType(type);
    
    // Haptic feedback for modern feel
    if (Platform.OS === 'ios') {
      const Haptics = require('expo-haptics');
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    // Animated delay before navigation
    setTimeout(() => {
      if (type === "commuter") {
        navigation.navigate("CommuterLogin", { userType: "commuter" });
      } else if (type === "driver") {
        navigation.navigate("DriverLoginScreen", { userType: "driver" });
      }
    }, 200);
  };

  const handleTermsPress = () => {
    navigation.navigate("TermsScreen");
  };

  const handlePrivacyPress = () => {
    navigation.navigate("PrivacyScreen");
  };

  // Dynamic styles based on screen size
  const getResponsiveStyles = () => {
    return {
      logoSize: isTablet ? 140 : (isSmallPhone ? 80 : 100),
      titleSize: isTablet ? 42 : (isSmallPhone ? 28 : 34),
      subtitleSize: isTablet ? 20 : (isSmallPhone ? 14 : 16),
      cardPadding: isTablet ? 30 : (isSmallPhone ? 16 : 20),
      iconSize: isTablet ? 36 : (isSmallPhone ? 24 : 28),
      maxWidth: isDesktop ? 800 : (isTablet ? 600 : '100%'),
    };
  };

  const responsive = getResponsiveStyles();

  return (
    <LinearGradient
      colors={['#FFFFFF', '#F8F9FA', '#F0F2F5']}
      style={styles.gradientBackground}
    >
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScrollView 
          contentContainerStyle={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <Animated.View 
            style={[
              styles.container,
              {
                opacity: fadeAnim,
                transform: [{ scale: scaleAnim }],
                maxWidth: responsive.maxWidth,
                width: '100%',
                alignSelf: 'center',
              }
            ]}
          >
            <View style={styles.content}>
              {/* Logo Section */}
              <View style={[
                styles.logoWrapper,
                isTablet && styles.logoWrapperTablet
              ]}>
                <View style={[
                  styles.logoGlow,
                  { width: responsive.logoSize + 20, height: responsive.logoSize + 20 }
                ]}>
                  <Image
                    source={require("../assets/logo-sakayna.png")}
                    style={[
                      styles.logo,
                      { width: responsive.logoSize, height: responsive.logoSize }
                    ]}
                    resizeMode="contain"
                  />
                </View>
              </View>

              {/* Text Section */}
              <View style={styles.textContainer}>
                <Text style={[
                  styles.title,
                  { fontSize: responsive.titleSize }
                ]}>
                  Welcome to{"\n"}
                  <Text style={styles.titleGradient}>SakayNa</Text>
                </Text>
                <Text style={[
                  styles.subtitle,
                  { fontSize: responsive.subtitleSize }
                ]}>
                  Your journey starts here
                </Text>
              </View>

              {/* Options Section */}
              <View style={[
                styles.optionsContainer,
                (isTablet || isDesktop) && styles.optionsContainerRow
              ]}>
                {/* Commuter Option */}
                <Pressable
                  onPress={() => handleSelect("commuter")}
                  style={({ pressed }) => [
                    styles.optionCard,
                    (isTablet || isDesktop) && styles.optionCardRow,
                    selectedType === "commuter" && styles.optionCardSelected,
                    pressed && styles.optionCardPressed,
                  ]}
                >
                  <LinearGradient
                    colors={
                      selectedType === "commuter" 
                        ? ['#FF6B3D', '#E97A3E'] 
                        : ['#FFFFFF', '#FFFFFF']
                    }
                    style={[
                      styles.cardGradient,
                      { padding: responsive.cardPadding }
                    ]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  >
                    <View style={styles.cardContent}>
                      <View style={[
                        styles.iconContainer,
                        selectedType === "commuter" && styles.iconContainerSelected,
                        { width: responsive.iconSize + 16, height: responsive.iconSize + 16 }
                      ]}>
                        <Icon 
                          name="user" 
                          size={responsive.iconSize} 
                          color={selectedType === "commuter" ? "#FFFFFF" : "#E97A3E"}
                        />
                      </View>
                      <Text style={[
                        styles.optionTitle,
                        selectedType === "commuter" && styles.optionTitleSelected,
                        { fontSize: isTablet ? 22 : (isSmallPhone ? 16 : 18) }
                      ]}>
                        Ride as Commuter
                      </Text>
                      <Text style={[
                        styles.optionDescription,
                        selectedType === "commuter" && styles.optionDescriptionSelected,
                        { fontSize: isTablet ? 16 : (isSmallPhone ? 12 : 14) }
                      ]}>
                        Book rides • Track trips • Pay seamlessly
                      </Text>
                      
                      {selectedType === "commuter" && (
                        <View style={styles.selectedBadge}>
                          <Icon name="check" size={16} color="#FFFFFF" />
                          <Text style={styles.selectedBadgeText}>Selected</Text>
                        </View>
                      )}
                    </View>
                  </LinearGradient>
                </Pressable>

                {/* Driver Option */}
                <Pressable
                  onPress={() => handleSelect("driver")}
                  style={({ pressed }) => [
                    styles.optionCard,
                    (isTablet || isDesktop) && styles.optionCardRow,
                    selectedType === "driver" && styles.optionCardSelected,
                    pressed && styles.optionCardPressed,
                  ]}
                >
                  <LinearGradient
                    colors={
                      selectedType === "driver" 
                        ? ['#FF6B3D', '#E97A3E'] 
                        : ['#FFFFFF', '#FFFFFF']
                    }
                    style={[
                      styles.cardGradient,
                      { padding: responsive.cardPadding }
                    ]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  >
                    <View style={styles.cardContent}>
                      <View style={[
                        styles.iconContainer,
                        selectedType === "driver" && styles.iconContainerSelected,
                        { width: responsive.iconSize + 16, height: responsive.iconSize + 16 }
                      ]}>
                        <Icon 
                          name="user" 
                          size={responsive.iconSize} 
                          color={selectedType === "driver" ? "#FFFFFF" : "#E97A3E"}
                        />
                      </View>
                      <Text style={[
                        styles.optionTitle,
                        selectedType === "driver" && styles.optionTitleSelected,
                        { fontSize: isTablet ? 22 : (isSmallPhone ? 16 : 18) }
                      ]}>
                        Drive as Partner
                      </Text>
                      <Text style={[
                        styles.optionDescription,
                        selectedType === "driver" && styles.optionDescriptionSelected,
                        { fontSize: isTablet ? 16 : (isSmallPhone ? 12 : 14) }
                      ]}>
                        Earn money • Accept trips • Flexible schedule
                      </Text>
                      
                      {selectedType === "driver" && (
                        <View style={styles.selectedBadge}>
                          <Icon name="check" size={16} color="#FFFFFF" />
                          <Text style={styles.selectedBadgeText}>Selected</Text>
                        </View>
                      )}
                    </View>
                  </LinearGradient>
                </Pressable>
              </View>

              {/* Footer Note */}
              <View style={styles.footer}>
                <Text style={[
                  styles.footerText,
                  { fontSize: isSmallPhone ? 11 : 13 }
                ]}>
                  By continuing, you agree to our 
                  <Text 
                    style={styles.footerLink} 
                    onPress={handleTermsPress}
                  >
                    {" "}Terms
                  </Text> 
                  <Text style={styles.footerText}> and </Text>
                  <Text 
                    style={styles.footerLink} 
                    onPress={handlePrivacyPress}
                  >
                    Privacy Policy
                  </Text>
                </Text>
              </View>
            </View>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}