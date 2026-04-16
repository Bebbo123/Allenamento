import 'react-native-url-polyfill/auto'
import { useEffect, useState } from 'react'
import { View, ActivityIndicator, Text } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { supabase } from './lib/supabase'

import LoginScreen from './screens/LoginScreen'
import RegisterScreen from './screens/RegisterScreen'
import HomeAtletaScreen from './screens/HomeAtletaScreen'
import HomePTScreen from './screens/HomePTScreen'

const Stack = createNativeStackNavigator()

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [debugMsg, setDebugMsg] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      setDebugMsg('getSession: ' + (session ? 'trovata' : 'nessuna') + (error ? ' err:' + error.message : ''))
      setSession(session)
      if (session) {
        fetchProfile(session.user.id)
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setDebugMsg('authChange: ' + event)
      setSession(session)
      if (session) {
        await fetchProfile(session.user.id)
      } else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

async function fetchProfile(userId) {
  setDebugMsg('fetchProfile per: ' + userId)
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    setDebugMsg('profilo: ' + (data ? data.ruolo : 'null') + (error ? ' err:' + error.message : ''))

    if (data) {
      setProfile(data)
    } else {
      setProfile(null)
      await supabase.auth.signOut()
    }
  } catch (e) {
    setDebugMsg('catch: ' + e.message)
    // Se timeout o errore di rete — vai al login invece di bloccarsi
    setProfile(null)
    try { await supabase.auth.signOut() } catch {}
  } finally {
    setLoading(false)
  }
}
  if (loading) {
    return (
      <View style={{
        flex: 1, backgroundColor: '#0d0d0f',
        justifyContent: 'center', alignItems: 'center', gap: 16
      }}>
        <ActivityIndicator size="large" color="#e8ff47" />
        <Text style={{ color: '#9CA3AF', fontSize: 12, textAlign: 'center', paddingHorizontal: 20 }}>
          {debugMsg}
        </Text>
      </View>
    )
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!session ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </>
        ) : profile?.ruolo === 'pt' ? (
          <Stack.Screen name="HomePT" component={HomePTScreen} />
        ) : (
          <Stack.Screen name="HomeAtleta" component={HomeAtletaScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  )
}