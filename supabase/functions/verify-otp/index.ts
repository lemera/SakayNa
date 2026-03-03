import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
)

const corsHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { phone, otp, userType } = await req.json()

    console.log("Incoming userType:", userType)

    if (!phone || !otp || !userType) {
      return new Response(JSON.stringify({
        success: false,
        error: "Missing required fields"
      }), { status: 400, headers: corsHeaders })
    }

    // ✅ normalize userType
    const normalizedType = userType.toLowerCase().trim()

    if (!["commuter", "driver"].includes(normalizedType)) {
      return new Response(JSON.stringify({
        success: false,
        error: "Invalid user type"
      }), { status: 400, headers: corsHeaders })
    }

    // 1️⃣ Verify OTP
    const { data: otpRecord } = await supabase
      .from("otp_codes")
      .select("*")
      .eq("phone", phone)
      .eq("otp", otp)
      .eq("used", false)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle()

    if (!otpRecord) {
      return new Response(JSON.stringify({
        success: false,
        error: "Invalid or expired OTP"
      }), { status: 400, headers: corsHeaders })
    }

    // 2️⃣ Mark OTP as used
    await supabase
      .from("otp_codes")
      .update({ used: true })
      .eq("id", otpRecord.id)

    // 3️⃣ Check if user exists
    let { data: existingUser } = await supabase
      .from("users")
      .select("*")
      .eq("phone", phone)
      .maybeSingle()

    let user = existingUser

    // 4️⃣ If not exist, create
    if (!existingUser) {
      const { data: newUser, error } = await supabase
        .from("users")
        .insert({
          phone,
          user_type: normalizedType // ✅ USE NORMALIZED
        })
        .select()
        .single()

      if (error) throw error
      user = newUser
    }

    return new Response(
      JSON.stringify({
        success: true,
        user
      }),
      { status: 200, headers: corsHeaders }
    )

  } catch (err) {
    console.error("SERVER ERROR:", err)

    return new Response(JSON.stringify({
      success: false,
      error: err.message
    }), { status: 500, headers: corsHeaders })
  }
})