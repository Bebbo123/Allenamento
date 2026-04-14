import { useState, useEffect } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView
} from 'react-native'
import { supabase } from '../lib/supabase'

export default function ProgressiScreen({ onBack, atletaId }) {
  const [exercises, setExercises] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedEx, setSelectedEx] = useState(null)

  useEffect(() => { fetchProgressi() }, [])

  async function fetchProgressi() {
    let uid = atletaId
    if (!uid) {
      const { data: { user } } = await supabase.auth.getUser()
      uid = user.id
    }

    const { data: exData } = await supabase.from('exercises')
      .select('*').eq('atleta_id', uid).order('created_at')

    if (!exData) { setLoading(false); return }

    const exWithStats = await Promise.all(exData.map(async ex => {
      const { data: seriesData } = await supabase.from('series')
        .select('*, series_pt(*), series_atleta(*)')
        .eq('exercise_id', ex.id)
        .order('settimana')
        .order('sessione')
        .order('numero')

      if (!seriesData) return { ...ex, stats: null, seriesData: [] }

      // Calcola statistiche
      let maxCarico = 0
      let totalSerie = 0
      let doneSerie = 0
      const andamentoMap = {}

      seriesData.forEach(s => {
        totalSerie++
        if (s.series_atleta?.carico || s.series_atleta?.ripetizioni) doneSerie++

        const c = parseFloat(s.series_atleta?.carico)
        if (!isNaN(c) && c > maxCarico) maxCarico = c

        const key = `S${s.settimana}`
        if (!andamentoMap[key]) andamentoMap[key] = { carichi: [], label: key }
        if (!isNaN(c) && c > 0) andamentoMap[key].carichi.push(c)
      })

      const andamento = Object.values(andamentoMap).map(a => ({
        label: a.label,
        max: a.carichi.length > 0 ? Math.max(...a.carichi) : 0
      }))

      const pct = totalSerie > 0 ? Math.round(doneSerie / totalSerie * 100) : 0

      return {
        ...ex,
        stats: { maxCarico, totalSerie, doneSerie, pct, andamento },
        seriesData
      }
    }))

    setExercises(exWithStats)
    setLoading(false)
  }

  if (loading) return (
    <View style={styles.loading}>
      <Text style={styles.loadingText}>Caricamento progressi...</Text>
    </View>
  )

  // Vista dettaglio esercizio
  if (selectedEx) {
    return (
      <DettaglioEsercizio
        exercise={selectedEx}
        onBack={() => setSelectedEx(null)}
      />
    )
  }

  const totEx = exercises.length
  const totSerie = exercises.reduce((a, e) => a + (e.stats?.totalSerie || 0), 0)
  const totDone = exercises.reduce((a, e) => a + (e.stats?.doneSerie || 0), 0)
  const totPct = totSerie > 0 ? Math.round(totDone / totSerie * 100) : 0

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>← Indietro</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>📈 Progressi</Text>
        <View style={{ width: 90 }} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* STATS GLOBALI */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statVal}>{totEx}</Text>
            <Text style={styles.statLbl}>Esercizi</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statVal}>{totDone}</Text>
            <Text style={styles.statLbl}>Serie fatte</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statVal, { color: totPct >= 80 ? '#52e89e' : totPct >= 40 ? '#f59e0b' : '#ff6b6b' }]}>
              {totPct}%
            </Text>
            <Text style={styles.statLbl}>Completato</Text>
          </View>
        </View>

        {/* BARRA PROGRESSO GLOBALE */}
        <View style={styles.globalBarWrap}>
          <View style={styles.globalBarBg}>
            <View style={[styles.globalBarFill, { width: `${totPct}%` }]} />
          </View>
          <Text style={styles.globalBarLabel}>{totDone}/{totSerie} serie completate</Text>
        </View>

        {/* LISTA ESERCIZI */}
        <Text style={styles.sectionTitle}>Per esercizio</Text>

        {exercises.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📊</Text>
            <Text style={styles.emptyTitle}>Nessun dato</Text>
            <Text style={styles.emptyText}>Inizia ad allenarti per vedere i progressi</Text>
          </View>
        ) : (
          exercises.map(ex => (
            <TouchableOpacity
              key={ex.id}
              style={styles.exCard}
              onPress={() => setSelectedEx(ex)}
            >
              <View style={styles.exCardTop}>
                <Text style={styles.exName}>{ex.nome}</Text>
                <Text style={styles.exArrow}>→</Text>
              </View>

              <View style={styles.exStats}>
                <View style={styles.exStat}>
                  <Text style={styles.exStatVal}>
                    {ex.stats?.maxCarico > 0 ? ex.stats.maxCarico + ' kg' : '–'}
                  </Text>
                  <Text style={styles.exStatLbl}>Carico max</Text>
                </View>
                <View style={styles.exStat}>
                  <Text style={styles.exStatVal}>{ex.stats?.doneSerie}/{ex.stats?.totalSerie}</Text>
                  <Text style={styles.exStatLbl}>Serie</Text>
                </View>
                <View style={styles.exStat}>
                  <Text style={[styles.exStatVal, {
                    color: (ex.stats?.pct || 0) >= 80 ? '#52e89e' :
                           (ex.stats?.pct || 0) >= 40 ? '#f59e0b' : '#ff6b6b'
                  }]}>
                    {ex.stats?.pct || 0}%
                  </Text>
                  <Text style={styles.exStatLbl}>Fatto</Text>
                </View>
              </View>

              {/* MINI GRAFICO A BARRE */}
              {ex.stats?.andamento && ex.stats.andamento.some(a => a.max > 0) && (
                <MiniChart data={ex.stats.andamento} />
              )}

              {/* BARRA COMPLETAMENTO */}
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, {
                  width: `${ex.stats?.pct || 0}%`,
                  backgroundColor: (ex.stats?.pct || 0) >= 80 ? '#52e89e' :
                                   (ex.stats?.pct || 0) >= 40 ? '#f59e0b' : '#ff6b6b'
                }]} />
              </View>
            </TouchableOpacity>
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  )
}

// ── MINI GRAFICO ──────────────────────────────
function MiniChart({ data }) {
  const maxVal = Math.max(...data.map(d => d.max), 1)
  const hasData = data.filter(d => d.max > 0)

  if (hasData.length === 0) return null

  return (
    <View style={chartStyles.wrap}>
      <Text style={chartStyles.title}>Carico per settimana (kg)</Text>
      <View style={chartStyles.bars}>
        {data.map((d, i) => (
          <View key={i} style={chartStyles.barCol}>
            <Text style={chartStyles.barVal}>{d.max > 0 ? d.max : ''}</Text>
            <View style={chartStyles.barBg}>
              <View style={[chartStyles.barFill, {
                height: `${Math.round(d.max / maxVal * 100)}%`,
                opacity: d.max > 0 ? 1 : 0.2
              }]} />
            </View>
            <Text style={chartStyles.barLabel}>{d.label}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

// ── DETTAGLIO ESERCIZIO ───────────────────────
function DettaglioEsercizio({ exercise, onBack }) {
  const [filtroSettimana, setFiltroSettimana] = useState(0) // 0 = tutte

  const tutteLeSettimane = [...new Set(exercise.seriesData.map(s => s.settimana))].sort((a, b) => a - b)

  const serieFiltrate = filtroSettimana === 0
    ? exercise.seriesData
    : exercise.seriesData.filter(s => s.settimana === filtroSettimana)

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>← Progressi</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { fontSize: 14 }]} numberOfLines={1}>
          {exercise.nome}
        </Text>
        <View style={{ width: 90 }} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* STATS ESERCIZIO */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statVal}>
              {exercise.stats?.maxCarico > 0 ? exercise.stats.maxCarico + ' kg' : '–'}
            </Text>
            <Text style={styles.statLbl}>Carico max</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statVal}>{exercise.stats?.doneSerie}/{exercise.stats?.totalSerie}</Text>
            <Text style={styles.statLbl}>Serie</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statVal, {
              color: (exercise.stats?.pct || 0) >= 80 ? '#52e89e' :
                     (exercise.stats?.pct || 0) >= 40 ? '#f59e0b' : '#ff6b6b'
            }]}>
              {exercise.stats?.pct || 0}%
            </Text>
            <Text style={styles.statLbl}>Completato</Text>
          </View>
        </View>

        {/* GRAFICO */}
        {exercise.stats?.andamento && (
          <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
            <MiniChart data={exercise.stats.andamento} />
          </View>
        )}

        {/* FILTRO SETTIMANE */}
        <Text style={styles.sectionTitle}>Storico serie</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 16, marginBottom: 12 }}>
          <TouchableOpacity
            style={[styles.filterPill, filtroSettimana === 0 && styles.filterPillActive]}
            onPress={() => setFiltroSettimana(0)}
          >
            <Text style={[styles.filterPillText, filtroSettimana === 0 && styles.filterPillTextActive]}>
              Tutte
            </Text>
          </TouchableOpacity>
          {tutteLeSettimane.map(w => (
            <TouchableOpacity
              key={w}
              style={[styles.filterPill, filtroSettimana === w && styles.filterPillActive]}
              onPress={() => setFiltroSettimana(w)}
            >
              <Text style={[styles.filterPillText, filtroSettimana === w && styles.filterPillTextActive]}>
                Sett. {w}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* TABELLA STORICO */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.th, { flex: 0.8 }]}>Sett.</Text>
            <Text style={[styles.th, { flex: 0.8 }]}>Sess.</Text>
            <Text style={[styles.th, { flex: 0.5 }]}>#</Text>
            <Text style={styles.th}>PT</Text>
            <Text style={styles.th}>Fatto</Text>
            <Text style={styles.th}>Rip.</Text>
          </View>
          {serieFiltrate.map((s, i) => {
            const caricoPT = s.series_pt?.carico || '–'
            const caricoFatto = s.series_atleta?.carico || '–'
            const ripFatto = s.series_atleta?.ripetizioni || '–'
            const hasDone = s.series_atleta?.carico || s.series_atleta?.ripetizioni
            return (
              <View key={s.id} style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}>
                <Text style={[styles.td, { flex: 0.8 }]}>{s.settimana}</Text>
                <Text style={[styles.td, { flex: 0.8 }]}>{s.sessione}</Text>
                <Text style={[styles.td, { flex: 0.5 }]}>{s.numero}</Text>
                <Text style={[styles.td, { color: '#7eb8ff' }]}>{caricoPT}</Text>
                <Text style={[styles.td, { color: hasDone ? '#52e89e' : '#6B7280' }]}>{caricoFatto}</Text>
                <Text style={[styles.td, { color: hasDone ? '#52e89e' : '#6B7280' }]}>{ripFatto}</Text>
              </View>
            )
          })}
        </View>

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
  statsRow: { flexDirection: 'row', gap: 10, padding: 16 },
  statCard: {
    flex: 1, backgroundColor: '#1e1e24', borderWidth: 1, borderColor: '#2e2e3a',
    borderRadius: 12, padding: 14, alignItems: 'center'
  },
  statVal: { fontSize: 26, fontWeight: '900', color: '#e8ff47', marginBottom: 4 },
  statLbl: { fontSize: 10, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 },
  globalBarWrap: { paddingHorizontal: 16, marginBottom: 20 },
  globalBarBg: {
    height: 8, backgroundColor: '#1e1e24', borderRadius: 4, overflow: 'hidden', marginBottom: 6
  },
  globalBarFill: { height: '100%', backgroundColor: '#e8ff47', borderRadius: 4 },
  globalBarLabel: { fontSize: 12, color: '#9CA3AF', textAlign: 'right' },
  sectionTitle: {
    fontSize: 13, fontWeight: '800', color: '#f0f0f0',
    paddingHorizontal: 16, marginBottom: 12
  },
  exCard: {
    backgroundColor: '#16161a', borderWidth: 1, borderColor: '#2e2e3a',
    borderRadius: 14, marginHorizontal: 16, marginBottom: 12, padding: 16
  },
  exCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  exName: { fontSize: 15, fontWeight: '700', color: '#f0f0f0', flex: 1 },
  exArrow: { fontSize: 16, color: '#6B7280' },
  exStats: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  exStat: { flex: 1, alignItems: 'center' },
  exStatVal: { fontSize: 18, fontWeight: '800', color: '#e8ff47', marginBottom: 2 },
  exStatLbl: { fontSize: 10, color: '#6B7280', fontWeight: '600' },
  progressBarBg: {
    height: 4, backgroundColor: '#2e2e3a', borderRadius: 2, overflow: 'hidden', marginTop: 8
  },
  progressBarFill: { height: '100%', borderRadius: 2 },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: '#f0f0f0', marginBottom: 6 },
  emptyText: { fontSize: 14, color: '#6B7280' },
  filterPill: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: '#1e1e24', borderWidth: 1, borderColor: '#2e2e3a', marginRight: 8
  },
  filterPillActive: { backgroundColor: '#e8ff47', borderColor: '#e8ff47' },
  filterPillText: { fontSize: 12, fontWeight: '600', color: '#9CA3AF' },
  filterPillTextActive: { color: '#000' },
  table: {
    marginHorizontal: 16, backgroundColor: '#16161a',
    borderWidth: 1, borderColor: '#2e2e3a', borderRadius: 12, overflow: 'hidden'
  },
  tableHeader: {
    flexDirection: 'row', backgroundColor: '#1e1e24',
    paddingVertical: 10, paddingHorizontal: 12,
    borderBottomWidth: 1, borderBottomColor: '#2e2e3a'
  },
  th: { flex: 1, fontSize: 10, fontWeight: '700', color: '#6B7280', textAlign: 'center' },
  tableRow: { flexDirection: 'row', paddingVertical: 9, paddingHorizontal: 12 },
  tableRowAlt: { backgroundColor: '#1a1a20' },
  td: { flex: 1, fontSize: 12, color: '#9CA3AF', textAlign: 'center' },
})

const chartStyles = StyleSheet.create({
  wrap: {
    backgroundColor: '#1e1e24', borderWidth: 1, borderColor: '#2e2e3a',
    borderRadius: 12, padding: 14, marginTop: 8
  },
  title: { fontSize: 10, fontWeight: '700', color: '#6B7280', letterSpacing: 0.5, marginBottom: 10 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', height: 80, gap: 4 },
  barCol: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
  barVal: { fontSize: 8, color: '#9CA3AF', marginBottom: 2 },
  barBg: { width: '100%', height: 60, justifyContent: 'flex-end' },
  barFill: { width: '100%', backgroundColor: '#e8ff47', borderRadius: 3, minHeight: 2 },
  barLabel: { fontSize: 8, color: '#6B7280', marginTop: 4 },
})