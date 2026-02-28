import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, Alert } from 'react-native';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase'; // adjust path if needed
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

const checkSessionAndNavigate = async () => {
  try {
    const userId = await AsyncStorage.getItem('user_id');

    if (!userId) {
      navigation.replace('UserType');
      return;
    }

    // 1️⃣ Check users table
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (!user) {
      await AsyncStorage.removeItem('user_id');
      navigation.replace('UserType');
      return;
    }

    // 2️⃣ If commuter
    if (user.user_type === 'commuter') {
      const { data: commuter } = await supabase
        .from('commuters')
        .select('id')
        .eq('id', userId)
        .maybeSingle();

      if (commuter) {
        navigation.replace('HomePage');
      } else {
        navigation.replace('CommuterDetails');
      }

      return;
    }

    // 3️⃣ If driver
    if (user.user_type === 'driver') {
      const { data: driver } = await supabase
        .from('drivers')
        .select('id')
        .eq('id', userId)
        .maybeSingle();

      if (driver) {
        navigation.replace('DriverHomePage');
      } else {
        navigation.replace('DriverDetails');
      }

      return;
    }

  } catch (error) {
    console.log('Session check error:', error);
    navigation.replace('UserType');
  }
};

    const fadeOutAndNavigate = async () => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 2000,
        useNativeDriver: true,
      }).start(async () => {
        await requestLocationPermission();
        await checkSessionAndNavigate();
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