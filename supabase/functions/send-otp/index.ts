// send_otp.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
)

// UNCOMMENT ALL THESE DEBUG LOGS
console.log("=== FUNCTION STARTED ===");
console.log("SUPABASE_URL:", Deno.env.get("SUPABASE_URL"));
console.log("Has SERVICE_ROLE_KEY:", !!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
console.log("Has MOCEAN_API_TOKEN:", !!Deno.env.get("MOCEAN_API_TOKEN"));
console.log("========================");

const corsHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { phone, role } = await req.json()

    // ================= VALIDATION =================
    if (!phone || !role) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing fields" }),
        { status: 400, headers: corsHeaders }
      )
    }

    if (!/^\+639\d{9}$/.test(phone)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid PH format" }),
        { status: 400, headers: corsHeaders }
      )
    }

    if (!["commuter", "driver"].includes(role)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid role" }),
        { status: 400, headers: corsHeaders }
      )
    }

    // ================= CHECK USER =================
    const { data: existingUser, error: userError } = await supabase
      .from("users")
      .select("id, user_type")
      .eq("phone", phone)
      .maybeSingle()

    if (userError) {
      return new Response(
        JSON.stringify({ success: false, error: userError.message }),
        { status: 500, headers: corsHeaders }
      )
    }

    // If user exists but role mismatch → block
    if (existingUser && existingUser.user_type !== role) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `This number is registered as ${existingUser.user_type}.`,
        }),
        { status: 400, headers: corsHeaders }
      )
    }

    // ================= DELETE OLD UNUSED OTP =================
    await supabase
      .from("otp_codes")
      .delete()
      .eq("phone", phone)
      .eq("used", false)

    // ================= GENERATE OTP =================
    const otp = Math.floor(100000 + Math.random() * 900000).toString()

    // ================= SEND SMS =================
    const smsRes = await fetch("https://rest.moceanapi.com/rest/2/sms", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${Deno.env.get("MOCEAN_API_TOKEN")}`,
      },
      body: new URLSearchParams({
        "mocean-from": "SakayNa",
        "mocean-to": phone.replace("+", ""),
        "mocean-text": `Your SakayNa OTP is ${otp}. It expires in 5 minutes.`,
        "mocean-resp-format": "json",
      }).toString(),
    })

    const smsData = await smsRes.json()

    if (!smsRes.ok || smsData?.messages?.[0]?.status !== 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Failed to send SMS" }),
        { status: 500, headers: corsHeaders }
      )
    }

    // ================= SAVE OTP =================
    const { error: otpError } = await supabase.from("otp_codes").insert({
      phone,
      otp,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      used: false,
    })

    if (otpError) {
      return new Response(
        JSON.stringify({ success: false, error: otpError.message }),
        { status: 500, headers: corsHeaders }
      )
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: corsHeaders }
    )

  } catch (err) {
    return new Response(
      JSON.stringify({
        success: false,
        error: err.message || "Internal server error",
      }),
      { status: 500, headers: corsHeaders }
    )
  }
})