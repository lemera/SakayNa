import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, Alert } from 'react-native';
import * as Location from 'expo-location';
import { styles } from './styles/SplashScreenStyle.js';

function SplashScreen({ navigation }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const requestLocationPermission = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(
            'Permission Denied',
            'Location permission is required to use this app.'
          );
        }
      } catch (error) {
        console.log('Error requesting location permission:', error);
      }
    };

    const fadeOutAndNavigate = async () => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 2000,
        useNativeDriver: true,
      }).start(async () => {
        await requestLocationPermission();
        navigation.replace('UserType');
      });
    };

    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 2000,
      useNativeDriver: true,
    }).start(() => {
      setTimeout(fadeOutAndNavigate, 1000);
    });
  }, []);

  return (
    <View style={styles.splashContainer}>
      <Animated.Image
        source={require('../assets/logo-sakayna.png')}
        style={[styles.logo, { opacity: fadeAnim }]}
      />
      <Animated.View style={{ opacity: fadeAnim, flexDirection: 'row', marginTop: 10}}>
        <Text style={styles.rideText}>Ride Smarter</Text>
        <Text style={styles.commaText}>, </Text>
        <Text style={styles.travelText}>Travel Safer</Text>
      </Animated.View>
    </View>
  );
}

export default SplashScreen;
