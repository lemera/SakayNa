import 'react-native-url-polyfill/auto'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://riseunullhczomqxkcbn.supabase.co'
export const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJpc2V1bnVsbGhjem9tcXhrY2JuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwODAyMzgsImV4cCI6MjA4NzY1NjIzOH0.suU5_J6vNNZ3ZkW_Ckj5N2Fn7Zut7qNXxQNPPvvNPmQ'

// CRITICAL DEBUG - MUST SHOW IN CONSOLE
console.log('====================');
console.log('SUPABASE URL:', supabaseUrl);
console.log('PROJECT:', supabaseUrl.includes('riseunullhczomqxkcbn') ? 'NEW ✅' : 'OLD ❌');
console.log('====================');

export const supabase = createClient(supabaseUrl, supabaseAnonKey)