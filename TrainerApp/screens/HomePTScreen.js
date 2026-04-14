import { useState, useEffect } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, TextInput
} from 'react-native'
import { supabase } from '../lib/supabase'
import ProgressiScreen from './ProgressiScreen'

export default function HomePTScreen() {
  const [profile, setProfile] = useState(null)
  const [atleti, setAtleti] = useState([])
  const [richieste, setRichieste] = useState([])
  const [atletaSelezionato, setAtletaSelezionato] = useState(null)
  const [atletaProgressi, setAtletaProgressi] = useState(null)
  const [loading, setLoading] = useState(true)

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
      .select('*, atleta:atleta_id(id, nome, email)')
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

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  if (loading) return (
    <View style={styles.loading}>
      <Text style={styles.loadingText}>Caricamento...</Text>
    </View>
  )

  if (atletaProgressi) {
    return (
      <ProgressiScreen
        onBack={() => setAtletaProgressi(null)}
        atletaId={atletaProgressi.id}
      />
    )
  }

  if (atletaSelezionato) {
    return (
      <SchedaAtletaPT
        atleta={atletaSelezionato}
        ptId={profile.id}
        onBack={() => setAtletaSelezionato(null)}
        onProgressi={() => setAtletaProgressi(atletaSelezionato)}
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

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        <View style={styles.codiceBox}>
          <Text style={styles.codiceLabel}>Il tuo Codice PT</Text>
          <Text style={styles.codice}>{profile?.codice_pt}</Text>
          <Text style={styles.codiceHint}>Condividilo con i tuoi atleti per collegarti</Text>
        </View>

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

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>👥 I tuoi Atleti ({atleti.length})</Text>
          {atleti.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>👤</Text>
              <Text style={styles.emptyTitle}>Nessun atleta collegato</Text>
              <Text style={styles.emptyText}>
                Condividi il codice <Text style={{ color: '#e8ff47' }}>{profile?.codice_pt}</Text> con i tuoi atleti
              </Text>
            </View>
          ) : (
            atleti.map(a => (
              <View key={a.id} style={styles.atletaCard}>
                <TouchableOpacity
                  style={styles.atletaCardMain}
                  onPress={() => setAtletaSelezionato(a.atleta)}
                >
                  <View style={styles.atletaAvatar}>
                    <Text style={styles.atletaAvatarText}>
                      {a.atleta.nome.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.atletaInfo}>
                    <Text style={styles.atletaNome}>{a.atleta.nome}</Text>
                    <Text style={styles.atletaEmail}>{a.atleta.email}</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.progressiBtn}
                  onPress={() => setAtletaProgressi(a.atleta)}
                >
                  <Text style={styles.progressiBtnText}>📈</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.schedaBtn}
                  onPress={() => setAtletaSelezionato(a.atleta)}
                >
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
function SchedaAtletaPT({ atleta, ptId, onBack, onProgressi }) {
  const [settimana, setSettimana] = useState(1)
  const [sessione, setSessione] = useState(1)
  const [sessionDow, setSessionDow] = useState({})
  const [exercises, setExercises] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddEx, setShowAddEx] = useState(false)
  const [nuovoNome, setNuovoNome] = useState('')
  const [nuovoNumSerie, setNuovoNumSerie] = useState('3')
  const [propagaSettimane, setPropagaSettimane] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState(null)

  useEffect(() => { fetchExercises(); fetchSessionDow() }, [settimana, sessione])

  async function fetchSessionDow() {
    const { data } = await supabase.from('session_dow')
      .select('*').eq('atleta_id', atleta.id)
    if (data) {
      const map = {}
      data.forEach(d => { map[`${d.settimana}_${d.sessione}`] = d.giorno })
      setSessionDow(map)
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
    setExercises(Object.values(exMap))
    setLoading(false)
  }

  async function addExercise() {
    if (!nuovoNome.trim()) return
    const numSerie = parseInt(nuovoNumSerie) || 3

    const { data: ex } = await supabase.from('exercises').insert({
      atleta_id: atleta.id, nome: nuovoNome.trim(), creato_da: 'pt'
    }).select().single()

    const settimane = propagaSettimane ? [1,2,3,4,5,6,7,8] : [settimana]
    for (const w of settimane) {
      for (let i = 1; i <= numSerie; i++) {
        await supabase.from('series').insert({
          exercise_id: ex.id, settimana: w, sessione, numero: i
        })
      }
    }
    setNuovoNome(''); setNuovoNumSerie('3'); setPropagaSettimane(true)
    setShowAddEx(false); fetchExercises()
  }

  async function deleteExercise(exerciseId) {
    await supabase.from('series').delete().eq('exercise_id', exerciseId)
    await supabase.from('exercises').delete().eq('id', exerciseId)
    setConfirmDelete(null); fetchExercises()
  }

  async function updatePT(serieId, field, value) {
    await supabase.from('series_pt').upsert({
      serie_id: serieId, [field]: value
    }, { onConflict: 'serie_id' })
  }

  async function addSerie(exerciseId) {
    const ex = exercises.find(e => e.id === exerciseId)
    await supabase.from('series').insert({
      exercise_id: exerciseId, settimana, sessione, numero: ex.series.length + 1
    })
    fetchExercises()
  }

  async function deleteSerie(serieId) {
    await supabase.from('series').delete().eq('id', serieId)
    fetchExercises()
  }

  const currentDow = sessionDow[`${settimana}_${sessione}`]

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
        <Text style={styles.atletaHeaderNome}>{atleta.nome}</Text>
        <TouchableOpacity onPress={onProgressi} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>📈</Text>
        </TouchableOpacity>
      </View>

      {confirmDelete && (
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Elimina Esercizio</Text>
            <Text style={styles.modalText}>
              Vuoi eliminare <Text style={{ color: '#f0f0f0', fontWeight: '700' }}>{confirmDelete.nome}</Text>?{'\n'}
              Verranno eliminate tutte le serie su tutte le settimane.
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

        <Text style={styles.sectionLabel}>SETTIMANA</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsRow}>
          {[1,2,3,4,5,6,7,8].map(w => (
            <TouchableOpacity key={w}
              style={[styles.weekPill, settimana === w && styles.weekPillActive]}
              onPress={() => setSettimana(w)}>
              <Text style={[styles.weekPillText, settimana === w && styles.weekPillTextActive]}>Sett. {w}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.sectionLabel}>SESSIONE</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsRow}>
          {[1,2,3,4,5,6,7].map(s => {
            const dow = sessionDow[`${settimana}_${s}`]
            return (
              <TouchableOpacity key={s}
                style={[styles.sessionPill, sessione === s && styles.sessionPillActive]}
                onPress={() => setSessione(s)}>
                <Text style={[styles.sessionNum, sessione === s && styles.sessionNumActive]}>{s}</Text>
                {dow && <Text style={[styles.sessionDow, sessione === s && styles.sessionDowActive]}>{dow.slice(0,3)}</Text>}
              </TouchableOpacity>
            )
          })}
        </ScrollView>

        <View style={styles.sessionTitle}>
          <Text style={styles.sessionTitleText}>
            Sett. {settimana} · Sess. {sessione}{currentDow ? ` · ${currentDow}` : ''}
          </Text>
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddEx(!showAddEx)}>
            <Text style={styles.addBtnText}>{showAddEx ? '✕ Chiudi' : '+ Esercizio'}</Text>
          </TouchableOpacity>
        </View>

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
            <TouchableOpacity
              style={[styles.toggleRow, propagaSettimane && styles.toggleRowActive]}
              onPress={() => setPropagaSettimane(!propagaSettimane)}>
              <View style={[styles.toggleDot, propagaSettimane && styles.toggleDotActive]} />
              <Text style={[styles.toggleText, propagaSettimane && styles.toggleTextActive]}>
                {propagaSettimane ? '📅 Crea per tutte le 8 settimane' : '📌 Crea solo per settimana ' + settimana}
              </Text>
            </TouchableOpacity>
            <View style={styles.addFormBtns}>
              <TouchableOpacity style={styles.addFormCancel}
                onPress={() => { setShowAddEx(false); setNuovoNome(''); setNuovoNumSerie('3'); setPropagaSettimane(true) }}>
                <Text style={styles.addFormCancelText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addFormConfirm} onPress={addExercise}>
                <Text style={styles.addFormConfirmText}>Aggiungi</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {exercises.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyTitle}>Nessun esercizio</Text>
            <Text style={styles.emptyText}>Aggiungi esercizi per questa sessione</Text>
          </View>
        ) : (
          exercises.map(ex => (
            <ExercisePTCard
              key={ex.id}
              exercise={ex}
              onUpdatePT={updatePT}
              onAddSerie={() => addSerie(ex.id)}
              onDeleteSerie={(serieId) => deleteSerie(serieId)}
              onDelete={() => setConfirmDelete(ex)}
            />
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  )
}

function ExercisePTCard({ exercise, onUpdatePT, onAddSerie, onDeleteSerie, onDelete }) {
  const [open, setOpen] = useState(true)

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
            <Text style={[cardStyles.th, { width: 28 }]}></Text>
          </View>
          {exercise.series.map((s, i) => (
            <SeriePTRow key={s.id} serie={s} index={i} onUpdate={onUpdatePT} onDelete={() => onDeleteSerie(s.id)} />
          ))}
          <TouchableOpacity style={cardStyles.addSerieBtn} onPress={onAddSerie}>
            <Text style={cardStyles.addSerieBtnText}>+ Aggiungi serie</Text>
          </TouchableOpacity>

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

function SeriePTRow({ serie, index, onUpdate, onDelete }) {
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
      <View style={cardStyles.inputWrap}>
        <TextInput style={cardStyles.inputPT} value={recupero} onChangeText={setRecupero}
          onBlur={() => handleBlur('recupero', recupero)} placeholder="–" placeholderTextColor="#6B7280" />
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
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#1e1e24'
  },
  logo: { fontSize: 22, fontWeight: '900', color: '#e8ff47', letterSpacing: 3 },
  welcome: { fontSize: 13, color: '#9CA3AF', marginTop: 2 },
  logoutBtn: { backgroundColor: '#1e1e24', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  logoutText: { color: '#9CA3AF', fontSize: 13, fontWeight: '600' },
  backBtn: { backgroundColor: '#1e1e24', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, width: 90 },
  backText: { color: '#9CA3AF', fontSize: 13, fontWeight: '600' },
  atletaHeaderNome: { fontSize: 16, fontWeight: '800', color: '#f0f0f0', flex: 1, textAlign: 'center' },
  scroll: { flex: 1 },
  codiceBox: {
    margin: 20, backgroundColor: '#1e1e24', borderWidth: 1,
    borderColor: '#e8ff4744', borderRadius: 16, padding: 20, alignItems: 'center'
  },
  codiceLabel: { fontSize: 11, fontWeight: '700', color: '#9CA3AF', letterSpacing: 1, marginBottom: 8 },
  codice: { fontSize: 36, fontWeight: '900', color: '#e8ff47', letterSpacing: 4, marginBottom: 8 },
  codiceHint: { fontSize: 12, color: '#6B7280', textAlign: 'center' },
  section: { paddingHorizontal: 20, marginBottom: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#f0f0f0', marginBottom: 12 },
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
    borderRadius: 12, marginBottom: 10, flexDirection: 'row', alignItems: 'center',
    overflow: 'hidden'
  },
  atletaCardMain: { flex: 1, flexDirection: 'row', alignItems: 'center', padding: 16 },
  atletaAvatar: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#e8ff4722',
    justifyContent: 'center', alignItems: 'center', marginRight: 14
  },
  atletaAvatarText: { fontSize: 18, fontWeight: '900', color: '#e8ff47' },
  atletaInfo: { flex: 1 },
  atletaNome: { fontSize: 15, fontWeight: '700', color: '#f0f0f0' },
  atletaEmail: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  progressiBtn: {
    backgroundColor: '#52e89e22', borderLeftWidth: 1, borderLeftColor: '#2e2e3a',
    paddingHorizontal: 14, paddingVertical: 16, justifyContent: 'center'
  },
  progressiBtnText: { fontSize: 18 },
  schedaBtn: {
    backgroundColor: '#e8ff4722', borderLeftWidth: 1, borderLeftColor: '#2e2e3a',
    paddingHorizontal: 14, paddingVertical: 16, justifyContent: 'center'
  },
  schedaBtnText: { color: '#e8ff47', fontSize: 12, fontWeight: '800' },
  empty: { alignItems: 'center', paddingVertical: 48 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#f0f0f0', marginBottom: 6 },
  emptyText: { fontSize: 13, color: '#6B7280', textAlign: 'center' },
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
})