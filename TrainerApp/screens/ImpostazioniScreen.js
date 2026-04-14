import { useState, useEffect } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, TextInput
} from 'react-native'
import { supabase } from '../lib/supabase'

export default function ImpostazioniScreen({ onBack }) {
  const [profile, setProfile] = useState(null)
  const [ptCollegati, setPtCollegati] = useState([])
  const [codicePT, setCodicePT] = useState('')
  const [loading, setLoading] = useState(true)
  const [cercando, setCercando] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setProfile(prof)
    const { data: collegamenti } = await supabase.from('pt_atleta')
      .select('*, pt:pt_id(id, nome, email, codice_pt)')
      .eq('atleta_id', user.id)
    setPtCollegati(collegamenti || [])
    setLoading(false)
  }

  async function collegaPT() {
    if (!codicePT.trim()) return
    setCercando(true)
    setMsg(null)

    const { data: ptProfile } = await supabase.from('profiles')
      .select('*')
      .eq('codice_pt', codicePT.trim().toUpperCase())
      .single()

    if (!ptProfile) {
      setMsg({ tipo: 'errore', testo: 'Codice PT non trovato. Controlla e riprova.' })
      setCercando(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()

    const { data: esistente } = await supabase.from('pt_atleta')
      .select('*')
      .eq('pt_id', ptProfile.id)
      .eq('atleta_id', user.id)
      .single()

    if (esistente) {
      setMsg({ tipo: 'errore', testo: 'Sei già collegato a questo PT.' })
      setCercando(false)
      return
    }

    await supabase.from('pt_atleta').insert({
      pt_id: ptProfile.id,
      atleta_id: user.id,
      stato: 'pending'
    })

    setCodicePT('')
    setMsg({ tipo: 'ok', testo: `Richiesta inviata a ${ptProfile.nome}! Attendi che la accetti.` })
    fetchData()
    setCercando(false)
  }

  async function scollegaPT(id) {
    await supabase.from('pt_atleta').delete().eq('id', id)
    fetchData()
  }

  if (loading) return (
    <View style={styles.loading}>
      <Text style={styles.loadingText}>Caricamento...</Text>
    </View>
  )

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>← Indietro</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Impostazioni</Text>
        <View style={{ width: 90 }} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* PROFILO */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>👤 Profilo</Text>
          <View style={styles.profiloCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {profile?.nome?.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View>
              <Text style={styles.profiloNome}>{profile?.nome}</Text>
              <Text style={styles.profiloEmail}>{profile?.email}</Text>
              <View style={styles.ruoloBadge}>
                <Text style={styles.ruoloBadgeText}>🏋️ Atleta</Text>
              </View>
            </View>
          </View>
        </View>

        {/* COLLEGA PT */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🔗 Collega Personal Trainer</Text>
          <Text style={styles.hint}>
            Inserisci il codice del tuo PT per permettergli di creare e gestire la tua scheda.
          </Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.codiceInput}
              value={codicePT}
              onChangeText={setCodicePT}
              placeholder="Es. PT-A3F92"
              placeholderTextColor="#6B7280"
              autoCapitalize="characters"
              maxLength={8}
            />
            <TouchableOpacity
              style={[styles.collegaBtn, cercando && styles.collegaBtnDisabled]}
              onPress={collegaPT}
              disabled={cercando}
            >
              <Text style={styles.collegaBtnText}>{cercando ? '...' : 'Collega'}</Text>
            </TouchableOpacity>
          </View>

          {msg && (
            <View style={[styles.msgBox, msg.tipo === 'ok' ? styles.msgOk : styles.msgErrore]}>
              <Text style={[styles.msgText, msg.tipo === 'ok' ? styles.msgTextOk : styles.msgTextErrore]}>
                {msg.testo}
              </Text>
            </View>
          )}
        </View>

        {/* PT COLLEGATI */}
        {ptCollegati.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>👥 I tuoi PT</Text>
            {ptCollegati.map(c => (
              <View key={c.id} style={styles.ptCard}>
                <View style={styles.ptAvatar}>
                  <Text style={styles.ptAvatarText}>
                    {c.pt.nome.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.ptInfo}>
                  <Text style={styles.ptNome}>{c.pt.nome}</Text>
                  <View style={[styles.statoBadge, c.stato === 'attivo' ? styles.statoAttivo : styles.statoPending]}>
                    <Text style={[styles.statoText, c.stato === 'attivo' ? styles.statoAttivoText : styles.statoPendingText]}>
                      {c.stato === 'attivo' ? '✓ Attivo' : '⏳ In attesa'}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity style={styles.scollegaBtn} onPress={() => scollegaPT(c.id)}>
                  <Text style={styles.scollegaBtnText}>Scollega</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0f' },
  loading: { flex: 1, backgroundColor: '#0d0d0f', justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#9CA3AF', fontSize: 16 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#1e1e24'
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#f0f0f0' },
  backBtn: { backgroundColor: '#1e1e24', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, width: 90 },
  backText: { color: '#9CA3AF', fontSize: 13, fontWeight: '600' },
  scroll: { flex: 1 },
  section: { paddingHorizontal: 20, marginTop: 24 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#f0f0f0', marginBottom: 14 },
  profiloCard: {
    backgroundColor: '#1e1e24', borderWidth: 1, borderColor: '#2e2e3a',
    borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 16
  },
  avatar: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#e8ff4722', justifyContent: 'center', alignItems: 'center'
  },
  avatarText: { fontSize: 22, fontWeight: '900', color: '#e8ff47' },
  profiloNome: { fontSize: 16, fontWeight: '700', color: '#f0f0f0', marginBottom: 4 },
  profiloEmail: { fontSize: 13, color: '#9CA3AF', marginBottom: 8 },
  ruoloBadge: {
    backgroundColor: '#7eb8ff22', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start'
  },
  ruoloBadgeText: { fontSize: 11, fontWeight: '700', color: '#7eb8ff' },
  hint: { fontSize: 13, color: '#9CA3AF', marginBottom: 14, lineHeight: 20 },
  inputRow: { flexDirection: 'row', gap: 10 },
  codiceInput: {
    flex: 1, backgroundColor: '#1e1e24', borderWidth: 1, borderColor: '#2e2e3a',
    borderRadius: 10, padding: 14, color: '#f0f0f0', fontSize: 16,
    fontWeight: '700', letterSpacing: 2
  },
  collegaBtn: {
    backgroundColor: '#e8ff47', borderRadius: 10,
    paddingHorizontal: 20, justifyContent: 'center', alignItems: 'center'
  },
  collegaBtnDisabled: { opacity: 0.6 },
  collegaBtnText: { color: '#000', fontWeight: '800', fontSize: 14 },
  msgBox: { marginTop: 12, borderRadius: 10, padding: 12, borderWidth: 1 },
  msgOk: { backgroundColor: '#52e89e22', borderColor: '#52e89e44' },
  msgErrore: { backgroundColor: '#ff3b3b22', borderColor: '#ff3b3b44' },
  msgText: { fontSize: 13, fontWeight: '600' },
  msgTextOk: { color: '#52e89e' },
  msgTextErrore: { color: '#ff6b6b' },
  ptCard: {
    backgroundColor: '#1e1e24', borderWidth: 1, borderColor: '#2e2e3a',
    borderRadius: 12, padding: 14, flexDirection: 'row',
    alignItems: 'center', marginBottom: 10, gap: 12
  },
  ptAvatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#7eb8ff22', justifyContent: 'center', alignItems: 'center'
  },
  ptAvatarText: { fontSize: 18, fontWeight: '900', color: '#7eb8ff' },
  ptInfo: { flex: 1, gap: 6 },
  ptNome: { fontSize: 15, fontWeight: '700', color: '#f0f0f0' },
  statoBadge: {
    alignSelf: 'flex-start', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1
  },
  statoAttivo: { backgroundColor: '#52e89e22', borderColor: '#52e89e44' },
  statoPending: { backgroundColor: '#f59e0b22', borderColor: '#f59e0b44' },
  statoText: { fontSize: 11, fontWeight: '700' },
  statoAttivoText: { color: '#52e89e' },
  statoPendingText: { color: '#f59e0b' },
  scollegaBtn: {
    backgroundColor: '#ff3b3b22', borderWidth: 1, borderColor: '#ff3b3b44',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8
  },
  scollegaBtnText: { color: '#ff6b6b', fontWeight: '700', fontSize: 12 },
})