// app/allow_location.js
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import * as Location from 'expo-location';

export default function AllowLocationScreen() {
  const [locationGranted, setLocationGranted] = useState(false);

  const requestLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        setLocationGranted(true);
        Alert.alert('Success', 'Location access granted!');
      } else {
        Alert.alert('Permission Denied', 'Location access is required to continue.');
      }
    } catch (error) {
      console.log(error);
      Alert.alert('Error', 'Something went wrong requesting location.');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Allow Location Access</Text>

      <TouchableOpacity style={styles.button} onPress={requestLocation}>
        <Text style={styles.buttonText}>
          {locationGranted ? 'Location Granted ✅' : 'Allow Location'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },

  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 30,
    textAlign: 'center',
  },

  button: {
    backgroundColor: '#1E90FF',
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 10,
    alignItems: 'center',
  },

  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
