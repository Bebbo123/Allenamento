import { useState, useEffect } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, TextInput
} from 'react-native'
import { supabase } from '../lib/supabase'
import ImpostazioniScreen from './ImpostazioniScreen'
import ProgressiScreen from './ProgressiScreen'

const GIORNI = ['–','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato','Domenica']

export default function HomeAtletaScreen() {
  const [profile, setProfile] = useState(null)
  const [settimana, setSettimana] = useState(1)
  const [sessione, setSessione] = useState(1)
  const [sessionDow, setSessionDow] = useState({})
  const [exercises, setExercises] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddEx, setShowAddEx] = useState(false)
  const [nuovoNome, setNuovoNome] = useState('')
  const [nuovoNumSerie, setNuovoNumSerie] = useState('3')
  const [propagaSettimane, setPropagaSettimane] = useState(true)
  const [mostraImpostazioni, setMostraImpostazioni] = useState(false)
  const [mostraProgressi, setMostraProgressi] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)

  useEffect(() => { fetchProfile() }, [])
  useEffect(() => { if (profile) { fetchExercises(); fetchSessionDow() } }, [profile, settimana, sessione])

  async function fetchProfile() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setProfile(data)
  }

  async function fetchSessionDow() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase.from('session_dow').select('*').eq('atleta_id', user.id)
    if (data) {
      const map = {}
      data.forEach(d => { map[`${d.settimana}_${d.sessione}`] = d.giorno })
      setSessionDow(map)
    }
  }

  async function fetchExercises() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: seriesData } = await supabase.from('series')
      .select(`*, exercises!inner(*), series_pt(*), series_atleta(*)`)
      .eq('exercises.atleta_id', user.id)
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
    setExercises(Object.values(exMap))
    setLoading(false)
  }

  async function setGiornoSessione(giorno) {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('session_dow').upsert({
      atleta_id: user.id, settimana, sessione,
      giorno: giorno === '–' ? null : giorno
    }, { onConflict: 'atleta_id,settimana,sessione' })
    fetchSessionDow()
  }

  async function addExercise() {
    if (!nuovoNome.trim()) return
    const { data: { user } } = await supabase.auth.getUser()
    const numSerie = parseInt(nuovoNumSerie) || 3

    const { data: ex } = await supabase.from('exercises').insert({
      atleta_id: user.id, nome: nuovoNome.trim(), creato_da: 'atleta'
    }).select().single()

    const settimane = propagaSettimane ? [1,2,3,4,5,6,7,8] : [settimana]
    for (const w of settimane) {
      for (let i = 1; i <= numSerie; i++) {
        await supabase.from('series').insert({
          exercise_id: ex.id, settimana: w, sessione, numero: i
        })
      }
    }
    setNuovoNome('')
    setNuovoNumSerie('3')
    setPropagaSettimane(true)
    setShowAddEx(false)
    fetchExercises()
  }

  async function deleteExercise(exerciseId) {
    await supabase.from('series').delete().eq('exercise_id', exerciseId)
    await supabase.from('exercises').delete().eq('id', exerciseId)
    setConfirmDelete(null)
    fetchExercises()
  }

  async function updateAtleta(serieId, field, value) {
    await supabase.from('series_atleta').upsert({
      serie_id: serieId, [field]: value
    }, { onConflict: 'serie_id' })
  }

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  const currentDow = sessionDow[`${settimana}_${sessione}`]

  if (loading) return (
    <View style={styles.loading}>
      <Text style={styles.loadingText}>Caricamento...</Text>
    </View>
  )

  if (mostraImpostazioni) {
    return (
      <ImpostazioniScreen onBack={() => {
        setMostraImpostazioni(false)
        fetchExercises()
      }} />
    )
  }

  if (mostraProgressi) {
    return (
      <ProgressiScreen onBack={() => setMostraProgressi(false)} />
    )
  }

  return (
    <SafeAreaView style={styles.container}>

      {/* HEADER */}
      <View style={styles.header}>
        <View>
          <Text style={styles.logo}>TRAINER</Text>
          <Text style={styles.welcome}>Ciao, {profile?.nome?.split(' ')[0]} 👋</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity onPress={() => setMostraProgressi(true)} style={styles.logoutBtn}>
            <Text style={styles.logoutText}>📈</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setMostraImpostazioni(true)} style={styles.logoutBtn}>
            <Text style={styles.logoutText}>⚙️</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
            <Text style={styles.logoutText}>Esci</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* MODALE CONFERMA ELIMINA */}
      {confirmDelete && (
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Elimina Esercizio</Text>
            <Text style={styles.modalText}>
              Vuoi eliminare <Text style={{ color: '#f0f0f0', fontWeight: '700' }}>{confirmDelete.nome}</Text>?{'\n'}
              Verranno eliminate tutte le serie e i dati associati su tutte le settimane.
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

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* SETTIMANE */}
        <Text style={styles.sectionLabel}>SETTIMANA</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsRow}>
          {[1,2,3,4,5,6,7,8].map(w => (
            <TouchableOpacity
              key={w}
              style={[styles.weekPill, settimana === w && styles.weekPillActive]}
              onPress={() => setSettimana(w)}
            >
              <Text style={[styles.weekPillText, settimana === w && styles.weekPillTextActive]}>
                Sett. {w}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* SESSIONI */}
        <Text style={styles.sectionLabel}>SESSIONE</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsRow}>
          {[1,2,3,4,5,6,7].map(s => {
            const dow = sessionDow[`${settimana}_${s}`]
            return (
              <TouchableOpacity
                key={s}
                style={[styles.sessionPill, sessione === s && styles.sessionPillActive]}
                onPress={() => setSessione(s)}
              >
                <Text style={[styles.sessionNum, sessione === s && styles.sessionNumActive]}>{s}</Text>
                {dow && <Text style={[styles.sessionDow, sessione === s && styles.sessionDowActive]}>{dow.slice(0,3)}</Text>}
              </TouchableOpacity>
            )
          })}
        </ScrollView>

        {/* GIORNO DELLA SETTIMANA */}
        <View style={styles.dowRow}>
          <Text style={styles.dowLabel}>📅</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {GIORNI.map(g => (
              <TouchableOpacity
                key={g}
                style={[styles.dowPill, (currentDow === g || (!currentDow && g === '–')) && styles.dowPillActive]}
                onPress={() => setGiornoSessione(g)}
              >
                <Text style={[styles.dowPillText, (currentDow === g || (!currentDow && g === '–')) && styles.dowPillTextActive]}>
                  {g}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* TITOLO SESSIONE */}
        <View style={styles.sessionTitle}>
          <Text style={styles.sessionTitleText}>
            Sett. {settimana} · Sess. {sessione}{currentDow ? ` · ${currentDow}` : ''}
          </Text>
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddEx(!showAddEx)}>
            <Text style={styles.addBtnText}>{showAddEx ? '✕ Chiudi' : '+ Esercizio'}</Text>
          </TouchableOpacity>
        </View>

        {/* FORM AGGIUNTA ESERCIZIO */}
        {showAddEx && (
          <View style={styles.addForm}>
            <TextInput
              style={styles.addInput}
              value={nuovoNome}
              onChangeText={setNuovoNome}
              placeholder="Nome esercizio (es. Squat)"
              placeholderTextColor="#6B7280"
              autoFocus
            />
            <View style={styles.addRow}>
              <Text style={styles.addLabel}>Serie:</Text>
              <TextInput
                style={[styles.addInput, { flex: 1, textAlign: 'center' }]}
                value={nuovoNumSerie}
                onChangeText={setNuovoNumSerie}
                keyboardType="number-pad"
                placeholder="3"
                placeholderTextColor="#6B7280"
              />
            </View>
            <TouchableOpacity
              style={[styles.toggleRow, propagaSettimane && styles.toggleRowActive]}
              onPress={() => setPropagaSettimane(!propagaSettimane)}
            >
              <View style={[styles.toggleDot, propagaSettimane && styles.toggleDotActive]} />
              <Text style={[styles.toggleText, propagaSettimane && styles.toggleTextActive]}>
                {propagaSettimane
                  ? '📅 Crea per tutte le 8 settimane'
                  : '📌 Crea solo per settimana ' + settimana}
              </Text>
            </TouchableOpacity>
            <View style={styles.addFormBtns}>
              <TouchableOpacity
                style={styles.addFormCancel}
                onPress={() => { setShowAddEx(false); setNuovoNome(''); setNuovoNumSerie('3'); setPropagaSettimane(true) }}
              >
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
            <Text style={styles.emptyIcon}>🏋️</Text>
            <Text style={styles.emptyTitle}>Nessun esercizio</Text>
            <Text style={styles.emptyText}>Tocca "+ Esercizio" per iniziare</Text>
          </View>
        ) : (
          exercises.map(ex => (
            <ExerciseCard
              key={ex.id}
              exercise={ex}
              onUpdate={updateAtleta}
              onRefresh={fetchExercises}
              onDelete={() => setConfirmDelete(ex)}
            />
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  )
}

function ExerciseCard({ exercise, onUpdate, onRefresh, onDelete }) {
  const [open, setOpen] = useState(false)

  return (
    <View style={cardStyles.card}>
      <TouchableOpacity style={cardStyles.header} onPress={() => setOpen(!open)}>
        <Text style={cardStyles.name}>{exercise.nome}</Text>
        <View style={cardStyles.meta}>
          <View style={cardStyles.badge}>
            <Text style={cardStyles.badgeText}>{exercise.series.length} serie</Text>
          </View>
          <TouchableOpacity style={cardStyles.deleteBtn} onPress={onDelete}>
            <Text style={cardStyles.deleteBtnText}>🗑</Text>
          </TouchableOpacity>
          <Text style={cardStyles.chevron}>{open ? '▲' : '▼'}</Text>
        </View>
      </TouchableOpacity>

      {open && (
        <View style={cardStyles.body}>
          <Text style={cardStyles.sectionTitlePT}>📋 Prescrizione PT</Text>
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
              <Text style={cardStyles.tdPT}>{s.series_pt?.carico || '–'}</Text>
              <Text style={cardStyles.tdPT}>{s.series_pt?.recupero || '–'}</Text>
              <Text style={cardStyles.tdPT}>{s.series_pt?.ripetizioni || '–'}</Text>
              <Text style={[cardStyles.tdPT, { flex: 1.5 }]}>{s.series_pt?.note || '–'}</Text>
            </View>
          ))}

          <Text style={[cardStyles.sectionTitle, { marginTop: 16 }]}>✅ Il tuo allenamento</Text>
          <View style={cardStyles.tableHeader}>
            <Text style={[cardStyles.th, { width: 30 }]}>#</Text>
            <Text style={cardStyles.th}>Carico</Text>
            <Text style={cardStyles.th}>Rec.</Text>
            <Text style={cardStyles.th}>Rip.</Text>
            <Text style={[cardStyles.th, { flex: 1.5 }]}>Note</Text>
          </View>
          {exercise.series.map((s, i) => (
            <SerieRow key={s.id} serie={s} index={i} onUpdate={onUpdate} />
          ))}
        </View>
      )}
    </View>
  )
}

function SerieRow({ serie, index, onUpdate }) {
  const [carico, setCarico] = useState(serie.series_atleta?.carico || '')
  const [recupero, setRecupero] = useState(serie.series_atleta?.recupero || '')
  const [rip, setRip] = useState(serie.series_atleta?.ripetizioni || '')
  const [note, setNote] = useState(serie.series_atleta?.note || '')

  function handleBlur(field, value) { onUpdate(serie.id, field, value) }

  return (
    <View style={cardStyles.tableRow}>
      <Text style={[cardStyles.td, { width: 30, color: '#9CA3AF' }]}>{index + 1}</Text>
      <View style={cardStyles.inputWrap}>
        <TextInput style={cardStyles.input} value={carico} onChangeText={setCarico}
          onBlur={() => handleBlur('carico', carico)} placeholder="–" placeholderTextColor="#6B7280" />
      </View>
      <View style={cardStyles.inputWrap}>
        <TextInput style={cardStyles.input} value={recupero} onChangeText={setRecupero}
          onBlur={() => handleBlur('recupero', recupero)} placeholder="–" placeholderTextColor="#6B7280" />
      </View>
      <View style={cardStyles.inputWrap}>
        <TextInput style={cardStyles.input} value={rip} onChangeText={setRip}
          onBlur={() => handleBlur('ripetizioni', rip)} placeholder="–" placeholderTextColor="#6B7280" />
      </View>
      <View style={[cardStyles.inputWrap, { flex: 1.5 }]}>
        <TextInput style={cardStyles.input} value={note} onChangeText={setNote}
          onBlur={() => handleBlur('note', note)} placeholder="–" placeholderTextColor="#6B7280" />
      </View>
    </View>
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
  logo: { fontSize: 22, fontWeight: '900', color: '#e8ff47', letterSpacing: 3 },
  welcome: { fontSize: 13, color: '#9CA3AF', marginTop: 2 },
  logoutBtn: { backgroundColor: '#1e1e24', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  logoutText: { color: '#9CA3AF', fontSize: 13, fontWeight: '600' },
  scroll: { flex: 1 },
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
  sessionNum: { fontSize: 18, fontWeight: '900', color: '#9CA3AF' },
  sessionNumActive: { color: '#000' },
  sessionDow: { fontSize: 9, fontWeight: '600', color: '#52e89e', marginTop: 2 },
  sessionDowActive: { color: '#000' },
  dowRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20,
    marginTop: 16, marginBottom: 4, gap: 10
  },
  dowLabel: { fontSize: 16, flexShrink: 0 },
  dowPill: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: '#1e1e24', borderWidth: 1, borderColor: '#2e2e3a', marginRight: 6
  },
  dowPillActive: { backgroundColor: '#e8ff4722', borderColor: '#e8ff47' },
  dowPillText: { fontSize: 12, color: '#6B7280', fontWeight: '600' },
  dowPillTextActive: { color: '#e8ff47' },
  sessionTitle: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, marginTop: 20, marginBottom: 12
  },
  sessionTitleText: { fontSize: 16, fontWeight: '800', color: '#f0f0f0', flex: 1 },
  addBtn: { backgroundColor: '#e8ff47', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
  addBtnText: { color: '#000', fontWeight: '800', fontSize: 13 },
  addForm: {
    backgroundColor: '#1e1e24', borderWidth: 1, borderColor: '#2e2e3a',
    borderRadius: 14, marginHorizontal: 16, marginBottom: 12, padding: 16, gap: 12
  },
  addInput: {
    backgroundColor: '#26262e', borderWidth: 1, borderColor: '#2e2e3a',
    borderRadius: 10, padding: 14, color: '#f0f0f0', fontSize: 15
  },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  addLabel: { fontSize: 13, color: '#9CA3AF', fontWeight: '600' },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#26262e', borderWidth: 1, borderColor: '#2e2e3a',
    borderRadius: 10, padding: 12
  },
  toggleRowActive: { borderColor: '#e8ff4766', backgroundColor: '#e8ff4711' },
  toggleDot: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#2e2e3a', borderWidth: 2, borderColor: '#6B7280'
  },
  toggleDotActive: { backgroundColor: '#e8ff47', borderColor: '#e8ff47' },
  toggleText: { fontSize: 13, color: '#6B7280', fontWeight: '600', flex: 1 },
  toggleTextActive: { color: '#e8ff47' },
  addFormBtns: { flexDirection: 'row', gap: 10 },
  addFormCancel: {
    flex: 1, backgroundColor: '#26262e', borderRadius: 10, padding: 12, alignItems: 'center'
  },
  addFormCancelText: { color: '#9CA3AF', fontWeight: '700' },
  addFormConfirm: {
    flex: 1, backgroundColor: '#e8ff47', borderRadius: 10, padding: 12, alignItems: 'center'
  },
  addFormConfirmText: { color: '#000', fontWeight: '800' },
  empty: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 20 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: '#f0f0f0', marginBottom: 6 },
  emptyText: { fontSize: 14, color: '#6B7280' },
  modalOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center',
    alignItems: 'center', zIndex: 999, paddingHorizontal: 32
  },
  modal: {
    backgroundColor: '#1e1e24', borderWidth: 1, borderColor: '#2e2e3a',
    borderRadius: 16, padding: 24, width: '100%'
  },
  modalTitle: { fontSize: 20, fontWeight: '900', color: '#ff6b6b', marginBottom: 12 },
  modalText: { fontSize: 14, color: '#9CA3AF', lineHeight: 22, marginBottom: 20 },
  modalBtns: { flexDirection: 'row', gap: 12 },
  modalCancel: {
    flex: 1, backgroundColor: '#26262e', borderRadius: 10, padding: 14, alignItems: 'center'
  },
  modalCancelText: { color: '#9CA3AF', fontWeight: '700', fontSize: 15 },
  modalConfirm: {
    flex: 1, backgroundColor: '#ff3b3b22', borderWidth: 1,
    borderColor: '#ff3b3b44', borderRadius: 10, padding: 14, alignItems: 'center'
  },
  modalConfirmText: { color: '#ff6b6b', fontWeight: '800', fontSize: 15 },
})

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: '#16161a', borderWidth: 1, borderColor: '#2e2e3a',
    borderRadius: 14, marginHorizontal: 16, marginBottom: 12, overflow: 'hidden'
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, backgroundColor: '#1e1e24'
  },
  name: { fontSize: 15, fontWeight: '700', color: '#f0f0f0', flex: 1 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: { backgroundColor: '#7eb8ff22', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#7eb8ff' },
  deleteBtn: { padding: 4 },
  deleteBtnText: { fontSize: 15 },
  chevron: { color: '#6B7280', fontSize: 12 },
  body: { padding: 16 },
  sectionTitlePT: { fontSize: 11, fontWeight: '700', color: '#7eb8ff', letterSpacing: 1, marginBottom: 10 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: '#52e89e', letterSpacing: 1, marginBottom: 10 },
  tableHeader: { flexDirection: 'row', marginBottom: 6, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: '#2e2e3a' },
  th: { flex: 1, fontSize: 10, fontWeight: '700', color: '#6B7280', textAlign: 'center' },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#1e1e2422' },
  td: { flex: 1, fontSize: 13, color: '#f0f0f0', textAlign: 'center' },
  tdPT: { flex: 1, fontSize: 13, color: '#7eb8ff', textAlign: 'center' },
  inputWrap: { flex: 1, paddingHorizontal: 2 },
  input: {
    backgroundColor: '#26262e', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 5,
    fontSize: 12, color: '#f0f0f0', textAlign: 'center', borderWidth: 1, borderColor: '#2e2e3a'
  },
})