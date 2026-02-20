import React, { useState } from 'react';
import { View, Text, Image, Pressable, Alert } from 'react-native';
import { styles } from './styles/UserTypeStyles.js'; 

export default function UserTypeScreen({ navigation }) {
  const [commuterPressed, setCommuterPressed] = useState(false);
  const [driverPressed, setDriverPressed] = useState(false);

  return (
    <View style={styles.container}>
      <Image
        source={require('../assets/logo-sakayna.png')}
        style={[styles.logo, { marginBottom: 20 }]}
      />
      <Text style={styles.title}>
  Welcome to <Text style={{ color: '#E97A3E' }}>SakayNa</Text>
  
</Text>

      <Text style={styles.subtitle}>Select a User Type to Continue</Text>

      <View style={styles.buttonRow}>
        <Pressable
          onPress={() => navigation.navigate('CommuterLogin')}
          onPressIn={() => setCommuterPressed(true)}
          onPressOut={() => setCommuterPressed(false)}
          style={[
            styles.button,
            { backgroundColor: commuterPressed ? '#E97A3E' : '#183B5C', marginRight: 10 }
          ]}
        >
          <Text style={styles.buttonText}>Commuter</Text>
        </Pressable>

        <Pressable
          onPress={() => navigation.navigate('DriverLoginScreen')}
          onPressIn={() => setDriverPressed(true)}
          onPressOut={() => setDriverPressed(false)}
          style={[
            styles.button,
            { backgroundColor: driverPressed ? '#183B5C' : '#E97A3E', marginLeft: 10 }
          ]}
        >
          <Text style={styles.buttonText}>Driver</Text>
        </Pressable>
      </View>
    </View>
  );
}
