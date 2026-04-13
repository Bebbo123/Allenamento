import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import 'react-native-url-polyfill/auto'

const SUPABASE_URL = 'https://lyxpeecrxhlleahvxzjw.supabase.co'   // ← sostituisci
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5eHBlZWNyeGhsbGVhaHZ4emp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwODU5ODAsImV4cCI6MjA5MTY2MTk4MH0.DrqPs0RUMxVvIj8ds2vq5kbI6oLs232wWVqD9DHi4a8'                     // ← sostituisci

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})