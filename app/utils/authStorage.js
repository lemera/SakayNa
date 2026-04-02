// utils/authStorage.js
import AsyncStorage from '@react-native-async-storage/async-storage';

const USER_SESSION_KEY = '@sakayna_user_session';
const TEST_ACCOUNT_FLAG = '@sakayna_test_account';

export const saveUserSession = async (userData, isTestAccount = false) => {
  try {
    await AsyncStorage.setItem(USER_SESSION_KEY, JSON.stringify(userData));
    if (isTestAccount) {
      await AsyncStorage.setItem(TEST_ACCOUNT_FLAG, 'true');
    } else {
      await AsyncStorage.removeItem(TEST_ACCOUNT_FLAG);
    }
    return true;
  } catch (error) {
    console.error('Error saving session:', error);
    return false;
  }
};

export const getUserSession = async () => {
  try {
    const session = await AsyncStorage.getItem(USER_SESSION_KEY);
    const isTest = await AsyncStorage.getItem(TEST_ACCOUNT_FLAG);
    return session ? { ...JSON.parse(session), isTestAccount: isTest === 'true' } : null;
  } catch (error) {
    console.error('Error getting session:', error);
    return null;
  }
};

export const clearUserSession = async () => {
  try {
    await AsyncStorage.removeItem(USER_SESSION_KEY);
    await AsyncStorage.removeItem(TEST_ACCOUNT_FLAG);
    return true;
  } catch (error) {
    console.error('Error clearing session:', error);
    return false;
  }
};