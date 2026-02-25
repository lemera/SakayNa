// // functions/send-otp/index.ts
// import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
// import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// // ✅ Load Edge Function secrets
// const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
// const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// const PHILSMS_API_KEY = Deno.env.get("PHILSMS_API_KEY")!;
// const PHILSMS_SENDER_ID = Deno.env.get("PHILSMS_SENDER_ID")!;

// // ✅ Validate environment variables
// if (!supabaseUrl || !supabaseKey || !PHILSMS_API_KEY || !PHILSMS_SENDER_ID) {
//   throw new Error(
//     "Missing environment variables. Make sure SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PHILSMS_API_KEY, and PHILSMS_SENDER_ID are set."
//   );
// }

// // ✅ Create Supabase client with service role key (bypasses RLS)
// const supabase = createClient(supabaseUrl, supabaseKey);

// serve(async (req) => {
//   try {
//     const { phone } = await req.json();

//     if (!phone) {
//       return new Response(
//         JSON.stringify({ success: false, message: "Phone number is required" }),
//         { status: 400 }
//       );
//     }

//     // Format phone: strip all non-digits, ensure +63 prefix
//     const formattedPhone = phone.replace(/\D/g, "").startsWith("63")
//       ? "+" + phone.replace(/\D/g, "")
//       : "+63" + phone.replace(/\D/g, "");

//     // ✅ Generate 6-digit OTP
//     const otp = Math.floor(100000 + Math.random() * 900000).toString();

//     // ✅ Delete any existing OTPs for this phone
//     const { error: deleteError } = await supabase
//       .from("otp_codes")
//       .delete()
//       .eq("phone", formattedPhone);
//     if (deleteError) console.error("Delete OTP error:", deleteError);

//     // ✅ Insert new OTP
//     const { error: insertError } = await supabase.from("otp_codes").insert([
//       {
//         phone: formattedPhone,
//         otp,
//         used: false,
//         created_at: new Date().toISOString(),
//         expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 min expiry
//       },
//     ]);
//     if (insertError) {
//       console.error("Insert OTP error:", insertError);
//       return new Response(
//         JSON.stringify({ success: false, message: insertError.message }),
//         { status: 500 }
//       );
//     }

//     // ✅ Send SMS via PhilSMS (v3 API)
//     let smsRes;
//     try {
//       smsRes = await fetch("https://app.philsms.com/api/v3/sms/send", {
//         method: "POST",
//         headers: {
//           "Content-Type": "application/json",
//           Accept: "application/json",
//           Authorization: `Bearer ${PHILSMS_API_KEY}`,
//         },
//         body: JSON.stringify({
//           recipient: formattedPhone, // e.g., +639171234567
//           sender_id: PHILSMS_SENDER_ID,
//           type: "plain",
//           message: `Your SakayNa OTP code is ${otp}`,
//         }),
//       });

//       if (!smsRes.ok) {
//         const errorText = await smsRes.text();
//         console.error("PhilSMS API error:", errorText);
//         return new Response(
//           JSON.stringify({ success: false, message: "SMS API error: " + errorText }),
//           { status: 500 }
//         );
//       }
//     } catch (err) {
//       console.error("PhilSMS request failed:", err);
//       return new Response(
//         JSON.stringify({ success: false, message: "SMS request failed: " + err.message }),
//         { status: 500 }
//       );
//     }

//     // ✅ Success
//     return new Response(
//       JSON.stringify({ success: true, message: "OTP sent successfully" }),
//       { status: 200 }
//     );
//   } catch (err: any) {
//     console.error("Edge Function error:", err);
//     return new Response(
//       JSON.stringify({ success: false, message: err.message }),
//       { status: 500 }
//     );
//   }
// });