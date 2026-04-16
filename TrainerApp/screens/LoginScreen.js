import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform
} from 'react-native'
import { supabase } from '../lib/supabase'

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errore, setErrore] = useState('')

  async function handleLogin() {
    if (!email || !password) {
      setErrore('Inserisci email e password')
      return
    }
    setLoading(true)
    setErrore('')

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })

      if (error) {
        setErrore('Errore: ' + error.message)
        setLoading(false)
        return
      }

      if (!data?.session) {
        setErrore('Sessione non creata — riprova')
        setLoading(false)
        return
      }

      // Login OK — App.js gestirà il redirect automaticamente
    } catch (e) {
      setErrore('Errore di rete: ' + e.message)
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        <Text style={styles.logo}>TRAINER</Text>
        <Text style={styles.subtitle}>Il tuo allenamento, ovunque</Text>

        <View style={styles.form}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="email@esempio.com"
            placeholderTextColor="#6B7280"
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor="#6B7280"
            secureTextEntry
          />

          {errore !== '' && (
            <View style={styles.erroreBox}>
              <Text style={styles.erroreText}>{errore}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            <Text style={styles.btnText}>
              {loading ? 'Accesso in corso...' : 'Accedi'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkBtn}
            onPress={() => navigation.navigate('Register')}
          >
            <Text style={styles.linkText}>
              Non hai un account? <Text style={styles.linkBold}>Registrati</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0f' },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  logo: {
    fontSize: 52, fontWeight: '900', color: '#e8ff47',
    letterSpacing: 4, textAlign: 'center', marginBottom: 6
  },
  subtitle: {
    fontSize: 15, color: '#9CA3AF', textAlign: 'center', marginBottom: 48
  },
  form: { gap: 12 },
  label: { fontSize: 13, fontWeight: '600', color: '#D1D5DB' },
  input: {
    backgroundColor: '#1e1e24', borderWidth: 1, borderColor: '#2e2e3a',
    borderRadius: 12, padding: 14, color: '#f0f0f0', fontSize: 15
  },
  erroreBox: {
    backgroundColor: '#ff3b3b22', borderWidth: 1, borderColor: '#ff3b3b44',
    borderRadius: 10, padding: 12
  },
  erroreText: { color: '#ff6b6b', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  btn: {
    backgroundColor: '#e8ff47', borderRadius: 12,
    padding: 16, alignItems: 'center', marginTop: 8
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#000', fontWeight: '800', fontSize: 16 },
  linkBtn: { alignItems: 'center', marginTop: 16 },
  linkText: { color: '#9CA3AF', fontSize: 14 },
  linkBold: { color: '#e8ff47', fontWeight: '700' }
})