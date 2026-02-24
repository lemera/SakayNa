import 'react-native-url-polyfill/auto'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://avrejcxahggprhjgdpkc.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2cmVqY3hhaGdncHJoamdkcGtjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4MTEyMjUsImV4cCI6MjA4NzM4NzIyNX0.Eujbk08Rc-4u3VucexfPkdBFRsoIPvx5-x75bv-a3gE'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)