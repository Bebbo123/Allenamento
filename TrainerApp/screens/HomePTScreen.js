import { useState, useEffect, useRef } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, TextInput, Vibration
} from 'react-native'
import { supabase } from '../lib/supabase'
import ProgressiScreen from './ProgressiScreen'
import StoricoSchede from './StoricoSchede'
import VistaTabella from './VistaTabella'
// Client temporaneo per creare atleti senza toccare la sessione PT
import { createClient } from '@supabase/supabase-js'

const tempSupabase = createClient(
  'https://lyxpeecrxhlleahvxzjw.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5eHBlZWNyeGhsbGVhaHZ4emp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwODU5ODAsImV4cCI6MjA5MTY2MTk4MH0.DrqPs0RUMxVvIj8ds2vq5kbI6oLs232wWVqD9DHi4a8',
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: 'trainer-app-temp-signup'
    }
  }
)

export default function HomePTScreen() {
  const [profile, setProfile] = useState(null)
  const [atleti, setAtleti] = useState([])
  const [richieste, setRichieste] = useState([])
  const [atletaSelezionato, setAtletaSelezionato] = useState(null)
  const [atletaProgressi, setAtletaProgressi] = useState(null)
  const [atletaStorico, setAtletaStorico] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showCreaAtleta, setShowCreaAtleta] = useState(false)
  const [nuovoNome, setNuovoNome] = useState('')
  const [nuovoUsername, setNuovoUsername] = useState('')
  const [nuovaPassword, setNuovaPassword] = useState('')
  const [creaLoading, setCreaLoading] = useState(false)
  const [creaMsg, setCreaMsg] = useState(null)
  const [confirmDeleteAtleta, setConfirmDeleteAtleta] = useState(null)
  const [deletingAtleta, setDeletingAtleta] = useState(false)

  useEffect(() => { fetchProfile() }, [])
  useEffect(() => { if (profile) { fetchAtleti(); fetchRichieste() } }, [profile])

  async function fetchProfile() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setProfile(data)
    setLoading(false)
  }

  async function fetchAtleti() {
    const { data } = await supabase.from('pt_atleta')
      .select('*, atleta:atleta_id(id, nome, email, num_settimane, num_sessioni, username, tipo_account)')
      .eq('pt_id', profile.id)
      .eq('stato', 'attivo')
    setAtleti(data || [])
  }

  async function fetchRichieste() {
    const { data } = await supabase.from('pt_atleta')
      .select('*, atleta:atleta_id(id, nome, email)')
      .eq('pt_id', profile.id)
      .eq('stato', 'pending')
    setRichieste(data || [])
  }

  async function accettaRichiesta(id) {
    await supabase.from('pt_atleta').update({ stato: 'attivo' }).eq('id', id)
    fetchAtleti(); fetchRichieste()
  }

  async function rifiutaRichiesta(id) {
    await supabase.from('pt_atleta').update({ stato: 'rifiutato' }).eq('id', id)
    fetchRichieste()
  }

  async function eliminaAtleta(atleta) {
    setDeletingAtleta(true)
    const { error } = await supabase.rpc('delete_athlete_account', {
      p_atleta_id: atleta.id,
      p_pt_id: profile.id
    })
    if (error) {
      alert('Errore: ' + error.message)
    } else {
      fetchAtleti()
    }
    setConfirmDeleteAtleta(null)
    setDeletingAtleta(false)
  }

async function creaAtleta() {
  if (!nuovoNome.trim() || !nuovoUsername.trim() || !nuovaPassword.trim()) {
    setCreaMsg({ tipo: 'errore', testo: 'Compila tutti i campi' })
    return
  }
  if (nuovaPassword.length < 6) {
    setCreaMsg({ tipo: 'errore', testo: 'Password minimo 6 caratteri' })
    return
  }

  setCreaLoading(true)
  setCreaMsg(null)

  const username = nuovoUsername.trim().toLowerCase()

  const { data: existingList } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', username)

  if (existingList && existingList.length > 0) {
    setCreaMsg({ tipo: 'errore', testo: 'Username già in uso, scegline un altro' })
    setCreaLoading(false)
    return
  }

  const fakeEmail = `${username}@trainer-test.it`

  // Salva sessione PT
  const { data: { session: sessionePT } } = await supabase.auth.getSession()
  const ptAccessToken = sessionePT.access_token
  const ptRefreshToken = sessionePT.refresh_token
  const ptId = profile.id

  // SignUp atleta — questo sovrascrive la sessione
  const { data, error } = await supabase.auth.signUp({
    email: fakeEmail,
    password: nuovaPassword,
    options: {
      data: {
        nome: nuovoNome.trim(),
        ruolo: 'atleta',
        username,
        tipo_account: 'username',
        pt_creatore: ptId
      }
    }
  })

  if (error || !data.user) {
    // Ripristina sessione PT
    await supabase.auth.setSession({
      access_token: ptAccessToken,
      refresh_token: ptRefreshToken
    })
    setCreaMsg({ tipo: 'errore', testo: error ? error.message : 'Errore creazione' })
    setCreaLoading(false)
    return
  }

  const atletaId = data.user.id

  // Ripristina SUBITO sessione PT prima di qualsiasi altra operazione
  await supabase.auth.setSession({
    access_token: ptAccessToken,
    refresh_token: ptRefreshToken
  })

  // Aspetta che sessione PT sia attiva e trigger abbia creato profilo
  await new Promise(resolve => setTimeout(resolve, 2000))

  // Aggiorna profilo atleta con dati PT tramite funzione SQL
  await supabase.rpc('setup_athlete_data', {
    p_atleta_id: atletaId,
    p_username: username,
    p_nome: nuovoNome.trim(),
    p_email: fakeEmail,
    p_pt_id: ptId
  })

  setCreaMsg({ tipo: 'ok', testo: `✓ Atleta "${nuovoNome.trim()}" creato! Username: @${username}` })
  setNuovoNome('')
  setNuovoUsername('')
  setNuovaPassword('')
  setCreaLoading(false)

  setTimeout(() => fetchAtleti(), 500)
}

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  if (loading) return (
    <View style={styles.loading}>
      <Text style={styles.loadingText}>Caricamento...</Text>
    </View>
  )

  if (atletaProgressi) {
    return <ProgressiScreen onBack={() => setAtletaProgressi(null)} atletaId={atletaProgressi.id} />
  }

  if (atletaStorico) {
    return <StoricoSchede onBack={() => setAtletaStorico(null)} atletaId={atletaStorico.id} />
  }

  if (atletaSelezionato) {
    return (
      <SchedaAtletaPT
        atleta={atletaSelezionato}
        ptId={profile.id}
        onBack={() => { setAtletaSelezionato(null); fetchAtleti() }}
        onProgressi={() => setAtletaProgressi(atletaSelezionato)}
        onStorico={() => setAtletaStorico(atletaSelezionato)}
      />
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.logo}>TRAINER</Text>
          <Text style={styles.welcome}>PT: {profile?.nome?.split(' ')[0]} 👋</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Esci</Text>
        </TouchableOpacity>
      </View>

      {/* MODALE ELIMINA ATLETA */}
      {confirmDeleteAtleta && (
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>🗑 Elimina Atleta</Text>
            <Text style={styles.modalText}>
              Vuoi eliminare definitivamente{' '}
              <Text style={{ color: '#f0f0f0', fontWeight: '700' }}>
                {confirmDeleteAtleta.nome}
              </Text>?{'\n\n'}
              Verranno eliminati account, schede, esercizi e tutti i dati.
              Questa azione è irreversibile.
            </Text>
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setConfirmDeleteAtleta(null)}>
                <Text style={styles.modalCancelText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm, deletingAtleta && { opacity: 0.6 }]}
                onPress={() => eliminaAtleta(confirmDeleteAtleta)}
                disabled={deletingAtleta}>
                <Text style={styles.modalConfirmText}>
                  {deletingAtleta ? 'Eliminando...' : '🗑 Elimina'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* CODICE PT */}
        <View style={styles.codiceBox}>
          <Text style={styles.codiceLabel}>Il tuo Codice PT</Text>
          <Text style={styles.codice}>{profile?.codice_pt}</Text>
          <Text style={styles.codiceHint}>Condividilo con i tuoi atleti per collegarti</Text>
        </View>

        {/* RICHIESTE IN ATTESA */}
        {richieste.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🔔 Richieste in attesa ({richieste.length})</Text>
            {richieste.map(r => (
              <View key={r.id} style={styles.richiestaCard}>
                <View style={styles.richiestaInfo}>
                  <Text style={styles.richiestaName}>{r.atleta.nome}</Text>
                  <Text style={styles.richiestaEmail}>{r.atleta.email}</Text>
                </View>
                <View style={styles.richiestaActions}>
                  <TouchableOpacity style={styles.btnRifiuta} onPress={() => rifiutaRichiesta(r.id)}>
                    <Text style={styles.btnRifiutaText}>✕</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.btnAccetta} onPress={() => accettaRichiesta(r.id)}>
                    <Text style={styles.btnAccettaText}>✓ Accetta</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* CREA ATLETA */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>➕ Crea Atleta</Text>
            <TouchableOpacity
              style={styles.toggleCreaBtn}
              onPress={() => { setShowCreaAtleta(!showCreaAtleta); setCreaMsg(null) }}>
              <Text style={styles.toggleCreaBtnText}>
                {showCreaAtleta ? '✕ Chiudi' : '+ Nuovo'}
              </Text>
            </TouchableOpacity>
          </View>

          {showCreaAtleta && (
            <View style={styles.creaForm}>
              <Text style={styles.creaFormDesc}>
                Crea un account per il tuo atleta. Accederà con username e password, senza bisogno di email. Sarà collegato a te in modo permanente.
              </Text>

              <Text style={styles.creaLabel}>Nome completo *</Text>
              <TextInput
                style={styles.creaInput}
                value={nuovoNome}
                onChangeText={setNuovoNome}
                placeholder="es. Mario Rossi"
                placeholderTextColor="#6B7280"
              />

              <Text style={styles.creaLabel}>Username *</Text>
              <View style={styles.usernameRow}>
                <Text style={styles.usernameAt}>@</Text>
                <TextInput
                  style={[styles.creaInput, { flex: 1 }]}
                  value={nuovoUsername}
                  onChangeText={v => setNuovoUsername(v.toLowerCase().replace(/\s/g, '_'))}
                  placeholder="es. mario_rossi"
                  placeholderTextColor="#6B7280"
                  autoCapitalize="none"
                />
              </View>

              <Text style={styles.creaLabel}>Password *</Text>
              <TextInput
                style={styles.creaInput}
                value={nuovaPassword}
                onChangeText={setNuovaPassword}
                placeholder="Minimo 6 caratteri"
                placeholderTextColor="#6B7280"
                secureTextEntry
              />

              {creaMsg && (
                <View style={[styles.msgBox, creaMsg.tipo === 'ok' ? styles.msgOk : styles.msgErrore]}>
                  <Text style={[styles.msgText, creaMsg.tipo === 'ok' ? styles.msgTextOk : styles.msgTextErrore]}>
                    {creaMsg.testo}
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.creaBtn, creaLoading && styles.creaBtnDisabled]}
                onPress={creaAtleta}
                disabled={creaLoading}>
                <Text style={styles.creaBtnText}>
                  {creaLoading ? 'Creazione in corso...' : '✓ Crea Atleta'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ATLETI COLLEGATI */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
  <View style={styles.sectionHeader}>
  <Text style={styles.sectionTitle}>👥 I tuoi Atleti ({atleti.length})</Text>
  <TouchableOpacity style={styles.refreshBtn} onPress={fetchAtleti}>
    <Text style={styles.refreshBtnText}>↻ Aggiorna</Text>
  </TouchableOpacity>
</View>
  <TouchableOpacity style={styles.refreshBtn} onPress={fetchAtleti}>
    <Text style={styles.refreshBtnText}>↻ Aggiorna</Text>
  </TouchableOpacity>
</View>
          {atleti.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>👤</Text>
              <Text style={styles.emptyTitle}>Nessun atleta collegato</Text>
              <Text style={styles.emptyText}>
                Condividi il codice <Text style={{ color: '#e8ff47' }}>{profile?.codice_pt}</Text> oppure crea un atleta qui sopra
              </Text>
            </View>
          ) : (
            atleti.map(a => (
              <View key={a.id} style={styles.atletaCard}>
                <TouchableOpacity
                  style={styles.atletaCardMain}
                  onPress={() => setAtletaSelezionato(a.atleta)}>
                  <View style={styles.atletaAvatar}>
                    <Text style={styles.atletaAvatarText}>
                      {a.atleta.nome.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.atletaInfo}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.atletaNome}>{a.atleta.nome}</Text>
                      {a.atleta.tipo_account === 'username' && (
                        <View style={styles.usernameTag}>
                          <Text style={styles.usernameTagText}>👤</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.atletaEmail}>
                      {a.atleta.tipo_account === 'username'
                        ? `@${a.atleta.username}`
                        : a.atleta.email}
                    </Text>
                    <Text style={styles.atletaMeta}>
                      {a.atleta.num_settimane || 8} sett. · {a.atleta.num_sessioni || 7} sess.
                    </Text>
                  </View>
                </TouchableOpacity>
                {a.atleta.tipo_account === 'username' && (
                  <TouchableOpacity
                    style={styles.deleteAtletaBtn}
                    onPress={() => setConfirmDeleteAtleta(a.atleta)}>
                    <Text style={styles.deleteAtletaBtnText}>🗑</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.iconActionBtn} onPress={() => setAtletaStorico(a.atleta)}>
                  <Text style={styles.iconActionText}>📚</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconActionBtn} onPress={() => setAtletaProgressi(a.atleta)}>
                  <Text style={styles.iconActionText}>📈</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.schedaBtn} onPress={() => setAtletaSelezionato(a.atleta)}>
                  <Text style={styles.schedaBtnText}>Scheda →</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  )
}

// ── SCHEDA ATLETA VISTA DAL PT ─────────────────
function SchedaAtletaPT({ atleta, ptId, onBack, onProgressi, onStorico }) {
  const [settimana, setSettimana] = useState(1)
  const [sessione, setSessione] = useState(1)
  const [sessionDow, setSessionDow] = useState({})
  const [exercises, setExercises] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddEx, setShowAddEx] = useState(false)
  const [nuovoNome, setNuovoNome] = useState('')
  const [nuovoNumSerie, setNuovoNumSerie] = useState('3')
  const [nuovoCarico, setNuovoCarico] = useState('')
  const [nuovoRecupero, setNuovoRecupero] = useState('')
  const [nuovoRip, setNuovoRip] = useState('')
  const [nuovoNote, setNuovoNote] = useState('')
  const [settimaneSelezionate, setSettimaneSelezionate] = useState([])
  const [sessioniSelezionate, setSessioniSelezionate] = useState([])
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [confirmSovrascrittura, setConfirmSovrascrittura] = useState(false)
  const [pendingExerciseData, setPendingExerciseData] = useState(null)
  const [completamenti, setCompletamenti] = useState({})
  const [sessioniCompletate, setSessioniCompletate] = useState({})
  const [timerAttivo, setTimerAttivo] = useState(false)
  const [timerSecondi, setTimerSecondi] = useState(0)
  const timerRef = useRef(null)
  const [numSettimane, setNumSettimaneState] = useState(atleta.num_settimane || 8)
  const [numSessioni, setNumSessioniState] = useState(atleta.num_sessioni || 7)
  const [showConfigScheda, setShowConfigScheda] = useState(false)
  const [configSett, setConfigSett] = useState(atleta.num_settimane || 8)
  const [configSess, setConfigSess] = useState(atleta.num_sessioni || 7)
  const [vistaTabella, setVistaTabella] = useState(false)
  const [showConfirmArchivia, setShowConfirmArchivia] = useState(false)
  const [archiviando, setArchiviando] = useState(false)
  const [nomeNuovaScheda, setNomeNuovaScheda] = useState('')
  const [schedaAttiva, setSchedaAttiva] = useState(null)

  useEffect(() => {
    const s = Array.from({length: numSettimane}, (_, i) => i + 1)
    setSettimaneSelezionate(s)
    setSessioniSelezionate([sessione])
    fetchSchedaAttiva()
  }, [])

  useEffect(() => {
    fetchExercises()
    fetchSessionDow()
    fetchCompletamenti()
    fetchSessioniCompletate()
  }, [settimana, sessione])

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  async function fetchSchedaAttiva() {
    const { data } = await supabase.from('schede')
      .select('*').eq('atleta_id', atleta.id).eq('stato', 'attiva').single()
    setSchedaAttiva(data)
  }

  async function fetchSessionDow() {
    const { data } = await supabase.from('session_dow')
      .select('*').eq('atleta_id', atleta.id)
    if (data) {
      const map = {}
      data.forEach(d => { map[`${d.settimana}_${d.sessione}`] = d.giorno })
      setSessionDow(map)
    }
  }

  async function fetchCompletamenti() {
    const { data } = await supabase.from('completamenti')
      .select('*').eq('atleta_id', atleta.id)
      .eq('settimana', settimana).eq('sessione', sessione)
    if (data) {
      const map = {}
      data.forEach(d => { map[d.exercise_id] = d.completato })
      setCompletamenti(map)
    }
  }

  async function fetchSessioniCompletate() {
    const { data } = await supabase.from('sessioni_completate')
      .select('*').eq('atleta_id', atleta.id).eq('settimana', settimana)
    if (data) {
      const map = {}
      data.forEach(d => { map[d.sessione] = d.completata })
      setSessioniCompletate(map)
    }
  }

  async function fetchExercises() {
    const { data: seriesData } = await supabase.from('series')
      .select(`*, exercises!inner(*), series_pt(*), series_atleta(*)`)
      .eq('exercises.atleta_id', atleta.id)
      .eq('settimana', settimana)
      .eq('sessione', sessione)
      .order('numero')

    if (!seriesData) { setLoading(false); return }

    const exMap = {}
    seriesData.forEach(s => {
      const ex = s.exercises
      if (!exMap[ex.id]) exMap[ex.id] = { ...ex, series: [] }
      exMap[ex.id].series.push({
        id: s.id, numero: s.numero,
        series_pt: s.series_pt, series_atleta: s.series_atleta
      })
    })
    const sorted = Object.values(exMap).sort((a, b) => (a.ordine || 0) - (b.ordine || 0))
    setExercises(sorted)
    setLoading(false)
  }

  async function salvaConfigScheda() {
    await supabase.from('profiles').update({
      num_settimane: configSett, num_sessioni: configSess
    }).eq('id', atleta.id)
    if (schedaAttiva) {
      await supabase.from('schede').update({
        num_settimane: configSett, num_sessioni: configSess
      }).eq('id', schedaAttiva.id)
    }
    setNumSettimaneState(configSett)
    setNumSessioniState(configSess)
    setShowConfigScheda(false)
  }

  async function archiviaScheda() {
    if (!schedaAttiva) return
    setArchiviando(true)
    await supabase.from('schede').update({
      stato: 'archiviata', archiviata_at: new Date().toISOString()
    }).eq('id', schedaAttiva.id)

    const { data: archiviate } = await supabase.from('schede')
      .select('*').eq('atleta_id', atleta.id).eq('stato', 'archiviata')
      .order('archiviata_at', { ascending: true })

    if (archiviate && archiviate.length > 6) {
      const daEliminare = archiviate[0]
      await supabase.from('exercises').delete().eq('scheda_id', daEliminare.id)
      await supabase.from('schede').delete().eq('id', daEliminare.id)
    }

    const { count } = await supabase.from('schede')
      .select('*', { count: 'exact', head: true }).eq('atleta_id', atleta.id)

    const nomeScheda = nomeNuovaScheda.trim() || `Scheda ${(count || 0) + 1}`
    const { data: nuovaScheda } = await supabase.from('schede').insert({
      atleta_id: atleta.id, nome: nomeScheda, stato: 'attiva',
      num_settimane: numSettimane, num_sessioni: numSessioni
    }).select().single()

    setSchedaAttiva(nuovaScheda)
    setShowConfirmArchivia(false)
    setNomeNuovaScheda('')
    setArchiviando(false)
    fetchExercises()
  }

  async function checkSovrascrittura(exId, settimaneTarget, sessioniTarget) {
    const conflicts = []
    for (const w of settimaneTarget) {
      for (const s of sessioniTarget) {
        if (w === settimana && s === sessione) continue
        const { data } = await supabase.from('series')
          .select('*, series_pt(*)')
          .eq('exercise_id', exId)
          .eq('settimana', w)
          .eq('sessione', s)
        if (data && data.length > 0) {
          const hasPT = data.some(d => d.series_pt && (
            d.series_pt.carico || d.series_pt.ripetizioni ||
            d.series_pt.recupero || d.series_pt.note
          ))
          if (hasPT) conflicts.push({ settimana: w, sessione: s })
        }
      }
    }
    return conflicts
  }

  async function addExercise() {
    if (!nuovoNome.trim()) return
    const numSerie = parseInt(nuovoNumSerie) || 3
    const maxOrdine = exercises.length

    const { data: ex } = await supabase.from('exercises').insert({
      atleta_id: atleta.id, nome: nuovoNome.trim(),
      creato_da: 'pt', ordine: maxOrdine,
      scheda_id: schedaAttiva?.id
    }).select().single()

    for (let i = 1; i <= numSerie; i++) {
      const { data: serie } = await supabase.from('series').insert({
        exercise_id: ex.id, settimana, sessione, numero: i
      }).select().single()

      if (nuovoCarico || nuovoRecupero || nuovoRip || nuovoNote) {
        await supabase.from('series_pt').insert({
          serie_id: serie.id,
          carico: nuovoCarico || null,
          recupero: nuovoRecupero || null,
          ripetizioni: nuovoRip || null,
          note: nuovoNote || null
        })
      }
    }

    const altreDestinazioni = []
    for (const w of settimaneSelezionate) {
      for (const s of sessioniSelezionate) {
        if (w === settimana && s === sessione) continue
        altreDestinazioni.push({ w, s })
      }
    }

    for (const { w, s } of altreDestinazioni) {
      for (let i = 1; i <= numSerie; i++) {
        const { data: serie } = await supabase.from('series').insert({
          exercise_id: ex.id, settimana: w, sessione: s, numero: i
        }).select().single()

        if (nuovoCarico || nuovoRecupero || nuovoRip || nuovoNote) {
          await supabase.from('series_pt').insert({
            serie_id: serie.id,
            carico: nuovoCarico || null,
            recupero: nuovoRecupero || null,
            ripetizioni: nuovoRip || null,
            note: nuovoNote || null
          })
        }
      }
    }

    resetForm()
    fetchExercises()
  }

  async function copiaPTsuEsercizio(exercise, settimaneTarget, sessioniTarget) {
    const valoriPT = {}
    exercise.series.forEach((s, i) => {
      valoriPT[i + 1] = {
        carico: s.series_pt?.carico || null,
        recupero: s.series_pt?.recupero || null,
        ripetizioni: s.series_pt?.ripetizioni || null,
        note: s.series_pt?.note || null
      }
    })

    const conflicts = await checkSovrascrittura(exercise.id, settimaneTarget, sessioniTarget)

    if (conflicts.length > 0) {
      setPendingExerciseData({ exercise, settimaneTarget, sessioniTarget, valoriPT, conflicts })
      setConfirmSovrascrittura(true)
    } else {
      await eseguiCopiaPT(exercise.id, settimaneTarget, sessioniTarget, valoriPT, exercise.series.length, false)
      fetchExercises()
    }
  }

  async function eseguiCopiaPT(exerciseId, settimaneTarget, sessioniTarget, valoriPT, numSerie, soloNonEsistenti) {
    for (const w of settimaneTarget) {
      for (const s of sessioniTarget) {
        if (w === settimana && s === sessione) continue
        for (let i = 1; i <= numSerie; i++) {
          const { data: existingSerie } = await supabase.from('series')
            .select('*, series_pt(*)')
            .eq('exercise_id', exerciseId)
            .eq('settimana', w).eq('sessione', s).eq('numero', i)
            .single()

          if (existingSerie) {
            const hasPT = existingSerie.series_pt && (
              existingSerie.series_pt.carico || existingSerie.series_pt.ripetizioni ||
              existingSerie.series_pt.recupero || existingSerie.series_pt.note
            )
            if (soloNonEsistenti && hasPT) continue
            const pt = valoriPT[i] || {}
            await supabase.from('series_pt').upsert({
              serie_id: existingSerie.id,
              carico: pt.carico || null, recupero: pt.recupero || null,
              ripetizioni: pt.ripetizioni || null, note: pt.note || null
            }, { onConflict: 'serie_id' })
          } else {
            const { data: nuovaSerie } = await supabase.from('series').insert({
              exercise_id: exerciseId, settimana: w, sessione: s, numero: i
            }).select().single()
            const pt = valoriPT[i] || {}
            if (pt.carico || pt.recupero || pt.ripetizioni || pt.note) {
              await supabase.from('series_pt').insert({
                serie_id: nuovaSerie.id,
                carico: pt.carico || null, recupero: pt.recupero || null,
                ripetizioni: pt.ripetizioni || null, note: pt.note || null
              })
            }
          }
        }
      }
    }
  }

  function resetForm() {
    setNuovoNome(''); setNuovoNumSerie('3')
    setNuovoCarico(''); setNuovoRecupero('')
    setNuovoRip(''); setNuovoNote('')
    setShowAddEx(false)
  }

  async function deleteExercise(exerciseId) {
    await supabase.from('series').delete().eq('exercise_id', exerciseId)
    await supabase.from('exercises').delete().eq('id', exerciseId)
    setConfirmDelete(null); fetchExercises()
  }

  async function spostaEsercizio(exerciseId, direzione) {
    const idx = exercises.findIndex(e => e.id === exerciseId)
    if (direzione === 'su' && idx === 0) return
    if (direzione === 'giu' && idx === exercises.length - 1) return
    const newExercises = [...exercises]
    const swapIdx = direzione === 'su' ? idx - 1 : idx + 1
    const temp = newExercises[idx]
    newExercises[idx] = newExercises[swapIdx]
    newExercises[swapIdx] = temp
    setExercises(newExercises)
    await supabase.from('exercises').update({ ordine: swapIdx }).eq('id', newExercises[swapIdx].id)
    await supabase.from('exercises').update({ ordine: idx }).eq('id', newExercises[idx].id)
  }

  async function updatePT(serieId, field, value) {
    await supabase.from('series_pt').upsert({
      serie_id: serieId, [field]: value
    }, { onConflict: 'serie_id' })
  }

  function avviaTimer(secondi) {
    if (timerRef.current) clearInterval(timerRef.current)
    const sec = parseInt(secondi)
    if (!sec || sec <= 0) return
    setTimerAttivo(true)
    setTimerSecondi(sec)
    timerRef.current = setInterval(() => {
      setTimerSecondi(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current)
          setTimerAttivo(false)
          Vibration.vibrate([0, 300, 100, 300, 100, 300])
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  function stopTimer() {
    if (timerRef.current) clearInterval(timerRef.current)
    setTimerAttivo(false)
    setTimerSecondi(0)
  }

  const currentDow = sessionDow[`${settimana}_${sessione}`]
  const tutteSettimane = Array.from({length: numSettimane}, (_, i) => i + 1)
  const tutteSessioni = Array.from({length: numSessioni}, (_, i) => i + 1)

  if (vistaTabella) {
    return (
      <VistaTabella
        onBack={() => setVistaTabella(false)}
        atletaId={atleta.id}
        numSettimane={numSettimane}
        numSessioni={numSessioni}
      />
    )
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
          <Text style={styles.backText}>← Atleti</Text>
        </TouchableOpacity>
        <Text style={styles.atletaHeaderNome} numberOfLines={1}>{atleta.nome}</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => setVistaTabella(true)}>
            <Text style={styles.iconBtnText}>👁</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => setShowConfigScheda(!showConfigScheda)}>
            <Text style={styles.iconBtnText}>⚙️</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={onStorico}>
            <Text style={styles.iconBtnText}>📚</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={onProgressi}>
            <Text style={styles.iconBtnText}>📈</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* TIMER OVERLAY */}
      {timerAttivo && timerSecondi > 0 && (
        <View style={styles.timerOverlay}>
          <View style={styles.timerCard}>
            <Text style={styles.timerLabel}>⏱ Recupero</Text>
            <Text style={styles.timerSecondi}>{timerSecondi}s</Text>
            <View style={styles.timerBar}>
              <View style={[styles.timerBarFill, { width: `${(timerSecondi / (timerSecondi + 1)) * 100}%` }]} />
            </View>
            <TouchableOpacity style={styles.timerStop} onPress={stopTimer}>
              <Text style={styles.timerStopText}>✕ Ferma</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* MODALE ELIMINA ESERCIZIO */}
      {confirmDelete && (
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Elimina Esercizio</Text>
            <Text style={styles.modalText}>
              Vuoi eliminare <Text style={{ color: '#f0f0f0', fontWeight: '700' }}>{confirmDelete.nome}</Text>?
            </Text>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setConfirmDelete(null)}>
                <Text style={styles.modalCancelText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={() => deleteExercise(confirmDelete.id)}>
                <Text style={styles.modalConfirmText}>Elimina</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* MODALE ARCHIVIA */}
      {showConfirmArchivia && (
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>📦 Archivia Scheda</Text>
            <Text style={styles.modalText}>
              Stai archiviando la scheda di <Text style={{ color: '#f0f0f0', fontWeight: '700' }}>{atleta.nome}</Text>.{'\n\n'}
              Nome della nuova scheda (opzionale):
            </Text>
            <TextInput style={styles.nomeInput} value={nomeNuovaScheda}
              onChangeText={setNomeNuovaScheda} placeholder="Es. Scheda Forza 2"
              placeholderTextColor="#6B7280" />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancel}
                onPress={() => { setShowConfirmArchivia(false); setNomeNuovaScheda('') }}>
                <Text style={styles.modalCancelText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalArchiviaBtn, archiviando && { opacity: 0.6 }]}
                onPress={archiviaScheda} disabled={archiviando}>
                <Text style={styles.modalArchiviaBtnText}>
                  {archiviando ? 'Archiviando...' : '📦 Archivia'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* MODALE SOVRASCRITTURA */}
      {confirmSovrascrittura && pendingExerciseData && (
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>⚠️ Dati già esistenti</Text>
            <Text style={styles.modalText}>
              Le seguenti sessioni hanno già valori PT:{'\n\n'}
              {pendingExerciseData.conflicts.map(c =>
                `• Sett. ${c.settimana} · Sess. ${c.sessione}`
              ).join('\n')}{'\n\n'}
              Cosa vuoi fare?
            </Text>
            <View style={styles.modalBtns3}>
              <TouchableOpacity style={styles.modalCancel}
                onPress={() => { setConfirmSovrascrittura(false); setPendingExerciseData(null) }}>
                <Text style={styles.modalCancelText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSkipBtn}
                onPress={async () => {
                  const { exercise, settimaneTarget, sessioniTarget, valoriPT } = pendingExerciseData
                  await eseguiCopiaPT(exercise.id, settimaneTarget, sessioniTarget, valoriPT, exercise.series.length, true)
                  setConfirmSovrascrittura(false); setPendingExerciseData(null); fetchExercises()
                }}>
                <Text style={styles.modalSkipBtnText}>Salta</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalOverwriteBtn}
                onPress={async () => {
                  const { exercise, settimaneTarget, sessioniTarget, valoriPT } = pendingExerciseData
                  await eseguiCopiaPT(exercise.id, settimaneTarget, sessioniTarget, valoriPT, exercise.series.length, false)
                  setConfirmSovrascrittura(false); setPendingExerciseData(null); fetchExercises()
                }}>
                <Text style={styles.modalOverwriteBtnText}>Sovrascrivi</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* CONFIG SCHEDA */}
        {showConfigScheda && (
          <View style={styles.configBox}>
            <Text style={styles.configTitle}>⚙️ Configura scheda di {atleta.nome}</Text>
            <View style={styles.configRow}>
              <View style={styles.configItem}>
                <Text style={styles.configLabel}>Settimane</Text>
                <View style={styles.configControls}>
                  <TouchableOpacity style={styles.configBtn} onPress={() => setConfigSett(Math.max(1, configSett - 1))}>
                    <Text style={styles.configBtnText}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.configVal}>{configSett}</Text>
                  <TouchableOpacity style={styles.configBtn} onPress={() => setConfigSett(Math.min(16, configSett + 1))}>
                    <Text style={styles.configBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.configItem}>
                <Text style={styles.configLabel}>Sessioni/sett.</Text>
                <View style={styles.configControls}>
                  <TouchableOpacity style={styles.configBtn} onPress={() => setConfigSess(Math.max(1, configSess - 1))}>
                    <Text style={styles.configBtnText}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.configVal}>{configSess}</Text>
                  <TouchableOpacity style={styles.configBtn} onPress={() => setConfigSess(Math.min(7, configSess + 1))}>
                    <Text style={styles.configBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
            <View style={styles.configBtns}>
              <TouchableOpacity style={styles.salvaConfigBtn} onPress={salvaConfigScheda}>
                <Text style={styles.salvaConfigBtnText}>✓ Salva</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.archiviaConfigBtn} onPress={() => setShowConfirmArchivia(true)}>
                <Text style={styles.archiviaConfigBtnText}>📦 Archivia</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* SCHEDA ATTIVA */}
        {schedaAttiva && (
          <View style={styles.schedaAttivaBar}>
            <Text style={styles.schedaAttivaBarText}>📋 {schedaAttiva.nome}</Text>
            <Text style={styles.schedaAttivaBarSub}>{numSettimane} sett. · {numSessioni} sess.</Text>
          </View>
        )}

        {/* SETTIMANE */}
        <Text style={styles.sectionLabel}>SETTIMANA</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsRow}>
          {tutteSettimane.map(w => (
            <TouchableOpacity key={w}
              style={[styles.weekPill, settimana === w && styles.weekPillActive]}
              onPress={() => setSettimana(w)}>
              <Text style={[styles.weekPillText, settimana === w && styles.weekPillTextActive]}>Sett. {w}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* SESSIONI */}
        <Text style={styles.sectionLabel}>SESSIONE</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsRow}>
          {tutteSessioni.map(s => {
            const dow = sessionDow[`${settimana}_${s}`]
            const completata = sessioniCompletate[s]
            return (
              <TouchableOpacity key={s}
                style={[
                  styles.sessionPill,
                  sessione === s && styles.sessionPillActive,
                  completata && styles.sessionPillCompleted
                ]}
                onPress={() => setSessione(s)}>
                <Text style={[
                  styles.sessionNum,
                  sessione === s && styles.sessionNumActive,
                  completata && styles.sessionNumCompleted
                ]}>
                  {completata ? '✓' : s}
                </Text>
                {dow && <Text style={[styles.sessionDow, sessione === s && styles.sessionDowActive]}>{dow.slice(0,3)}</Text>}
              </TouchableOpacity>
            )
          })}
        </ScrollView>

        {/* TITOLO */}
        <View style={styles.sessionTitle}>
          <Text style={styles.sessionTitleText}>
            Sett. {settimana} · Sess. {sessione}{currentDow ? ` · ${currentDow}` : ''}
          </Text>
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddEx(!showAddEx)}>
            <Text style={styles.addBtnText}>{showAddEx ? '✕' : '+'}</Text>
          </TouchableOpacity>
        </View>

        {/* FORM AGGIUNTA ESERCIZIO */}
        {showAddEx && (
          <View style={styles.addForm}>
            <TextInput style={styles.addInput} value={nuovoNome} onChangeText={setNuovoNome}
              placeholder="Nome esercizio" placeholderTextColor="#6B7280" autoFocus />
            <View style={styles.addRow}>
              <Text style={styles.addLabel}>Serie:</Text>
              <TextInput style={[styles.addInput, { flex: 1, textAlign: 'center' }]}
                value={nuovoNumSerie} onChangeText={setNuovoNumSerie}
                keyboardType="number-pad" placeholder="3" placeholderTextColor="#6B7280" />
            </View>

            <View style={styles.ptValoriBox}>
              <Text style={styles.ptValoriTitle}>📋 Valori PT da copiare (opzionale)</Text>
              <Text style={styles.ptValoriHint}>Applicati a tutte le serie nelle destinazioni selezionate</Text>
              <View style={styles.ptValoriGrid}>
                <View style={styles.ptValoreItem}>
                  <Text style={styles.ptValoreLabel}>Carico</Text>
                  <TextInput style={styles.ptValoreInput} value={nuovoCarico}
                    onChangeText={setNuovoCarico} placeholder="es. 80kg" placeholderTextColor="#6B7280" />
                </View>
                <View style={styles.ptValoreItem}>
                  <Text style={styles.ptValoreLabel}>Recupero (sec)</Text>
                  <TextInput style={styles.ptValoreInput} value={nuovoRecupero}
                    onChangeText={setNuovoRecupero} placeholder="es. 90"
                    placeholderTextColor="#6B7280" keyboardType="number-pad" />
                </View>
                <View style={styles.ptValoreItem}>
                  <Text style={styles.ptValoreLabel}>Ripetizioni</Text>
                  <TextInput style={styles.ptValoreInput} value={nuovoRip}
                    onChangeText={setNuovoRip} placeholder="es. 8-10" placeholderTextColor="#6B7280" />
                </View>
                <View style={styles.ptValoreItem}>
                  <Text style={styles.ptValoreLabel}>Note</Text>
                  <TextInput style={styles.ptValoreInput} value={nuovoNote}
                    onChangeText={setNuovoNote} placeholder="es. Lento" placeholderTextColor="#6B7280" />
                </View>
              </View>
            </View>

            <Text style={styles.addLabel}>Settimane:</Text>
            <View style={styles.selezioneGrid}>
              {tutteSettimane.map(w => (
                <TouchableOpacity key={w}
                  style={[styles.selezioneChip, settimaneSelezionate.includes(w) && styles.selezioneChipActive]}
                  onPress={() => setSettimaneSelezionate(prev =>
                    prev.includes(w) ? prev.filter(x => x !== w) : [...prev, w])}>
                  <Text style={[styles.selezioneChipText, settimaneSelezionate.includes(w) && styles.selezioneChipTextActive]}>
                    S{w}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.selezioneActions}>
              <TouchableOpacity onPress={() => setSettimaneSelezionate(tutteSettimane)}>
                <Text style={styles.selezioneTutte}>Tutte</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setSettimaneSelezionate([])}>
                <Text style={styles.selezioneNessuna}>Nessuna</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.addLabel}>Sessioni:</Text>
            <View style={styles.selezioneGrid}>
              {tutteSessioni.map(s => (
                <TouchableOpacity key={s}
                  style={[styles.selezioneChip, sessioniSelezionate.includes(s) && styles.selezioneChipActive]}
                  onPress={() => setSessioniSelezionate(prev =>
                    prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])}>
                  <Text style={[styles.selezioneChipText, sessioniSelezionate.includes(s) && styles.selezioneChipTextActive]}>
                    {s}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.selezioneActions}>
              <TouchableOpacity onPress={() => setSessioniSelezionate(tutteSessioni)}>
                <Text style={styles.selezioneTutte}>Tutte</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setSessioniSelezionate([sessione])}>
                <Text style={styles.selezioneNessuna}>Solo corrente</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.addFormBtns}>
              <TouchableOpacity style={styles.addFormCancel} onPress={resetForm}>
                <Text style={styles.addFormCancelText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addFormConfirm} onPress={addExercise}>
                <Text style={styles.addFormConfirmText}>Aggiungi</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ESERCIZI */}
        {exercises.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyTitle}>Nessun esercizio</Text>
            <Text style={styles.emptyText}>Aggiungi esercizi per questa sessione</Text>
          </View>
        ) : (
          exercises.map((ex, idx) => (
            <ExercisePTCard
              key={ex.id}
              exercise={ex}
              index={idx}
              total={exercises.length}
              onUpdatePT={updatePT}
              onAddSerie={async () => {
                const nextNum = ex.series.length + 1
                await supabase.from('series').insert({
                  exercise_id: ex.id, settimana, sessione, numero: nextNum
                })
                fetchExercises()
              }}
              onDeleteSerie={async (serieId) => {
                await supabase.from('series').delete().eq('id', serieId)
                fetchExercises()
              }}
              onDelete={() => setConfirmDelete(ex)}
              onSposta={spostaEsercizio}
              completato={!!completamenti[ex.id]}
              onAvviaTimer={avviaTimer}
              onCopiaPT={(settimaneT, sessioniT) => copiaPTsuEsercizio(ex, settimaneT, sessioniT)}
              tutteSettimane={tutteSettimane}
              tutteSessioni={tutteSessioni}
              sessioneCorrente={sessione}
            />
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  )
}

// ── EXERCISE CARD PT ───────────────────────────
function ExercisePTCard({ exercise, index, total, onUpdatePT, onAddSerie, onDeleteSerie, onDelete, onSposta, completato, onAvviaTimer, onCopiaPT, tutteSettimane, tutteSessioni, sessioneCorrente }) {
  const [open, setOpen] = useState(true)
  const [showCopia, setShowCopia] = useState(false)
  const [copiaSettimane, setCopiaSettimane] = useState(tutteSettimane)
  const [copiaSessioni, setCopiaSessioni] = useState(tutteSessioni)

  return (
    <View style={[cardStyles.card, completato && cardStyles.cardCompleted]}>
      <View style={cardStyles.header}>
        <View style={cardStyles.frecce}>
          <TouchableOpacity
            style={[cardStyles.freccia, index === 0 && cardStyles.frecciaDisabled]}
            onPress={() => onSposta(exercise.id, 'su')} disabled={index === 0}>
            <Text style={cardStyles.frecciaText}>▲</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[cardStyles.freccia, index === total - 1 && cardStyles.frecciaDisabled]}
            onPress={() => onSposta(exercise.id, 'giu')} disabled={index === total - 1}>
            <Text style={cardStyles.frecciaText}>▼</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={{ flex: 1 }} onPress={() => setOpen(!open)}>
          <Text style={cardStyles.name}>{exercise.nome}</Text>
        </TouchableOpacity>
        <View style={cardStyles.meta}>
          <View style={cardStyles.badge}>
            <Text style={cardStyles.badgeText}>{exercise.series.length} serie</Text>
          </View>
          <TouchableOpacity style={cardStyles.deleteBtn} onPress={onDelete}>
            <Text style={cardStyles.deleteBtnText}>🗑</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setOpen(!open)}>
            <Text style={cardStyles.chevron}>{open ? '▲' : '▼'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {open && (
        <View style={cardStyles.body}>
          <Text style={cardStyles.sectionTitlePT}>📋 Prescrizione PT</Text>
          <View style={cardStyles.tableHeader}>
            <Text style={[cardStyles.th, { width: 30 }]}>#</Text>
            <Text style={cardStyles.th}>Carico</Text>
            <Text style={cardStyles.th}>Rec.</Text>
            <Text style={cardStyles.th}>Rip.</Text>
            <Text style={[cardStyles.th, { flex: 1.5 }]}>Note</Text>
            <Text style={[cardStyles.th, { width: 28 }]}></Text>
          </View>
          {exercise.series.map((s, i) => (
            <SeriePTRow key={s.id} serie={s} index={i}
              onUpdate={onUpdatePT} onDelete={() => onDeleteSerie(s.id)}
              onAvviaTimer={onAvviaTimer} />
          ))}
          <TouchableOpacity style={cardStyles.addSerieBtn} onPress={onAddSerie}>
            <Text style={cardStyles.addSerieBtnText}>+ Aggiungi serie</Text>
          </TouchableOpacity>

          <TouchableOpacity style={cardStyles.copiaBtn} onPress={() => setShowCopia(!showCopia)}>
            <Text style={cardStyles.copiaBtnText}>
              {showCopia ? '✕ Chiudi' : '📋 Copia valori PT su altre sessioni'}
            </Text>
          </TouchableOpacity>

          {showCopia && (
            <View style={cardStyles.copiaForm}>
              <Text style={cardStyles.copiaFormTitle}>Scegli destinazioni:</Text>
              <Text style={cardStyles.copiaFormLabel}>Settimane:</Text>
              <View style={cardStyles.selezioneGrid}>
                {tutteSettimane.map(w => (
                  <TouchableOpacity key={w}
                    style={[cardStyles.selezioneChip, copiaSettimane.includes(w) && cardStyles.selezioneChipActive]}
                    onPress={() => setCopiaSettimane(prev =>
                      prev.includes(w) ? prev.filter(x => x !== w) : [...prev, w])}>
                    <Text style={[cardStyles.selezioneChipText, copiaSettimane.includes(w) && cardStyles.selezioneChipTextActive]}>
                      S{w}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={cardStyles.selezioneActions}>
                <TouchableOpacity onPress={() => setCopiaSettimane(tutteSettimane)}>
                  <Text style={cardStyles.selezioneTutte}>Tutte</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setCopiaSettimane([])}>
                  <Text style={cardStyles.selezioneNessuna}>Nessuna</Text>
                </TouchableOpacity>
              </View>
              <Text style={cardStyles.copiaFormLabel}>Sessioni:</Text>
              <View style={cardStyles.selezioneGrid}>
                {tutteSessioni.map(s => (
                  <TouchableOpacity key={s}
                    style={[cardStyles.selezioneChip, copiaSessioni.includes(s) && cardStyles.selezioneChipActive]}
                    onPress={() => setCopiaSessioni(prev =>
                      prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])}>
                    <Text style={[cardStyles.selezioneChipText, copiaSessioni.includes(s) && cardStyles.selezioneChipTextActive]}>
                      {s}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={cardStyles.selezioneActions}>
                <TouchableOpacity onPress={() => setCopiaSessioni(tutteSessioni)}>
                  <Text style={cardStyles.selezioneTutte}>Tutte</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setCopiaSessioni([sessioneCorrente])}>
                  <Text style={cardStyles.selezioneNessuna}>Solo corrente</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={cardStyles.copiaConfirmBtn}
                onPress={() => { onCopiaPT(copiaSettimane, copiaSessioni); setShowCopia(false) }}>
                <Text style={cardStyles.copiaConfirmBtnText}>📋 Copia valori PT</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={[cardStyles.sectionTitle, { marginTop: 16 }]}>✅ Eseguito Atleta</Text>
          <View style={cardStyles.tableHeader}>
            <Text style={[cardStyles.th, { width: 30 }]}>#</Text>
            <Text style={cardStyles.th}>Carico</Text>
            <Text style={cardStyles.th}>Rec.</Text>
            <Text style={cardStyles.th}>Rip.</Text>
            <Text style={[cardStyles.th, { flex: 1.5 }]}>Note</Text>
          </View>
          {exercise.series.map((s, i) => (
            <View key={s.id} style={cardStyles.tableRow}>
              <Text style={[cardStyles.td, { width: 30, color: '#9CA3AF' }]}>{i + 1}</Text>
              <Text style={cardStyles.tdDone}>{s.series_atleta?.carico || '–'}</Text>
              <Text style={cardStyles.tdDone}>{s.series_atleta?.recupero || '–'}</Text>
              <Text style={cardStyles.tdDone}>{s.series_atleta?.ripetizioni || '–'}</Text>
              <Text style={[cardStyles.tdDone, { flex: 1.5 }]}>{s.series_atleta?.note || '–'}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

// ── SERIE ROW PT ───────────────────────────────
function SeriePTRow({ serie, index, onUpdate, onDelete, onAvviaTimer }) {
  const [carico, setCarico] = useState(serie.series_pt?.carico || '')
  const [recupero, setRecupero] = useState(serie.series_pt?.recupero || '')
  const [rip, setRip] = useState(serie.series_pt?.ripetizioni || '')
  const [note, setNote] = useState(serie.series_pt?.note || '')

  function handleBlur(field, value) { onUpdate(serie.id, field, value) }

  return (
    <View style={cardStyles.tableRow}>
      <Text style={[cardStyles.td, { width: 30, color: '#9CA3AF' }]}>{index + 1}</Text>
      <View style={cardStyles.inputWrap}>
        <TextInput style={cardStyles.inputPT} value={carico} onChangeText={setCarico}
          onBlur={() => handleBlur('carico', carico)} placeholder="–" placeholderTextColor="#6B7280" />
      </View>
      <View style={[cardStyles.inputWrap, { flexDirection: 'column', gap: 4 }]}>
        <TextInput style={cardStyles.inputPT} value={recupero} onChangeText={setRecupero}
          onBlur={() => handleBlur('recupero', recupero)} placeholder="sec"
          placeholderTextColor="#6B7280" keyboardType="number-pad" />
        {recupero ? (
          <TouchableOpacity style={cardStyles.timerBtn} onPress={() => onAvviaTimer(recupero)} activeOpacity={0.7}>
            <Text style={cardStyles.timerBtnText}>▶ {recupero}s</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={cardStyles.inputWrap}>
        <TextInput style={cardStyles.inputPT} value={rip} onChangeText={setRip}
          onBlur={() => handleBlur('ripetizioni', rip)} placeholder="–" placeholderTextColor="#6B7280" />
      </View>
      <View style={[cardStyles.inputWrap, { flex: 1.5 }]}>
        <TextInput style={cardStyles.inputPT} value={note} onChangeText={setNote}
          onBlur={() => handleBlur('note', note)} placeholder="–" placeholderTextColor="#6B7280" />
      </View>
      <TouchableOpacity style={cardStyles.deleteSerie} onPress={onDelete}>
        <Text style={cardStyles.deleteSerieText}>✕</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0f' },
  loading: { flex: 1, backgroundColor: '#0d0d0f', justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#9CA3AF', fontSize: 16 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#1e1e24'
  },
  logo: { fontSize: 22, fontWeight: '900', color: '#e8ff47', letterSpacing: 3 },
  welcome: { fontSize: 13, color: '#9CA3AF', marginTop: 2 },
  logoutBtn: { backgroundColor: '#1e1e24', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  logoutText: { color: '#9CA3AF', fontSize: 13, fontWeight: '600' },
  iconBtn: { backgroundColor: '#1e1e24', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  iconBtnText: { fontSize: 15 },
  backBtn: { backgroundColor: '#1e1e24', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  backText: { color: '#9CA3AF', fontSize: 13, fontWeight: '600' },
  atletaHeaderNome: { fontSize: 14, fontWeight: '800', color: '#f0f0f0', flex: 1, textAlign: 'center', marginHorizontal: 8 },
  scroll: { flex: 1 },
  codiceBox: {
    margin: 20, backgroundColor: '#1e1e24', borderWidth: 1,
    borderColor: '#e8ff4744', borderRadius: 16, padding: 20, alignItems: 'center'
  },
  codiceLabel: { fontSize: 11, fontWeight: '700', color: '#9CA3AF', letterSpacing: 1, marginBottom: 8 },
  codice: { fontSize: 36, fontWeight: '900', color: '#e8ff47', letterSpacing: 4, marginBottom: 8 },
  codiceHint: { fontSize: 12, color: '#6B7280', textAlign: 'center' },
  section: { paddingHorizontal: 20, marginBottom: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#f0f0f0' },
  toggleCreaBtn: {
    backgroundColor: '#e8ff4722', borderWidth: 1, borderColor: '#e8ff4744',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6
  },
  toggleCreaBtnText: { color: '#e8ff47', fontWeight: '700', fontSize: 13 },
  creaForm: {
    backgroundColor: '#1e1e24', borderWidth: 1, borderColor: '#2e2e3a',
    borderRadius: 14, padding: 16, gap: 12
  },
  creaFormDesc: { fontSize: 13, color: '#9CA3AF', lineHeight: 20 },
  creaLabel: { fontSize: 12, fontWeight: '700', color: '#D1D5DB', textTransform: 'uppercase', letterSpacing: 0.5 },
  creaInput: {
    backgroundColor: '#26262e', borderWidth: 1, borderColor: '#2e2e3a',
    borderRadius: 10, padding: 14, color: '#f0f0f0', fontSize: 15
  },
  usernameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  usernameAt: { fontSize: 20, fontWeight: '900', color: '#e8ff47' },
  msgBox: { borderRadius: 10, padding: 12, borderWidth: 1 },
  msgOk: { backgroundColor: '#52e89e22', borderColor: '#52e89e44' },
  msgErrore: { backgroundColor: '#ff3b3b22', borderColor: '#ff3b3b44' },
  msgText: { fontSize: 13, fontWeight: '600' },
  msgTextOk: { color: '#52e89e' },
  msgTextErrore: { color: '#ff6b6b' },
  creaBtn: { backgroundColor: '#e8ff47', borderRadius: 12, padding: 14, alignItems: 'center' },
  creaBtnDisabled: { opacity: 0.6 },
  creaBtnText: { color: '#000', fontWeight: '800', fontSize: 15 }, 
  refreshBtn: {
    backgroundColor: '#1e1e24', borderWidth: 1, borderColor: '#2e2e3a',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6
  },
  refreshBtnText: { color: '#9CA3AF', fontWeight: '700', fontSize: 13 },
  richiestaCard: {
    backgroundColor: '#1e1e24', borderWidth: 1, borderColor: '#2e2e3a',
    borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 10
  },
  richiestaInfo: { flex: 1 },
  richiestaName: { fontSize: 15, fontWeight: '700', color: '#f0f0f0' },
  richiestaEmail: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  richiestaActions: { flexDirection: 'row', gap: 8 },
  btnRifiuta: {
    backgroundColor: '#ff3b3b22', borderWidth: 1, borderColor: '#ff3b3b44',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8
  },
  btnRifiutaText: { color: '#ff6b6b', fontWeight: '700' },
  btnAccetta: { backgroundColor: '#e8ff47', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  btnAccettaText: { color: '#000', fontWeight: '800', fontSize: 13 },
  atletaCard: {
    backgroundColor: '#1e1e24', borderWidth: 1, borderColor: '#2e2e3a',
    borderRadius: 12, marginBottom: 10, flexDirection: 'row', alignItems: 'center', overflow: 'hidden'
  },
  atletaCardMain: { flex: 1, flexDirection: 'row', alignItems: 'center', padding: 14 },
  atletaAvatar: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#e8ff4722',
    justifyContent: 'center', alignItems: 'center', marginRight: 14
  },
  atletaAvatarText: { fontSize: 18, fontWeight: '900', color: '#e8ff47' },
  atletaInfo: { flex: 1 },
  atletaNome: { fontSize: 15, fontWeight: '700', color: '#f0f0f0' },
  atletaEmail: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  atletaMeta: { fontSize: 11, color: '#6B7280', marginTop: 3 },
  usernameTag: {
    backgroundColor: '#f59e0b22', borderRadius: 4,
    paddingHorizontal: 6, paddingVertical: 2
  },
  usernameTagText: { fontSize: 10 },
  deleteAtletaBtn: {
    borderLeftWidth: 1, borderLeftColor: '#2e2e3a',
    paddingHorizontal: 12, paddingVertical: 16,
    justifyContent: 'center', backgroundColor: '#ff3b3b11'
  },
  deleteAtletaBtnText: { fontSize: 16 },
  iconActionBtn: {
    borderLeftWidth: 1, borderLeftColor: '#2e2e3a',
    paddingHorizontal: 12, paddingVertical: 16, justifyContent: 'center'
  },
  iconActionText: { fontSize: 16 },
  schedaBtn: {
    backgroundColor: '#e8ff4722', borderLeftWidth: 1, borderLeftColor: '#2e2e3a',
    paddingHorizontal: 12, paddingVertical: 16, justifyContent: 'center'
  },
  schedaBtnText: { color: '#e8ff47', fontSize: 12, fontWeight: '800' },
  empty: { alignItems: 'center', paddingVertical: 48 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#f0f0f0', marginBottom: 6 },
  emptyText: { fontSize: 13, color: '#6B7280', textAlign: 'center' },
  configBox: {
    margin: 16, backgroundColor: '#1e1e24', borderWidth: 1,
    borderColor: '#e8ff4744', borderRadius: 14, padding: 16, gap: 12
  },
  configTitle: { fontSize: 14, fontWeight: '800', color: '#e8ff47' },
  configRow: { flexDirection: 'row', gap: 12 },
  configItem: {
    flex: 1, backgroundColor: '#26262e', borderWidth: 1, borderColor: '#2e2e3a',
    borderRadius: 10, padding: 12, alignItems: 'center', gap: 8
  },
  configLabel: { fontSize: 11, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 },
  configControls: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  configBtn: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: '#1e1e24',
    borderWidth: 1, borderColor: '#2e2e3a', justifyContent: 'center', alignItems: 'center'
  },
  configBtnText: { fontSize: 16, color: '#e8ff47', fontWeight: '700' },
  configVal: { fontSize: 24, fontWeight: '900', color: '#e8ff47', minWidth: 32, textAlign: 'center' },
  configBtns: { flexDirection: 'row', gap: 10 },
  salvaConfigBtn: {
    flex: 1, backgroundColor: '#e8ff47', borderRadius: 10, padding: 12, alignItems: 'center'
  },
  salvaConfigBtnText: { color: '#000', fontWeight: '800', fontSize: 13 },
  archiviaConfigBtn: {
    flex: 1, backgroundColor: '#f59e0b22', borderWidth: 1, borderColor: '#f59e0b44',
    borderRadius: 10, padding: 12, alignItems: 'center'
  },
  archiviaConfigBtnText: { color: '#f59e0b', fontWeight: '700', fontSize: 13 },
  schedaAttivaBar: {
    marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    backgroundColor: '#1e1e24', borderWidth: 1, borderColor: '#e8ff4733',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'
  },
  schedaAttivaBarText: { fontSize: 13, fontWeight: '700', color: '#e8ff47' },
  schedaAttivaBarSub: { fontSize: 11, color: '#6B7280' },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: '#6B7280',
    letterSpacing: 1, paddingHorizontal: 20, marginTop: 20, marginBottom: 8
  },
  pillsRow: { paddingHorizontal: 16, marginBottom: 4 },
  weekPill: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#1e1e24', borderWidth: 1, borderColor: '#2e2e3a', marginRight: 8
  },
  weekPillActive: { backgroundColor: '#e8ff47', borderColor: '#e8ff47' },
  weekPillText: { fontSize: 13, fontWeight: '600', color: '#9CA3AF' },
  weekPillTextActive: { color: '#000' },
  sessionPill: {
    width: 56, alignItems: 'center', paddingVertical: 10, borderRadius: 12,
    backgroundColor: '#1e1e24', borderWidth: 1, borderColor: '#2e2e3a', marginRight: 8
  },
  sessionPillActive: { backgroundColor: '#e8ff47', borderColor: '#e8ff47' },
  sessionPillCompleted: { backgroundColor: '#52e89e22', borderColor: '#52e89e' },
  sessionNum: { fontSize: 18, fontWeight: '900', color: '#9CA3AF' },
  sessionNumActive: { color: '#000' },
  sessionNumCompleted: { color: '#52e89e' },
  sessionDow: { fontSize: 9, fontWeight: '600', color: '#52e89e', marginTop: 2 },
  sessionDowActive: { color: '#000' },
  sessionTitle: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, marginTop: 20, marginBottom: 12, gap: 8
  },
  sessionTitleText: { fontSize: 15, fontWeight: '800', color: '#f0f0f0', flex: 1 },
  addBtn: { backgroundColor: '#e8ff47', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  addBtnText: { color: '#000', fontWeight: '900', fontSize: 18 },
  addForm: {
    backgroundColor: '#1e1e24', borderWidth: 1, borderColor: '#2e2e3a',
    borderRadius: 14, marginHorizontal: 16, marginBottom: 12, padding: 16, gap: 12
  },
  addInput: {
    backgroundColor: '#26262e', borderWidth: 1, borderColor: '#2e2e3a',
    borderRadius: 10, padding: 14, color: '#f0f0f0', fontSize: 15
  },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  addLabel: {
    fontSize: 12, color: '#9CA3AF', fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4
  },
  ptValoriBox: {
    backgroundColor: '#1a2a3a', borderWidth: 1, borderColor: '#2a4a6a',
    borderRadius: 12, padding: 14, gap: 10
  },
  ptValoriTitle: { fontSize: 12, fontWeight: '800', color: '#7eb8ff', marginBottom: 2 },
  ptValoriHint: { fontSize: 11, color: '#6B7280', lineHeight: 16 },
  ptValoriGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  ptValoreItem: { width: '47%' },
  ptValoreLabel: { fontSize: 11, color: '#7eb8ff', fontWeight: '600', marginBottom: 4 },
  ptValoreInput: {
    backgroundColor: '#26262e', borderWidth: 1, borderColor: '#2a4a6a',
    borderRadius: 8, padding: 10, color: '#7eb8ff', fontSize: 13
  },
  selezioneGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  selezioneChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
    backgroundColor: '#26262e', borderWidth: 1, borderColor: '#2e2e3a'
  },
  selezioneChipActive: { backgroundColor: '#e8ff4722', borderColor: '#e8ff47' },
  selezioneChipText: { fontSize: 12, fontWeight: '700', color: '#6B7280' },
  selezioneChipTextActive: { color: '#e8ff47' },
  selezioneActions: { flexDirection: 'row', gap: 16, marginTop: 4 },
  selezioneTutte: { fontSize: 12, color: '#52e89e', fontWeight: '600' },
  selezioneNessuna: { fontSize: 12, color: '#ff6b6b', fontWeight: '600' },
  addFormBtns: { flexDirection: 'row', gap: 10 },
  addFormCancel: {
    flex: 1, backgroundColor: '#26262e', borderRadius: 10, padding: 12, alignItems: 'center'
  },
  addFormCancelText: { color: '#9CA3AF', fontWeight: '700' },
  addFormConfirm: {
    flex: 1, backgroundColor: '#e8ff47', borderRadius: 10, padding: 12, alignItems: 'center'
  },
  addFormConfirmText: { color: '#000', fontWeight: '800' },
  modalOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center',
    alignItems: 'center', zIndex: 999, paddingHorizontal: 32
  },
  modal: {
    backgroundColor: '#1e1e24', borderWidth: 1, borderColor: '#2e2e3a',
    borderRadius: 16, padding: 24, width: '100%'
  },
  modalTitle: { fontSize: 18, fontWeight: '900', color: '#ff6b6b', marginBottom: 12 },
  modalText: { fontSize: 14, color: '#9CA3AF', lineHeight: 22, marginBottom: 16 },
  nomeInput: {
    backgroundColor: '#26262e', borderWidth: 1, borderColor: '#2e2e3a',
    borderRadius: 10, padding: 14, color: '#f0f0f0', fontSize: 15, marginBottom: 16
  },
  modalBtns: { flexDirection: 'row', gap: 12 },
  modalBtns3: { flexDirection: 'row', gap: 8 },
  modalCancel: {
    flex: 1, backgroundColor: '#26262e', borderRadius: 10, padding: 12, alignItems: 'center'
  },
  modalCancelText: { color: '#9CA3AF', fontWeight: '700', fontSize: 13 },
  modalConfirm: {
    flex: 1, backgroundColor: '#ff3b3b22', borderWidth: 1,
    borderColor: '#ff3b3b44', borderRadius: 10, padding: 12, alignItems: 'center'
  },
  modalConfirmText: { color: '#ff6b6b', fontWeight: '800', fontSize: 13 },
  modalSkipBtn: {
    flex: 1, backgroundColor: '#f59e0b22', borderWidth: 1,
    borderColor: '#f59e0b44', borderRadius: 10, padding: 12, alignItems: 'center'
  },
  modalSkipBtnText: { color: '#f59e0b', fontWeight: '700', fontSize: 12 },
  modalOverwriteBtn: {
    flex: 1, backgroundColor: '#e8ff4722', borderWidth: 1,
    borderColor: '#e8ff4744', borderRadius: 10, padding: 12, alignItems: 'center'
  },
  modalOverwriteBtnText: { color: '#e8ff47', fontWeight: '700', fontSize: 12 },
  modalArchiviaBtn: {
    flex: 1, backgroundColor: '#f59e0b22', borderWidth: 1,
    borderColor: '#f59e0b44', borderRadius: 10, padding: 14, alignItems: 'center'
  },
  modalArchiviaBtnText: { color: '#f59e0b', fontWeight: '800', fontSize: 15 },
  timerOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center',
    alignItems: 'center', zIndex: 1000, paddingHorizontal: 32
  },
  timerCard: {
    backgroundColor: '#1e1e24', borderWidth: 2, borderColor: '#52e89e',
    borderRadius: 20, padding: 32, width: '100%', alignItems: 'center', gap: 16
  },
  timerLabel: { fontSize: 14, fontWeight: '700', color: '#9CA3AF', letterSpacing: 1 },
  timerSecondi: { fontSize: 72, fontWeight: '900', color: '#52e89e', lineHeight: 80 },
  timerBar: { width: '100%', height: 6, backgroundColor: '#2e2e3a', borderRadius: 3, overflow: 'hidden' },
  timerBarFill: { height: '100%', backgroundColor: '#52e89e', borderRadius: 3 },
  timerStop: {
    backgroundColor: '#ff3b3b22', borderWidth: 1, borderColor: '#ff3b3b44',
    borderRadius: 10, paddingHorizontal: 24, paddingVertical: 10
  },
  timerStopText: { color: '#ff6b6b', fontWeight: '700', fontSize: 14 },
})

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: '#16161a', borderWidth: 1, borderColor: '#2e2e3a',
    borderRadius: 14, marginHorizontal: 16, marginBottom: 12, overflow: 'hidden'
  },
  cardCompleted: { borderColor: '#52e89e44', backgroundColor: '#16201a' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12, backgroundColor: '#1e1e24', gap: 8
  },
  frecce: { flexDirection: 'column', gap: 2 },
  freccia: {
    width: 22, height: 22, borderRadius: 4, backgroundColor: '#26262e',
    justifyContent: 'center', alignItems: 'center'
  },
  frecciaDisabled: { opacity: 0.2 },
  frecciaText: { fontSize: 10, color: '#9CA3AF' },
  name: { fontSize: 14, fontWeight: '700', color: '#f0f0f0' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { backgroundColor: '#7eb8ff22', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#7eb8ff' },
  deleteBtn: { padding: 4 },
  deleteBtnText: { fontSize: 14 },
  chevron: { color: '#6B7280', fontSize: 12, padding: 4 },
  body: { padding: 16 },
  sectionTitlePT: { fontSize: 11, fontWeight: '700', color: '#7eb8ff', letterSpacing: 1, marginBottom: 10 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: '#52e89e', letterSpacing: 1, marginBottom: 10 },
  tableHeader: { flexDirection: 'row', marginBottom: 6, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: '#2e2e3a' },
  th: { flex: 1, fontSize: 10, fontWeight: '700', color: '#6B7280', textAlign: 'center' },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#1e1e2422' },
  td: { flex: 1, fontSize: 13, color: '#f0f0f0', textAlign: 'center' },
  tdDone: { flex: 1, fontSize: 13, color: '#52e89e', textAlign: 'center' },
  inputWrap: { flex: 1, paddingHorizontal: 2 },
  inputPT: {
    backgroundColor: '#1a2a3a', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 5,
    fontSize: 12, color: '#7eb8ff', textAlign: 'center', borderWidth: 1, borderColor: '#2a4a6a'
  },
  deleteSerie: { width: 28, alignItems: 'center' },
  deleteSerieText: { color: '#ff6b6b', fontSize: 14, fontWeight: '700' },
  addSerieBtn: {
    marginTop: 8, padding: 10, borderRadius: 8,
    borderWidth: 1, borderColor: '#2e2e3a', borderStyle: 'dashed', alignItems: 'center'
  },
  addSerieBtnText: { color: '#9CA3AF', fontSize: 13, fontWeight: '600' },
  timerBtn: {
    backgroundColor: '#52e89e', borderRadius: 6,
    paddingVertical: 5, paddingHorizontal: 6,
    alignItems: 'center', justifyContent: 'center', marginTop: 2
  },
  timerBtnText: { color: '#000', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  copiaBtn: {
    marginTop: 10, padding: 10, borderRadius: 8,
    borderWidth: 1, borderColor: '#7eb8ff44', backgroundColor: '#7eb8ff11', alignItems: 'center'
  },
  copiaBtnText: { color: '#7eb8ff', fontSize: 12, fontWeight: '700' },
  copiaForm: {
    marginTop: 8, backgroundColor: '#1a2a3a', borderWidth: 1,
    borderColor: '#2a4a6a', borderRadius: 12, padding: 14, gap: 10
  },
  copiaFormTitle: { fontSize: 13, fontWeight: '800', color: '#7eb8ff', marginBottom: 4 },
  copiaFormLabel: {
    fontSize: 11, color: '#7eb8ff', fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4
  },
  selezioneGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  selezioneChip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
    backgroundColor: '#26262e', borderWidth: 1, borderColor: '#2e2e3a'
  },
  selezioneChipActive: { backgroundColor: '#7eb8ff22', borderColor: '#7eb8ff' },
  selezioneChipText: { fontSize: 11, fontWeight: '700', color: '#6B7280' },
  selezioneChipTextActive: { color: '#7eb8ff' },
  selezioneActions: { flexDirection: 'row', gap: 16, marginTop: 2 },
  selezioneTutte: { fontSize: 11, color: '#52e89e', fontWeight: '600' },
  selezioneNessuna: { fontSize: 11, color: '#ff6b6b', fontWeight: '600' },
  copiaConfirmBtn: {
    backgroundColor: '#7eb8ff', borderRadius: 10,
    padding: 12, alignItems: 'center', marginTop: 4
  },
  copiaConfirmBtnText: { color: '#000', fontWeight: '800', fontSize: 13 },
}) 