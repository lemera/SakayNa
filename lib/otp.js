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




// import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// const supabase = createClient(
//   Deno.env.get("SUPABASE_URL")!,
//   Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
// )

// const corsHeaders = {
//   "Content-Type": "application/json",
//   "Access-Control-Allow-Origin": "*",
//   "Access-Control-Allow-Headers": "authorization, content-type",
// }

// Deno.serve(async (req) => {
//   if (req.method === "OPTIONS") {
//     return new Response("ok", { headers: corsHeaders })
//   }

//   try {
//     const { phone, otp, userType } = await req.json()

//     if (!phone || !otp || !userType) {
//       return new Response(JSON.stringify({
//         success: false,
//         error: "Missing required fields"
//       }), { status: 400, headers: corsHeaders })
//     }

//     const { data: otpRecord } = await supabase
//       .from("otp_codes")
//       .select("*")
//       .eq("phone", phone)
//       .eq("otp", otp)
//       .eq("used", false)
//       .gt("expires_at", new Date().toISOString())
//       .maybeSingle()

//     if (!otpRecord) {
//       return new Response(JSON.stringify({
//         success: false,
//         error: "Invalid or expired OTP"
//       }), { status: 400, headers: corsHeaders })
//     }

//     await supabase
//       .from("otp_codes")
//       .update({ used: true })
//       .eq("id", otpRecord.id)

//     return new Response(JSON.stringify({
//       success: true
//     }), { status: 200, headers: corsHeaders })

//   } catch (err) {
//     return new Response(JSON.stringify({
//       success: false,
//       error: err.message
//     }), { status: 500, headers: corsHeaders })
//   }
// })