import { useState, useEffect, useRef } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, TextInput, Vibration
} from 'react-native'
import { supabase } from '../lib/supabase'
import ImpostazioniScreen from './ImpostazioniScreen'
import ProgressiScreen from './ProgressiScreen'
import ExportScreen from './ExportScreen'

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
  const [nuovoCarico, setNuovoCarico] = useState('')
  const [nuovoRecupero, setNuovoRecupero] = useState('')
  const [nuovoRip, setNuovoRip] = useState('')
  const [nuovoNote, setNuovoNote] = useState('')
  const [settimaneSelezionate, setSettimaneSelezionate] = useState([])
  const [sessioniSelezionate, setSessioniSelezionate] = useState([])
  const [mostraImpostazioni, setMostraImpostazioni] = useState(false)
  const [mostraProgressi, setMostraProgressi] = useState(false)
  const [mostraExport, setMostraExport] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [confirmSovrascrittura, setConfirmSovrascrittura] = useState(null)
  const [pendingExerciseData, setPendingExerciseData] = useState(null)
  const [completamenti, setCompletamenti] = useState({})
  const [sessioniCompletate, setSessioniCompletate] = useState({})
  const [timerAttivo, setTimerAttivo] = useState(false)
  const [timerSecondi, setTimerSecondi] = useState(0)
  const timerRef = useRef(null)
  const [numSettimane, setNumSettimane] = useState(8)
  const [numSessioni, setNumSessioni] = useState(7)
  const [modificaPTSbloccata, setModificaPTSbloccata] = useState(false)

  useEffect(() => { fetchProfile() }, [])

  useEffect(() => {
    if (profile) {
      fetchExercises()
      fetchSessionDow()
      fetchCompletamenti()
      fetchSessioniCompletate()
    }
  }, [profile, settimana, sessione])

  useEffect(() => {
    if (profile) {
      setNumSettimane(profile.num_settimane || 8)
      setNumSessioni(profile.num_sessioni || 7)
      setModificaPTSbloccata(profile.modifica_pt_sbloccata || false)
      const tutteSettimane = Array.from({length: profile.num_settimane || 8}, (_, i) => i + 1)
      setSettimaneSelezionate(tutteSettimane)
      setSessioniSelezionate([sessione])
    }
  }, [profile])

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

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

  async function fetchCompletamenti() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase.from('completamenti')
      .select('*').eq('atleta_id', user.id)
      .eq('settimana', settimana).eq('sessione', sessione)
    if (data) {
      const map = {}
      data.forEach(d => { map[d.exercise_id] = d.completato })
      setCompletamenti(map)
    }
  }

  async function fetchSessioniCompletate() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase.from('sessioni_completate')
      .select('*').eq('atleta_id', user.id).eq('settimana', settimana)
    if (data) {
      const map = {}
      data.forEach(d => { map[d.sessione] = d.completata })
      setSessioniCompletate(map)
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
    const sorted = Object.values(exMap).sort((a, b) => (a.ordine || 0) - (b.ordine || 0))
    setExercises(sorted)
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

  // Controlla se esistono già dati PT nelle sessioni/settimane selezionate
  async function checkSovrascrittura(exId, settimane, sessioni) {
    const conflicts = []
    for (const w of settimane) {
      for (const s of sessioni) {
        if (w === settimana && s === sessione) continue // skip sessione corrente
        const { data } = await supabase.from('series')
          .select('*, series_pt(*)')
          .eq('exercise_id', exId)
          .eq('settimana', w)
          .eq('sessione', s)
        if (data && data.length > 0) {
          const hasPT = data.some(d => d.series_pt && (d.series_pt.carico || d.series_pt.ripetizioni || d.series_pt.recupero || d.series_pt.note))
          if (hasPT) conflicts.push({ settimana: w, sessione: s })
        }
      }
    }
    return conflicts
  }

  async function addExercise() {
    if (!nuovoNome.trim()) return
    const { data: { user } } = await supabase.auth.getUser()
    const numSerie = parseInt(nuovoNumSerie) || 3
    const maxOrdine = exercises.length

    // Crea l'esercizio
    const { data: ex } = await supabase.from('exercises').insert({
      atleta_id: user.id, nome: nuovoNome.trim(),
      creato_da: 'atleta', ordine: maxOrdine
    }).select().single()

    // Crea serie per la sessione corrente con valori PT
    const serieIds = []
    for (let i = 1; i <= numSerie; i++) {
      const { data: serie } = await supabase.from('series').insert({
        exercise_id: ex.id, settimana, sessione, numero: i
      }).select().single()
      serieIds.push(serie.id)

      // Inserisce valori PT nella sessione corrente
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

    // Altre settimane/sessioni selezionate (escludi corrente)
    const altreDestinazioni = []
    for (const w of settimaneSelezionate) {
      for (const s of sessioniSelezionate) {
        if (w === settimana && s === sessione) continue
        altreDestinazioni.push({ w, s })
      }
    }

    if (altreDestinazioni.length === 0) {
      resetForm()
      fetchExercises()
      return
    }

    // Controlla sovrascritture (in questo caso l'esercizio è nuovo
    // quindi non ci sono conflitti, ma salviamo i dati per dopo)
    const haValoriPT = nuovoCarico || nuovoRecupero || nuovoRip || nuovoNote

    // Crea serie per le altre destinazioni
    for (const { w, s } of altreDestinazioni) {
      for (let i = 1; i <= numSerie; i++) {
        const { data: serie } = await supabase.from('series').insert({
          exercise_id: ex.id, settimana: w, sessione: s, numero: i
        }).select().single()

        if (haValoriPT) {
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

  // Copia valori PT su esercizio esistente con controllo sovrascrittura
  async function copiaPTsuEsercizio(exercise, settimaneTarget, sessioniTarget) {
    // Prendi i valori PT della sessione corrente
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
      // Salva i dati pending e mostra conferma
      setPendingExerciseData({
        exercise, settimaneTarget, sessioniTarget, valoriPT, conflicts
      })
      setConfirmSovrascrittura(true)
    } else {
      await eseguiCopiaPT(exercise.id, settimaneTarget, sessioniTarget, valoriPT, exercise.series.length)
      fetchExercises()
    }
  }

  async function eseguiCopiaPT(exerciseId, settimaneTarget, sessioniTarget, valoriPT, numSerie, soloNonEsistenti = false) {
    for (const w of settimaneTarget) {
      for (const s of sessioniTarget) {
        if (w === settimana && s === sessione) continue

        for (let i = 1; i <= numSerie; i++) {
          // Cerca la serie esistente
          const { data: existingSerie } = await supabase.from('series')
            .select('*, series_pt(*)')
            .eq('exercise_id', exerciseId)
            .eq('settimana', w)
            .eq('sessione', s)
            .eq('numero', i)
            .single()

          if (existingSerie) {
            const hasPT = existingSerie.series_pt && (
              existingSerie.series_pt.carico ||
              existingSerie.series_pt.ripetizioni ||
              existingSerie.series_pt.recupero ||
              existingSerie.series_pt.note
            )

            if (soloNonEsistenti && hasPT) continue // salta se già ha dati e siamo in modalità "non sovrascrivere"

            const pt = valoriPT[i] || {}
            await supabase.from('series_pt').upsert({
              serie_id: existingSerie.id,
              carico: pt.carico || null,
              recupero: pt.recupero || null,
              ripetizioni: pt.ripetizioni || null,
              note: pt.note || null
            }, { onConflict: 'serie_id' })
          } else {
            // Crea la serie se non esiste
            const { data: nuovaSerie } = await supabase.from('series').insert({
              exercise_id: exerciseId, settimana: w, sessione: s, numero: i
            }).select().single()

            const pt = valoriPT[i] || {}
            if (pt.carico || pt.recupero || pt.ripetizioni || pt.note) {
              await supabase.from('series_pt').insert({
                serie_id: nuovaSerie.id,
                carico: pt.carico || null,
                recupero: pt.recupero || null,
                ripetizioni: pt.ripetizioni || null,
                note: pt.note || null
              })
            }
          }
        }
      }
    }
  }

  function resetForm() {
    setNuovoNome('')
    setNuovoNumSerie('3')
    setNuovoCarico('')
    setNuovoRecupero('')
    setNuovoRip('')
    setNuovoNote('')
    setShowAddEx(false)
  }

  async function deleteExercise(exerciseId) {
    await supabase.from('series').delete().eq('exercise_id', exerciseId)
    await supabase.from('exercises').delete().eq('id', exerciseId)
    setConfirmDelete(null)
    fetchExercises()
  }

  async function deleteSerie(serieId) {
    await supabase.from('series').delete().eq('id', serieId)
    fetchExercises()
  }

  async function addSerie(exercise) {
    const nextNum = exercise.series.length + 1
    const primasSerie = exercise.series[0]
    await supabase.from('series').insert({
      exercise_id: exercise.id,
      settimana: primasSerie?.settimana || settimana,
      sessione: primasSerie?.sessione || sessione,
      numero: nextNum
    })
    fetchExercises()
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

  async function updateAtleta(serieId, field, value) {
    await supabase.from('series_atleta').upsert({
      serie_id: serieId, [field]: value
    }, { onConflict: 'serie_id' })
  }

  async function updatePT(serieId, field, value) {
    await supabase.from('series_pt').upsert({
      serie_id: serieId, [field]: value
    }, { onConflict: 'serie_id' })
  }

  async function toggleCompletamentoEsercizio(exerciseId) {
    const { data: { user } } = await supabase.auth.getUser()
    const nuovoValore = !completamenti[exerciseId]
    await supabase.from('completamenti').upsert({
      atleta_id: user.id, settimana, sessione,
      exercise_id: exerciseId, completato: nuovoValore
    }, { onConflict: 'atleta_id,settimana,sessione,exercise_id' })
    setCompletamenti(prev => ({ ...prev, [exerciseId]: nuovoValore }))
  }

  async function toggleSessioneCompletata() {
    const { data: { user } } = await supabase.auth.getUser()
    const nuovoValore = !sessioniCompletate[sessione]
    await supabase.from('sessioni_completate').upsert({
      atleta_id: user.id, settimana, sessione, completata: nuovoValore
    }, { onConflict: 'atleta_id,settimana,sessione' })
    setSessioniCompletate(prev => ({ ...prev, [sessione]: nuovoValore }))
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

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  const currentDow = sessionDow[`${settimana}_${sessione}`]
  const sessioneCompletata = sessioniCompletate[sessione]
  const tutteSettimane = Array.from({length: numSettimane}, (_, i) => i + 1)
  const tutteSessioni = Array.from({length: numSessioni}, (_, i) => i + 1)

  if (loading) return (
    <View style={styles.loading}>
      <Text style={styles.loadingText}>Caricamento...</Text>
    </View>
  )

  if (mostraImpostazioni) {
    return (
      <ImpostazioniScreen onBack={() => {
        setMostraImpostazioni(false)
        fetchProfile()
        fetchExercises()
      }} />
    )
  }

  if (mostraProgressi) return <ProgressiScreen onBack={() => setMostraProgressi(false)} />
  if (mostraExport) return <ExportScreen onBack={() => setMostraExport(false)} />

  return (
    <SafeAreaView style={styles.container}>

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

      {/* HEADER */}
      <View style={styles.header}>
        <View>
          <Text style={styles.logo}>TRAINER</Text>
          <Text style={styles.welcome}>Ciao, {profile?.nome?.split(' ')[0]} 👋</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity onPress={() => setMostraProgressi(true)} style={styles.iconBtn}>
            <Text style={styles.iconBtnText}>📈</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setMostraExport(true)} style={styles.iconBtn}>
            <Text style={styles.iconBtnText}>📊</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setMostraImpostazioni(true)} style={styles.iconBtn}>
            <Text style={styles.iconBtnText}>⚙️</Text>
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

      {/* MODALE CONFERMA SOVRASCRITTURA */}
      {confirmSovrascrittura && pendingExerciseData && (
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>⚠️ Dati già esistenti</Text>
            <Text style={styles.modalText}>
              Le seguenti sessioni hanno già valori PT inseriti:{'\n\n'}
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
                  setConfirmSovrascrittura(false)
                  setPendingExerciseData(null)
                  fetchExercises()
                }}>
                <Text style={styles.modalSkipBtnText}>Salta esistenti</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalOverwriteBtn}
                onPress={async () => {
                  const { exercise, settimaneTarget, sessioniTarget, valoriPT } = pendingExerciseData
                  await eseguiCopiaPT(exercise.id, settimaneTarget, sessioniTarget, valoriPT, exercise.series.length, false)
                  setConfirmSovrascrittura(false)
                  setPendingExerciseData(null)
                  fetchExercises()
                }}>
                <Text style={styles.modalOverwriteBtnText}>Sovrascrivi</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* SETTIMANE */}
        <Text style={styles.sectionLabel}>SETTIMANA</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsRow}>
          {tutteSettimane.map(w => (
            <TouchableOpacity key={w}
              style={[styles.weekPill, settimana === w && styles.weekPillActive]}
              onPress={() => setSettimana(w)}>
              <Text style={[styles.weekPillText, settimana === w && styles.weekPillTextActive]}>
                Sett. {w}
              </Text>
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
                {dow && (
                  <Text style={[styles.sessionDow, sessione === s && styles.sessionDowActive]}>
                    {dow.slice(0,3)}
                  </Text>
                )}
              </TouchableOpacity>
            )
          })}
        </ScrollView>

        {/* GIORNO DELLA SETTIMANA */}
        <View style={styles.dowRow}>
          <Text style={styles.dowLabel}>📅</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {GIORNI.map(g => (
              <TouchableOpacity key={g}
                style={[styles.dowPill, (currentDow === g || (!currentDow && g === '–')) && styles.dowPillActive]}
                onPress={() => setGiornoSessione(g)}>
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
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              style={[styles.completaBtn, sessioneCompletata && styles.completaBtnDone]}
              onPress={toggleSessioneCompletata}>
              <Text style={[styles.completaBtnText, sessioneCompletata && styles.completaBtnTextDone]}>
                {sessioneCompletata ? '✓ Fatto' : '○ Completa'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddEx(!showAddEx)}>
              <Text style={styles.addBtnText}>{showAddEx ? '✕' : '+'}</Text>
            </TouchableOpacity>
          </View>
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

            {/* VALORI PT DA COPIARE */}
            <View style={styles.ptValoriBox}>
              <Text style={styles.ptValoriTitle}>📋 Valori PT da copiare (opzionale)</Text>
              <Text style={styles.ptValoriHint}>Questi valori verranno applicati a tutte le serie nelle destinazioni selezionate</Text>
              <View style={styles.ptValoriGrid}>
                <View style={styles.ptValoreItem}>
                  <Text style={styles.ptValoreLabel}>Carico</Text>
                  <TextInput
                    style={styles.ptValoreInput}
                    value={nuovoCarico}
                    onChangeText={setNuovoCarico}
                    placeholder="es. 80kg"
                    placeholderTextColor="#6B7280"
                  />
                </View>
                <View style={styles.ptValoreItem}>
                  <Text style={styles.ptValoreLabel}>Recupero (sec)</Text>
                  <TextInput
                    style={styles.ptValoreInput}
                    value={nuovoRecupero}
                    onChangeText={setNuovoRecupero}
                    placeholder="es. 90"
                    placeholderTextColor="#6B7280"
                    keyboardType="number-pad"
                  />
                </View>
                <View style={styles.ptValoreItem}>
                  <Text style={styles.ptValoreLabel}>Ripetizioni</Text>
                  <TextInput
                    style={styles.ptValoreInput}
                    value={nuovoRip}
                    onChangeText={setNuovoRip}
                    placeholder="es. 8-10"
                    placeholderTextColor="#6B7280"
                  />
                </View>
                <View style={styles.ptValoreItem}>
                  <Text style={styles.ptValoreLabel}>Note</Text>
                  <TextInput
                    style={styles.ptValoreInput}
                    value={nuovoNote}
                    onChangeText={setNuovoNote}
                    placeholder="es. Lento"
                    placeholderTextColor="#6B7280"
                  />
                </View>
              </View>
            </View>

            {/* SELEZIONE SETTIMANE */}
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

            {/* SELEZIONE SESSIONI */}
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
            <Text style={styles.emptyIcon}>🏋️</Text>
            <Text style={styles.emptyTitle}>Nessun esercizio</Text>
            <Text style={styles.emptyText}>Tocca "+" per iniziare</Text>
          </View>
        ) : (
          exercises.map((ex, idx) => (
            <ExerciseCard
              key={ex.id}
              exercise={ex}
              index={idx}
              total={exercises.length}
              onUpdate={updateAtleta}
              onUpdatePT={updatePT}
              onDelete={() => setConfirmDelete(ex)}
              onDeleteSerie={deleteSerie}
              onAddSerie={() => addSerie(ex)}
              onSposta={spostaEsercizio}
              completato={!!completamenti[ex.id]}
              onToggleCompletato={() => toggleCompletamentoEsercizio(ex.id)}
              onAvviaTimer={avviaTimer}
              modificaPTSbloccata={modificaPTSbloccata}
              onCopiaPT={(settimaneT, sessioniT) => copiaPTsuEsercizio(ex, settimaneT, sessioniT)}
              tutteSettimane={tutteSettimane}
              tutteSessioni={tutteSessioni}
              settimanaCorrente={settimana}
              sessioneCorrente={sessione}
            />
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  )
}

// ── EXERCISE CARD ─────────────────────────────
function ExerciseCard({ exercise, index, total, onUpdate, onUpdatePT, onDelete, onDeleteSerie, onAddSerie, onSposta, completato, onToggleCompletato, onAvviaTimer, modificaPTSbloccata, onCopiaPT, tutteSettimane, tutteSessioni, settimanaCorrente, sessioneCorrente }) {
  const [open, setOpen] = useState(false)
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
          <Text style={[cardStyles.name, completato && cardStyles.nameCompleted]}>
            {completato ? '✓ ' : ''}{exercise.nome}
          </Text>
        </TouchableOpacity>

        <View style={cardStyles.meta}>
          <TouchableOpacity
            style={[cardStyles.spuntaBtn, completato && cardStyles.spuntaBtnDone]}
            onPress={onToggleCompletato}>
            <Text style={cardStyles.spuntaBtnText}>{completato ? '✓' : '○'}</Text>
          </TouchableOpacity>
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

          {/* PRESCRIZIONE PT */}
          <Text style={cardStyles.sectionTitlePT}>
            📋 Prescrizione PT{modificaPTSbloccata ? ' (modificabile)' : ''}
          </Text>
          <View style={cardStyles.tableHeader}>
            <Text style={[cardStyles.th, { width: 30 }]}>#</Text>
            <Text style={cardStyles.th}>Carico</Text>
            <Text style={cardStyles.th}>Rec.</Text>
            <Text style={cardStyles.th}>Rip.</Text>
            <Text style={[cardStyles.th, { flex: 1.5 }]}>Note</Text>
            {modificaPTSbloccata && <Text style={[cardStyles.th, { width: 28 }]}></Text>}
          </View>
          {exercise.series.map((s, i) => (
            modificaPTSbloccata ? (
              <SeriePTEditabile
                key={s.id} serie={s} index={i}
                onUpdate={onUpdatePT}
                onDelete={() => onDeleteSerie(s.id)}
                onAvviaTimer={onAvviaTimer}
              />
            ) : (
              <View key={s.id} style={cardStyles.tableRow}>
                <Text style={[cardStyles.td, { width: 30, color: '#9CA3AF' }]}>{i + 1}</Text>
                <Text style={cardStyles.tdPT}>{s.series_pt?.carico || '–'}</Text>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={cardStyles.tdPT}>{s.series_pt?.recupero || '–'}</Text>
                  {s.series_pt?.recupero ? (
                    <TouchableOpacity style={cardStyles.timerBtn}
                      onPress={() => onAvviaTimer(s.series_pt.recupero)} activeOpacity={0.7}>
                      <Text style={cardStyles.timerBtnText}>▶ {s.series_pt.recupero}s</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                <Text style={cardStyles.tdPT}>{s.series_pt?.ripetizioni || '–'}</Text>
                <Text style={[cardStyles.tdPT, { flex: 1.5 }]}>{s.series_pt?.note || '–'}</Text>
              </View>
            )
          ))}

          {/* BOTTONE COPIA PT */}
          {modificaPTSbloccata && (
            <TouchableOpacity
              style={cardStyles.copiaBtn}
              onPress={() => setShowCopia(!showCopia)}>
              <Text style={cardStyles.copiaBtnText}>
                {showCopia ? '✕ Chiudi' : '📋 Copia valori PT su altre sessioni'}
              </Text>
            </TouchableOpacity>
          )}

          {/* FORM COPIA PT */}
          {showCopia && modificaPTSbloccata && (
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

              <TouchableOpacity
                style={cardStyles.copiaConfirmBtn}
                onPress={() => {
                  onCopiaPT(copiaSettimane, copiaSessioni)
                  setShowCopia(false)
                }}>
                <Text style={cardStyles.copiaConfirmBtnText}>📋 Copia valori PT</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ESEGUITO ATLETA */}
          <Text style={[cardStyles.sectionTitle, { marginTop: 16 }]}>✅ Il tuo allenamento</Text>
          <View style={cardStyles.tableHeader}>
            <Text style={[cardStyles.th, { width: 30 }]}>#</Text>
            <Text style={cardStyles.th}>Carico</Text>
            <Text style={cardStyles.th}>Rec.</Text>
            <Text style={cardStyles.th}>Rip.</Text>
            <Text style={[cardStyles.th, { flex: 1.5 }]}>Note</Text>
            <Text style={[cardStyles.th, { width: 28 }]}></Text>
          </View>
          {exercise.series.map((s, i) => (
            <SerieRow
              key={s.id} serie={s} index={i}
              onUpdate={onUpdate}
              onDelete={() => onDeleteSerie(s.id)}
              onAvviaTimer={onAvviaTimer}
            />
          ))}

          <TouchableOpacity style={cardStyles.addSerieBtn} onPress={onAddSerie}>
            <Text style={cardStyles.addSerieBtnText}>+ Aggiungi serie</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}

// ── SERIE ROW PT EDITABILE ─────────────────────
function SeriePTEditabile({ serie, index, onUpdate, onDelete, onAvviaTimer }) {
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

// ── SERIE ROW ATLETA ───────────────────────────
function SerieRow({ serie, index, onUpdate, onDelete, onAvviaTimer }) {
  const [carico, setCarico] = useState(serie.series_atleta?.carico || '')
  const [recupero, setRecupero] = useState(serie.series_atleta?.recupero || '')
  const [rip, setRip] = useState(serie.series_atleta?.ripetizioni || '')
  const [note, setNote] = useState(serie.series_atleta?.note || '')

  function handleBlur(field, value) { onUpdate(serie.id, field, value) }

  const recuperoTimer = recupero || serie.series_pt?.recupero

  return (
    <View style={cardStyles.tableRow}>
      <Text style={[cardStyles.td, { width: 30, color: '#9CA3AF' }]}>{index + 1}</Text>
      <View style={cardStyles.inputWrap}>
        <TextInput style={cardStyles.input} value={carico} onChangeText={setCarico}
          onBlur={() => handleBlur('carico', carico)} placeholder="–" placeholderTextColor="#6B7280" />
      </View>
      <View style={[cardStyles.inputWrap, { flexDirection: 'column', gap: 4 }]}>
        <TextInput style={cardStyles.input} value={recupero} onChangeText={setRecupero}
          onBlur={() => handleBlur('recupero', recupero)} placeholder="sec"
          placeholderTextColor="#6B7280" keyboardType="number-pad" />
        {recuperoTimer ? (
          <TouchableOpacity style={cardStyles.timerBtn} onPress={() => onAvviaTimer(recuperoTimer)} activeOpacity={0.7}>
            <Text style={cardStyles.timerBtnText}>▶ {recuperoTimer}s</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={cardStyles.inputWrap}>
        <TextInput style={cardStyles.input} value={rip} onChangeText={setRip}
          onBlur={() => handleBlur('ripetizioni', rip)} placeholder="–" placeholderTextColor="#6B7280" />
      </View>
      <View style={[cardStyles.inputWrap, { flex: 1.5 }]}>
        <TextInput style={cardStyles.input} value={note} onChangeText={setNote}
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
  iconBtn: { backgroundColor: '#1e1e24', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  iconBtnText: { fontSize: 16 },
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
  sessionPillCompleted: { backgroundColor: '#52e89e22', borderColor: '#52e89e' },
  sessionNum: { fontSize: 18, fontWeight: '900', color: '#9CA3AF' },
  sessionNumActive: { color: '#000' },
  sessionNumCompleted: { color: '#52e89e' },
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
    paddingHorizontal: 20, marginTop: 20, marginBottom: 12, gap: 8
  },
  sessionTitleText: { fontSize: 15, fontWeight: '800', color: '#f0f0f0', flex: 1 },
  completaBtn: {
    backgroundColor: '#1e1e24', borderWidth: 1, borderColor: '#2e2e3a',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8
  },
  completaBtnDone: { backgroundColor: '#52e89e22', borderColor: '#52e89e' },
  completaBtnText: { color: '#9CA3AF', fontWeight: '700', fontSize: 12 },
  completaBtnTextDone: { color: '#52e89e' },
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
  modalTitle: { fontSize: 18, fontWeight: '900', color: '#ff6b6b', marginBottom: 12 },
  modalText: { fontSize: 14, color: '#9CA3AF', lineHeight: 22, marginBottom: 20 },
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
  nameCompleted: { color: '#52e89e' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  spuntaBtn: {
    width: 28, height: 28, borderRadius: 14, borderWidth: 2,
    borderColor: '#2e2e3a', justifyContent: 'center', alignItems: 'center'
  },
  spuntaBtnDone: { backgroundColor: '#52e89e', borderColor: '#52e89e' },
  spuntaBtnText: { fontSize: 12, color: '#9CA3AF', fontWeight: '700' },
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
  tdPT: { flex: 1, fontSize: 13, color: '#7eb8ff', textAlign: 'center' },
  inputWrap: { flex: 1, paddingHorizontal: 2 },
  input: {
    backgroundColor: '#26262e', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 5,
    fontSize: 12, color: '#f0f0f0', textAlign: 'center', borderWidth: 1, borderColor: '#2e2e3a'
  },
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