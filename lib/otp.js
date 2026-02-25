// lib/otp.js
import { supabaseAnonKey } from './supabase'; // Make sure this exports your SUPABASE_ANON_KEY

// Default headers for Edge Functions (include anon key)
const defaultHeaders = {
  'Content-Type': 'application/json',
  'apikey': supabaseAnonKey,
  'Authorization': `Bearer ${supabaseAnonKey}`,
};

// Send OTP request
export const requestOtp = async (phone) => {
  const res = await fetch(
    'https://avrejcxahggprhjgdpkc.supabase.co/functions/v1/send-otp',
    {
      method: 'POST',
      headers: defaultHeaders,
      body: JSON.stringify({ phone }),
    }
  );

  let data;
  try {
    data = await res.json();
  } catch (e) {
    const text = await res.text().catch(() => null);
    if (!res.ok) throw new Error(text || `Request failed with status ${res.status}`);
    return { success: true, raw: text };
  }

  if (!res.ok || !data.success) throw new Error(data?.message || "Failed to send OTP");
  return data;
};

// Verify OTP request 
export const verifyOtp = async (phone, otp) => {
  const res = await fetch(
    'https://avrejcxahggprhjgdpkc.supabase.co/functions/v1/verify-otp',
    {
      method: 'POST',
      headers: defaultHeaders,
      body: JSON.stringify({ phone, otp }),
    }
  );

  let data;
  try {
    data = await res.json();
  } catch (e) {
    const text = await res.text().catch(() => null);
    if (!res.ok) throw new Error(text || `Verification failed with status ${res.status}`);
    return { success: true, raw: text };
  }

  if (!res.ok || !data?.success) {
    const errMsg = data?.message || data?.error || `Verification failed with status ${res.status}`;
    throw new Error(errMsg);
  }

  return data;
};