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
  const [modificaPTSbloccata, setModificaPTSbloccata] = useState(false)
  const [showConfirmModifica, setShowConfirmModifica] = useState(false)
  const [numSettimane, setNumSettimane] = useState(8)
  const [numSessioni, setNumSessioni] = useState(7)
  const [salvandoConfig, setSalvandoConfig] = useState(false)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setProfile(prof)
    setNumSettimane(prof?.num_settimane || 8)
    setNumSessioni(prof?.num_sessioni || 7)
    setModificaPTSbloccata(prof?.modifica_pt_sbloccata || false)

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
      .select('*').eq('pt_id', ptProfile.id).eq('atleta_id', user.id).single()

    if (esistente) {
      setMsg({ tipo: 'errore', testo: 'Sei già collegato a questo PT.' })
      setCercando(false)
      return
    }

    await supabase.from('pt_atleta').insert({
      pt_id: ptProfile.id, atleta_id: user.id, stato: 'pending'
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

  async function salvaConfigScheda() {
    setSalvandoConfig(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('profiles').update({
      num_settimane: numSettimane,
      num_sessioni: numSessioni
    }).eq('id', user.id)
    setMsg({ tipo: 'ok', testo: '✓ Configurazione salvata!' })
    setSalvandoConfig(false)
  }

  async function sbloccoModificaPT(conferma) {
    setShowConfirmModifica(false)
    if (!conferma) return
    const { data: { user } } = await supabase.auth.getUser()
    const nuovoValore = !modificaPTSbloccata
    await supabase.from('profiles').update({
      modifica_pt_sbloccata: nuovoValore
    }).eq('id', user.id)
    setModificaPTSbloccata(nuovoValore)
    setMsg({
      tipo: 'ok',
      testo: nuovoValore
        ? '🔓 Modifica scheda PT sbloccata'
        : '🔒 Modifica scheda PT bloccata'
    })
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

      {/* MODALE CONFERMA MODIFICA PT */}
      {showConfirmModifica && (
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>
              {modificaPTSbloccata ? '🔒 Blocca modifica?' : '🔓 Sblocca modifica?'}
            </Text>
            <Text style={styles.modalText}>
              {modificaPTSbloccata
                ? 'Vuoi bloccare la modifica della sezione PT? Non potrai più modificare la prescrizione.'
                : 'Stai per sbloccare la modifica della sezione PT.\n\nQuesto ti permette di modificare carico, recupero, ripetizioni e note della prescrizione come se fossi un PT.\n\nSei sicuro?'}
            </Text>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => sbloccoModificaPT(false)}>
                <Text style={styles.modalCancelText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={() => sbloccoModificaPT(true)}>
                <Text style={styles.modalConfirmText}>
                  {modificaPTSbloccata ? 'Blocca' : 'Sblocca'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

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

        {/* CONFIGURAZIONE SCHEDA */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📅 Configurazione Scheda</Text>

          <View style={styles.configRow}>
            <View style={styles.configItem}>
              <Text style={styles.configLabel}>Settimane</Text>
              <View style={styles.configControls}>
                <TouchableOpacity
                  style={styles.configBtn}
                  onPress={() => setNumSettimane(Math.max(1, numSettimane - 1))}
                >
                  <Text style={styles.configBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.configVal}>{numSettimane}</Text>
                <TouchableOpacity
                  style={styles.configBtn}
                  onPress={() => setNumSettimane(Math.min(16, numSettimane + 1))}
                >
                  <Text style={styles.configBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.configItem}>
              <Text style={styles.configLabel}>Sessioni/sett.</Text>
              <View style={styles.configControls}>
                <TouchableOpacity
                  style={styles.configBtn}
                  onPress={() => setNumSessioni(Math.max(1, numSessioni - 1))}
                >
                  <Text style={styles.configBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.configVal}>{numSessioni}</Text>
                <TouchableOpacity
                  style={styles.configBtn}
                  onPress={() => setNumSessioni(Math.min(7, numSessioni + 1))}
                >
                  <Text style={styles.configBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.salvaBtn, salvandoConfig && styles.salvaBtnDisabled]}
            onPress={salvaConfigScheda}
            disabled={salvandoConfig}
          >
            <Text style={styles.salvaBtnText}>
              {salvandoConfig ? 'Salvando...' : '✓ Salva configurazione'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* MODIFICA SCHEDA PT */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>✏️ Modifica Scheda PT</Text>
          <Text style={styles.hint}>
            Se non hai un PT o vuoi gestire la tua scheda autonomamente, puoi sbloccare la modifica della sezione prescrizione.
          </Text>
          <TouchableOpacity
            style={[styles.toggleCard, modificaPTSbloccata && styles.toggleCardActive]}
            onPress={() => setShowConfirmModifica(true)}
          >
            <View style={styles.toggleCardLeft}>
              <Text style={styles.toggleCardIcon}>
                {modificaPTSbloccata ? '🔓' : '🔒'}
              </Text>
              <View>
                <Text style={[styles.toggleCardTitle, modificaPTSbloccata && styles.toggleCardTitleActive]}>
                  {modificaPTSbloccata ? 'Modifica sbloccata' : 'Modifica bloccata'}
                </Text>
                <Text style={styles.toggleCardDesc}>
                  {modificaPTSbloccata
                    ? 'Puoi modificare la sezione prescrizione PT'
                    : 'Solo il PT può modificare la prescrizione'}
                </Text>
              </View>
            </View>
            <View style={[styles.toggleDot, modificaPTSbloccata && styles.toggleDotActive]} />
          </TouchableOpacity>
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
  configRow: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  configItem: {
    flex: 1, backgroundColor: '#1e1e24', borderWidth: 1, borderColor: '#2e2e3a',
    borderRadius: 12, padding: 14, alignItems: 'center', gap: 10
  },
  configLabel: { fontSize: 12, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 },
  configControls: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  configBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#26262e', borderWidth: 1, borderColor: '#2e2e3a',
    justifyContent: 'center', alignItems: 'center'
  },
  configBtnText: { fontSize: 18, color: '#e8ff47', fontWeight: '700' },
  configVal: { fontSize: 28, fontWeight: '900', color: '#e8ff47', minWidth: 36, textAlign: 'center' },
  salvaBtn: {
    backgroundColor: '#e8ff47', borderRadius: 12,
    padding: 14, alignItems: 'center'
  },
  salvaBtnDisabled: { opacity: 0.6 },
  salvaBtnText: { color: '#000', fontWeight: '800', fontSize: 14 },
  hint: { fontSize: 13, color: '#9CA3AF', marginBottom: 14, lineHeight: 20 },
  toggleCard: {
    backgroundColor: '#1e1e24', borderWidth: 1, borderColor: '#2e2e3a',
    borderRadius: 12, padding: 16, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between'
  },
  toggleCardActive: { borderColor: '#e8ff4766', backgroundColor: '#e8ff4711' },
  toggleCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  toggleCardIcon: { fontSize: 24 },
  toggleCardTitle: { fontSize: 14, fontWeight: '700', color: '#9CA3AF', marginBottom: 3 },
  toggleCardTitleActive: { color: '#e8ff47' },
  toggleCardDesc: { fontSize: 12, color: '#6B7280' },
  toggleDot: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#2e2e3a', borderWidth: 2, borderColor: '#6B7280'
  },
  toggleDotActive: { backgroundColor: '#e8ff47', borderColor: '#e8ff47' },
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
  modalOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center',
    alignItems: 'center', zIndex: 999, paddingHorizontal: 32
  },
  modal: {
    backgroundColor: '#1e1e24', borderWidth: 1, borderColor: '#2e2e3a',
    borderRadius: 16, padding: 24, width: '100%'
  },
  modalTitle: { fontSize: 20, fontWeight: '900', color: '#e8ff47', marginBottom: 12 },
  modalText: { fontSize: 14, color: '#9CA3AF', lineHeight: 22, marginBottom: 20 },
  modalBtns: { flexDirection: 'row', gap: 12 },
  modalCancel: {
    flex: 1, backgroundColor: '#26262e', borderRadius: 10, padding: 14, alignItems: 'center'
  },
  modalCancelText: { color: '#9CA3AF', fontWeight: '700', fontSize: 15 },
  modalConfirm: {
    flex: 1, backgroundColor: '#e8ff47', borderRadius: 10, padding: 14, alignItems: 'center'
  },
  modalConfirmText: { color: '#000', fontWeight: '800', fontSize: 15 },
})