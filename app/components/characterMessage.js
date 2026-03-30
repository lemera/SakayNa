// components/characterMessage.js
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Cute character with message bubble
const CharacterMessage = ({ 
  visible, 
  message, 
  onClose, 
  autoHide = true,
  autoHideDuration = 5000,
  position = 'top',
  characterType = 'default'
}) => {
  const [isVisible, setIsVisible] = useState(visible);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateYAnim = useRef(new Animated.Value(position === 'bottom' ? 100 : -100)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    if (visible) {
      setIsVisible(true);
      
      // Animate in
      Animated.parallel([
        Animated.spring(translateYAnim, {
          toValue: 0,
          useNativeDriver: true,
          damping: 20,
          stiffness: 300,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          damping: 20,
          stiffness: 300,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      // Auto hide after duration (5 seconds)
      if (autoHide) {
        const timer = setTimeout(() => {
          handleClose();
        }, autoHideDuration);
        
        return () => clearTimeout(timer);
      }
    } else {
      handleClose();
    }
  }, [visible]);

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(translateYAnim, {
        toValue: position === 'bottom' ? 100 : -100,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsVisible(false);
      if (onClose) onClose();
    });
  };

  const getCharacterEmoji = () => {
    switch(characterType) {
      case 'cute':
        return '🐱';
      case 'excited':
        return '🌟';
      case 'worried':
        return '😟';
      case 'happy':
        return '😊';
      case 'sleepy':
        return '😴';
      case 'curious':
        return '🤔';
      default:
        return '🚕';
    }
  };

  if (!isVisible) return null;

  return (
    <Animated.View 
      style={[
        styles.container,
        position === 'bottom' ? styles.bottomContainer : styles.topContainer,
        {
          opacity: fadeAnim,
          transform: [
            { translateY: translateYAnim },
            { scale: scaleAnim }
          ]
        }
      ]}
    >
      {/* Character Avatar */}
      <View style={styles.characterAvatar}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarEmoji}>{getCharacterEmoji()}</Text>
        </View>
      </View>

      {/* Message Bubble */}
      <View style={styles.messageContainer}>
        <View style={styles.messageBubble}>
          <View style={[styles.messageTail, styles.messageTailTop]} />
          <Text style={styles.messageText}>{message}</Text>
        </View>
        
        {/* Character Name */}
        <Text style={styles.characterName}>RideBuddy</Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    zIndex: 1000,
    elevation: 1000,
  },
  bottomContainer: {
    bottom: 20,
    alignItems: 'flex-end',
  },
  topContainer: {
    top: 60,
    alignItems: 'flex-start',
  },
  characterAvatar: {
    marginRight: 12,
    marginTop: 0,
  },
  avatarCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    borderWidth: 2,
    borderColor: '#183B5C',
  },
  avatarEmoji: {
    fontSize: 28,
  },
  messageContainer: {
    flex: 1,
    maxWidth: SCREEN_WIDTH - 100,
  },
  messageBubble: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 12,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#F0F0F0',
    position: 'relative',
  },
  messageTail: {
    position: 'absolute',
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
  },
  messageTailTop: {
    top: -8,
    left: 20,
    borderRightWidth: 8,
    borderBottomWidth: 8,
    borderRightColor: 'transparent',
    borderBottomColor: '#FFF',
    borderLeftWidth: 8,
    borderLeftColor: 'transparent',
  },
  messageText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  characterName: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 4,
    marginLeft: 8,
  },
});

// Cute message presets for different scenarios
export const CharacterMessages = {
  // Welcome messages
  welcome: () => "👋 Hi there! I'm RideBuddy! Ready to go on an adventure? 🚗✨",
  welcomeBack: () => "🌈 Welcome back! Let's make today's ride awesome! 🚕💨",
  
  // Idle messages (when user is not doing anything)
  idle1: () => "🤔 Hmm... Are you thinking about where to go? I can help! 📍",
  idle2: () => "😊 Don't be shy! Just tap the pickup location to get started! 🚗",
  idle3: () => "🌟 I'm here to help you find the best ride! Let's book one together! 💕",
  idle4: () => "🎯 Ready to ride? Select your pickup point and let's go! 🏁",
  idle5: () => "💭 Need some suggestions? I know all the best spots in town! 🗺️",
  idle6: () => "🌸 Waiting for you! Whenever you're ready, I'm here! 💝",
  idle7: () => "✨ Your next adventure is just a tap away! Let's book a ride! 🚕",
  
  // Pickup selected messages
  pickupSelected: (address) => `🎉 Yay! You picked: ${address.split(',')[0]}! Great choice! Now where to? 🏁✨`,
  pickupSelectedCute: (address) => `🌸 Awesome! Pickup at ${address.split(',')[0]}! One step closer to your adventure! 🚗💨`,
  
  // Dropoff selected messages
  dropoffSelected: (address) => `🌟 Perfect! Going to ${address.split(',')[0]}! That's gonna be fun! Ready to book? 🎉`,
  dropoffSelectedCute: (address) => `💖 ${address.split(',')[0]} is a wonderful destination! Let's make this ride amazing! 🚕✨`,
  
  // Both locations selected
  bothSelected: () => "🎉 Woohoo! Pickup and dropoff are set! You're ready to book a ride! 🚗💨 Let's find you a driver! 🌟",
  
  // Action messages
  needPickup: () => "📍 Hello! I need your pickup location first before we can book a ride! 🚗",
  needDropoff: () => "🏁 Almost there! Please tell me where you want to go so I can find you the best ride! ✨",
  needBoth: () => "🚕 Hi there! To book a ride, please select both your pickup and dropoff locations. I'll help you find the best driver! 🌟",
  
  // Driver messages
  noDrivers: (radius) => `😟 Oh no! No drivers found within ${radius}km. Let's try searching a bit wider? 🔍✨`,
  bookingSuccess: () => "🎉 Yay! Your ride has been booked! Your driver will be there soon! Get ready for an amazing trip! 🚗✨💕",
  bookingError: () => "😢 Oops! Something went wrong. Let's try again together! You've got this! 💪✨",
  
  // Scanning messages
  scanning: () => "📱 Point your camera at the driver's QR code! I'll handle the rest! You're doing great! 🎯🌟",
  waiting: () => "⏳ Hang tight! I'm looking for the nearest driver for you... They'll be here soon! 🚗💨✨",
  driverFound: () => "🎉🎉🎉 Great news! A driver has accepted your ride! They're on their way to you! Get excited! 🚗💨✨",
  
  // Encouragement messages
  passengerSelected: (count) => `👥 ${count} passenger${count > 1 ? 's' : ''}! Perfect! You're all set! 🎉`,
  radiusIncreased: (radius) => `🔍 I've expanded our search to ${radius}km! Let's find you an awesome driver! 🌟`,
  
  // Fare messages
  fareCalculated: (fare) => `💰 Your fare is ₱${fare}! That's a great deal! Ready to book? 🚕✨`,
  
  // Goodbye/Completion messages
  rideComplete: () => "🎉 Hope you had an amazing ride! Come back soon for more adventures! 🌈🚗💕",
  
  // Random cute messages
  randomCute1: () => "🌸 You're doing amazing! Keep going! 💝",
  randomCute2: () => "🌟 Every journey starts with a single tap! Let's go! 🚗",
  randomCute3: () => "💕 I believe in you! Let's book this ride! 🎉",
  randomCute4: () => "🌈 Adventure awaits! Let's get you there in style! 🚕✨",
};

// Helper function to get random idle message
export const getRandomIdleMessage = () => {
  const idleMessages = [
    CharacterMessages.idle1,
    CharacterMessages.idle2,
    CharacterMessages.idle3,
    CharacterMessages.idle4,
    CharacterMessages.idle5,
    CharacterMessages.idle6,
    CharacterMessages.idle7,
  ];
  return idleMessages[Math.floor(Math.random() * idleMessages.length)]();
};

export default CharacterMessage;