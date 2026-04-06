// lib/testAuth.js
import { supabase } from './supabase';

/**
 * Special verification function for test accounts
 * This bypasses the OTP table check and directly verifies the user
 */
export const verifyTestAccount = async (phone, userType) => {
  try {
    console.log("🔧 Test account verification bypassing OTP check:", { phone, userType });
    
    // First, check if user exists in users table
    const { data: existingUser, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('phone', phone)
      .single();
    
    let userId;
    let user;
    
    if (existingUser) {
      // User exists
      userId = existingUser.id;
      user = existingUser;
      console.log("✅ Existing user found:", userId);
    } else {
      // Create new user for test account
      console.log("🆕 Creating new test user...");
      
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert([
          {
            phone: phone,
            user_type: userType,
            referral_code: generateReferralCode(),
          }
        ])
        .select()
        .single();
      
      if (createError) {
        console.error("❌ Failed to create test user:", createError);
        throw new Error("Failed to create test account");
      }
      
      userId = newUser.id;
      user = newUser;
      console.log("✅ Test user created:", userId);
      
      // Create corresponding profile based on user type
      if (userType === 'commuter') {
        const { error: profileError } = await supabase
          .from('commuters')
          .insert([
            {
              id: userId,
              first_name: 'Test',
              last_name: 'Commuter',
              phone: phone,
              email: `test_commuter_${Date.now()}@test.com`,
            }
          ]);
        
        if (profileError) console.error("Profile creation error:", profileError);
        
        // Create wallet for commuter
        const { error: walletError } = await supabase
          .from('commuter_wallets')
          .insert([{ commuter_id: userId, points: 100 }]);
        
        if (walletError) console.error("Wallet creation error:", walletError);
          
      } else if (userType === 'driver') {
        const { error: profileError } = await supabase
          .from('drivers')
          .insert([
            {
              id: userId,
              first_name: 'Test',
              last_name: 'Driver',
              phone: phone,
              email: `test_driver_${Date.now()}@test.com`,
              is_active: true,
            }
          ]);
        
        if (profileError) console.error("Profile creation error:", profileError);
        
        // Create wallet for driver
        const { error: walletError } = await supabase
          .from('driver_wallets')
          .insert([{ driver_id: userId }]);
        
        if (walletError) console.error("Wallet creation error:", walletError);
      }
    }
    
    return {
      success: true,
      user: {
        id: userId,
        phone: phone,
        user_type: userType,
        ...user
      }
    };
    
  } catch (error) {
    console.error("❌ Test account verification error:", error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Helper function to generate referral code
function generateReferralCode() {
  return 'TEST_' + Math.random().toString(36).substring(2, 8).toUpperCase();
}