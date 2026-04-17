import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  Alert, ScrollView
} from 'react-native'
import { supabase } from '../lib/supabase'

export default function RegisterScreen({ navigation }) {
  const [nome, setNome] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [ruolo, setRuolo] = useState('atleta')
  const [loading, setLoading] = useState(false)

  function generateCodice() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let code = 'PT-'
    for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)]
    return code
  }

  async function handleRegister() {
    if (!nome || !email || !password) {
      Alert.alert('Errore', 'Compila tutti i campi obbligatori')
      return
    }
    if (password.length < 6) {
      Alert.alert('Errore', 'La password deve essere di almeno 6 caratteri')
      return
    }

    // Controlla username univoco se inserito
    if (username.trim()) {
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', username.trim().toLowerCase())
        .single()
      if (existing) {
        Alert.alert('Errore', 'Username già in uso, scegline un altro')
        return
      }
    }

    setLoading(true)

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          nome,
          ruolo,
          username: username.trim().toLowerCase() || null,
          tipo_account: 'email'
        }
      }
    })

    if (error) {
      Alert.alert('Errore', error.message)
      setLoading(false)
      return
    }

    // Fallback insert profilo se il trigger non scatta
    if (data.user) {
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', data.user.id)
        .single()

      if (!existing) {
        await supabase.from('profiles').insert({
          id: data.user.id,
          nome,
          email,
          ruolo,
          username: username.trim().toLowerCase() || null,
          tipo_account: 'email',
          codice_pt: ruolo === 'pt' ? generateCodice() : null
        })
      }
    }

    setLoading(false)
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.inner}>

        <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Torna al Login</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Crea Account</Text>
        <Text style={styles.subtitle}>Inizia il tuo percorso di allenamento</Text>

        <View style={styles.form}>
          <Text style={styles.label}>Nome completo *</Text>
          <TextInput
            style={styles.input}
            value={nome}
            onChangeText={setNome}
            placeholder="Mario Rossi"
            placeholderTextColor="#6B7280"
          />

          <Text style={styles.label}>Username <Text style={styles.optional}>(opzionale)</Text></Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="es. mario_rossi"
            placeholderTextColor="#6B7280"
            autoCapitalize="none"
          />
          <Text style={styles.hint}>Permette di accedere anche senza email</Text>

          <Text style={styles.label}>Email *</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="email@esempio.com"
            placeholderTextColor="#6B7280"
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Text style={styles.label}>Password *</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Minimo 6 caratteri"
            placeholderTextColor="#6B7280"
            secureTextEntry
          />

          <Text style={styles.label}>Sei un...</Text>
          <View style={styles.roleRow}>
            <TouchableOpacity
              style={[styles.roleBtn, ruolo === 'atleta' && styles.roleBtnActive]}
              onPress={() => setRuolo('atleta')}
            >
              <Text style={styles.roleIcon}>🏋️</Text>
              <Text style={[styles.roleText, ruolo === 'atleta' && styles.roleTextActive]}>Atleta</Text>
              <Text style={[styles.roleDesc, ruolo === 'atleta' && styles.roleDescActive]}>
                Mi alleno e registro i progressi
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.roleBtn, ruolo === 'pt' && styles.roleBtnActive]}
              onPress={() => setRuolo('pt')}
            >
              <Text style={styles.roleIcon}>🎓</Text>
              <Text style={[styles.roleText, ruolo === 'pt' && styles.roleTextActive]}>Personal Trainer</Text>
              <Text style={[styles.roleDesc, ruolo === 'pt' && styles.roleDescActive]}>
                Creo schede per i miei atleti
              </Text>
            </TouchableOpacity>
          </View>

          {ruolo === 'pt' && (
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                💡 Dopo la registrazione riceverai un Codice PT univoco da condividere con i tuoi atleti.
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleRegister}
            disabled={loading}
          >
            <Text style={styles.btnText}>
              {loading ? 'Creazione account...' : 'Registrati'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0f' },
  inner: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 60, paddingBottom: 40 },
  back: { marginBottom: 32 },
  backText: { color: '#9CA3AF', fontSize: 14 },
  title: { fontSize: 36, fontWeight: '900', color: '#f0f0f0', marginBottom: 6 },
  subtitle: { fontSize: 15, color: '#9CA3AF', marginBottom: 36 },
  form: { gap: 12 },
  label: { fontSize: 13, fontWeight: '600', color: '#D1D5DB' },
  optional: { color: '#6B7280', fontWeight: '400' },
  hint: { fontSize: 11, color: '#6B7280', marginTop: -8 },
  input: {
    backgroundColor: '#1e1e24', borderWidth: 1, borderColor: '#2e2e3a',
    borderRadius: 12, padding: 14, color: '#f0f0f0', fontSize: 15
  },
  roleRow: { flexDirection: 'row', gap: 12 },
  roleBtn: {
    flex: 1, backgroundColor: '#1e1e24', borderWidth: 1,
    borderColor: '#2e2e3a', borderRadius: 12, padding: 16, alignItems: 'center', gap: 6
  },
  roleBtnActive: { borderColor: '#e8ff47', backgroundColor: '#e8ff4711' },
  roleIcon: { fontSize: 28 },
  roleText: { fontSize: 14, fontWeight: '700', color: '#9CA3AF' },
  roleTextActive: { color: '#e8ff47' },
  roleDesc: { fontSize: 11, color: '#6B7280', textAlign: 'center' },
  roleDescActive: { color: '#9CA3AF' },
  infoBox: {
    backgroundColor: '#1A56DB22', borderWidth: 1,
    borderColor: '#1A56DB44', borderRadius: 12, padding: 14
  },
  infoText: { color: '#93C5FD', fontSize: 13, lineHeight: 20 },
  btn: {
    backgroundColor: '#e8ff47', borderRadius: 12,
    padding: 16, alignItems: 'center', marginTop: 8
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#000', fontWeight: '800', fontSize: 16 }
})