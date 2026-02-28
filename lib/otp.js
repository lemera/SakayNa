// lib/otp.js
import { supabaseAnonKey } from './supabase'

const BASE_URL =
  'https://riseunullhczomqxkcbn.supabase.co/functions/v1'

const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${supabaseAnonKey}`,
}

// ✅ Send OTP
export const requestOtp = async (phone) => {
  const res = await fetch(`${BASE_URL}/send_otp`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ phone }),
  })

  const data = await res.json()

  if (!res.ok || !data.success) {
    throw new Error(data?.error || 'Failed to send OTP')
  }

  return data
}

// ✅ Verify OTP
export const verifyOtp = async (phone, otp, userType) => {
  const res = await fetch(`${BASE_URL}/verify_otp`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ phone, otp, userType }),
  })

  const data = await res.json()

  if (!res.ok || !data.success) {
    throw new Error(data?.error || 'Invalid OTP')
  }

  return data
}



