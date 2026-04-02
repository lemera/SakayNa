import { supabaseAnonKey } from './supabase'

const BASE_URL = 'https://riseunullhczomqxkcbn.supabase.co/functions/v1'

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${supabaseAnonKey}`,
}

export const sendOtp = async (phone, role) => {
  try {
    console.log("🌐 Connecting to:", `${BASE_URL}/send_tp`);
    console.log("📱 Sending:", { phone, role });
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    const res = await fetch(`${BASE_URL}/send_otp`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ phone, role }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    console.log("📡 Response status:", res.status);
    
    const data = await res.json();
    console.log("📦 Response data:", data);

    if (!res.ok || !data.success) {
      throw new Error(data?.error || `HTTP ${res.status}`);
    }

    return data;
  } catch (error) {
    console.log("❌ Error type:", error.name);
    console.log("❌ Error message:", error.message);
    
    if (error.name === 'AbortError') {
      throw new Error('Connection timeout - please check your internet');
    } else if (error.message.includes('Network request failed')) {
      throw new Error('Cannot connect to server - check your internet connection');
    } else {
      throw error;
    }
  }
};

export const verifyOtp = async (phone, otp, userType) => {
  try {
    console.log("🔐 Verifying at:", `${BASE_URL}/verify_otp`);
    console.log("📦 Data:", { phone, otp, userType });
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const res = await fetch(`${BASE_URL}/verify_otp`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ phone, otp, userType }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    console.log("📡 Verify response:", res.status);
    
    const data = await res.json();
    console.log("📦 Verify data:", data);

    if (!res.ok || !data.success) {
      throw new Error(data?.error || `HTTP ${res.status}`);
    }

    return data;
  } catch (error) {
    console.log("❌ Verify error:", error.message);
    throw error;
  }
};