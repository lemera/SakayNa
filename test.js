const SUPABASE_URL = 'https://kfczpycnzfgermcmbiof.supabase.co'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmY3pweWNuemZnZXJtY21iaW9mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0MDkyNjAsImV4cCI6MjA4Nzk4NTI2MH0.IUibSx0DRm8uSljqjgmZM8vAIz2TONgVdGpyg-G2vjE'

async function testSendOtp() {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify({
        phone: '+639123456789',
        role: 'commuter'
      })
    })
    
    console.log('Status:', res.status)
    const data = await res.json()
    console.log('Response:', data)
    
  } catch (error) {
    console.log('Error:', error.message)
  }
}

testSendOtp()