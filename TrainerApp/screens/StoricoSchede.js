import { useState, useEffect } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView
} from 'react-native'
import { supabase } from '../lib/supabase'

export default function VistaTabella({ onBack, atletaId, numSettimane = 8, numSessioni = 7 }) {
  const [exercises, setExercises] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtroSettimana, setFiltroSettimana] = useState(1)

  useEffect(() => { fetchTuttiDati() }, [filtroSettimana])

  async function fetchTuttiDati() {
    setLoading(true)
    const { data: seriesData } = await supabase.from('series')
      .select(`*, exercises!inner(*), series_pt(*), series_atleta(*)`)
      .eq('exercises.atleta_id', atletaId)
      .eq('settimana', filtroSettimana)
      .order('numero')

    if (!seriesData) { setLoading(false); return }

    // Raggruppa per esercizio poi per sessione
    const exMap = {}
    seriesData.forEach(s => {
      const ex = s.exercises
      if (!exMap[ex.id]) {
        exMap[ex.id] = { ...ex, sessioni: {} }
      }
      if (!exMap[ex.id].sessioni[s.sessione]) {
        exMap[ex.id].sessioni[s.sessione] = []
      }
      exMap[ex.id].sessioni[s.sessione].push({
        id: s.id, numero: s.numero,
        series_pt: s.series_pt, series_atleta: s.series_atleta
      })
    })

    const sorted = Object.values(exMap).sort((a, b) => (a.ordine || 0) - (b.ordine || 0))
    setExercises(sorted)
    setLoading(false)
  }

  const tutteSettimane = Array.from({length: numSettimane}, (_, i) => i + 1)
  const tutteSessioni = Array.from({length: numSessioni}, (_, i) => i + 1)

  // Trova sessioni che hanno dati per questa settimana
  const sessioniConDati = tutteSessioni.filter(s =>
    exercises.some(ex => ex.sessioni[s] && ex.sessioni[s].length > 0)
  )

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>← Scheda</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>👁 Vista Tabella</Text>
        <View style={{ width: 90 }} />
      </View>

      {/* FILTRO SETTIMANA */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.settimaneRow}>
        {tutteSettimane.map(w => (
          <TouchableOpacity key={w}
            style={[styles.settPill, filtroSettimana === w && styles.settPillActive]}
            onPress={() => setFiltroSettimana(w)}>
            <Text style={[styles.settPillText, filtroSettimana === w && styles.settPillTextActive]}>
              S{w}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.loading}>
          <Text style={styles.loadingText}>Caricamento...</Text>
        </View>
      ) : exercises.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyTitle}>Nessun dato</Text>
          <Text style={styles.emptyText}>Nessun esercizio per la settimana {filtroSettimana}</Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          {sessioniConDati.map(sess => (
            <View key={sess} style={styles.sessioneBlock}>
              <View style={styles.sessioneHeader}>
                <Text style={styles.sessioneTitle}>Sessione {sess}</Text>
              </View>

              {/* TABELLA SESSIONE */}
              <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                <View>
                  {/* HEADER TABELLA */}
                  <View style={styles.tableHeader}>
                    <View style={[styles.cell, styles.cellEx]}>
                      <Text style={styles.headerText}>Esercizio</Text>
                    </View>
                    <View style={[styles.cell, styles.cellSerie]}>
                      <Text style={styles.headerText}>#</Text>
                    </View>
                    <View style={styles.cell}>
                      <Text style={styles.headerText}>Car. PT</Text>
                    </View>
                    <View style={styles.cell}>
                      <Text style={styles.headerText}>Rec. PT</Text>
                    </View>
                    <View style={styles.cell}>
                      <Text style={styles.headerText}>Rip. PT</Text>
                    </View>
                    <View style={[styles.cell, styles.cellNote]}>
                      <Text style={styles.headerText}>Note PT</Text>
                    </View>
                    <View style={styles.cellDivider} />
                    <View style={styles.cell}>
                      <Text style={[styles.headerText, { color: '#52e89e' }]}>Car. Fatto</Text>
                    </View>
                    <View style={styles.cell}>
                      <Text style={[styles.headerText, { color: '#52e89e' }]}>Rec.</Text>
                    </View>
                    <View style={styles.cell}>
                      <Text style={[styles.headerText, { color: '#52e89e' }]}>Rip.</Text>
                    </View>
                    <View style={[styles.cell, styles.cellNote]}>
                      <Text style={[styles.headerText, { color: '#52e89e' }]}>Note</Text>
                    </View>
                  </View>

                  {/* RIGHE ESERCIZI */}
                  {exercises
                    .filter(ex => ex.sessioni[sess] && ex.sessioni[sess].length > 0)
                    .map((ex, exIdx) => (
                      ex.sessioni[sess].map((s, si) => (
                        <View key={s.id} style={[
                          styles.tableRow,
                          exIdx % 2 === 0 && styles.tableRowAlt
                        ]}>
                          <View style={[styles.cell, styles.cellEx]}>
                            <Text style={styles.cellExText} numberOfLines={1}>
                              {si === 0 ? ex.nome : ''}
                            </Text>
                          </View>
                          <View style={[styles.cell, styles.cellSerie]}>
                            <Text style={styles.cellText}>{s.numero}</Text>
                          </View>
                          <View style={styles.cell}>
                            <Text style={[styles.cellText, { color: '#7eb8ff' }]}>
                              {s.series_pt?.carico || '–'}
                            </Text>
                          </View>
                          <View style={styles.cell}>
                            <Text style={[styles.cellText, { color: '#7eb8ff' }]}>
                              {s.series_pt?.recupero || '–'}
                            </Text>
                          </View>
                          <View style={styles.cell}>
                            <Text style={[styles.cellText, { color: '#7eb8ff' }]}>
                              {s.series_pt?.ripetizioni || '–'}
                            </Text>
                          </View>
                          <View style={[styles.cell, styles.cellNote]}>
                            <Text style={[styles.cellText, { color: '#7eb8ff' }]} numberOfLines={1}>
                              {s.series_pt?.note || '–'}
                            </Text>
                          </View>
                          <View style={styles.cellDivider} />
                          <View style={styles.cell}>
                            <Text style={[styles.cellText, { color: '#52e89e' }]}>
                              {s.series_atleta?.carico || '–'}
                            </Text>
                          </View>
                          <View style={styles.cell}>
                            <Text style={[styles.cellText, { color: '#52e89e' }]}>
                              {s.series_atleta?.recupero || '–'}
                            </Text>
                          </View>
                          <View style={styles.cell}>
                            <Text style={[styles.cellText, { color: '#52e89e' }]}>
                              {s.series_atleta?.ripetizioni || '–'}
                            </Text>
                          </View>
                          <View style={[styles.cell, styles.cellNote]}>
                            <Text style={[styles.cellText, { color: '#52e89e' }]} numberOfLines={1}>
                              {s.series_atleta?.note || '–'}
                            </Text>
                          </View>
                        </View>
                      ))
                    ))
                  }
                </View>
              </ScrollView>
            </View>
          ))}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0f' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#9CA3AF', fontSize: 16 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#1e1e24'
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#f0f0f0' },
  backBtn: { backgroundColor: '#1e1e24', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, width: 90 },
  backText: { color: '#9CA3AF', fontSize: 13, fontWeight: '600' },
  settimaneRow: {
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#1e1e24',
    flexGrow: 0
  },
  settPill: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: '#1e1e24', borderWidth: 1, borderColor: '#2e2e3a', marginRight: 8
  },
  settPillActive: { backgroundColor: '#e8ff47', borderColor: '#e8ff47' },
  settPillText: { fontSize: 13, fontWeight: '700', color: '#9CA3AF' },
  settPillTextActive: { color: '#000' },
  scroll: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: '#f0f0f0', marginBottom: 6 },
  emptyText: { fontSize: 14, color: '#6B7280' },
  sessioneBlock: { marginBottom: 20 },
  sessioneHeader: {
    backgroundColor: '#1e1e24', paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#2e2e3a'
  },
  sessioneTitle: { fontSize: 13, fontWeight: '800', color: '#e8ff47', letterSpacing: 1 },
  tableHeader: {
    flexDirection: 'row', backgroundColor: '#16161a',
    borderBottomWidth: 2, borderBottomColor: '#2e2e3a'
  },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#1e1e2444' },
  tableRowAlt: { backgroundColor: '#16161a' },
  cell: {
    width: 72, paddingHorizontal: 6, paddingVertical: 8,
    justifyContent: 'center', alignItems: 'center'
  },
  cellEx: { width: 130, alignItems: 'flex-start', paddingLeft: 12 },
  cellSerie: { width: 36 },
  cellNote: { width: 110, alignItems: 'flex-start' },
  cellDivider: { width: 2, backgroundColor: '#2e2e3a' },
  headerText: { fontSize: 10, fontWeight: '700', color: '#6B7280', textAlign: 'center' },
  cellText: { fontSize: 12, color: '#9CA3AF', textAlign: 'center' },
  cellExText: { fontSize: 12, fontWeight: '700', color: '#f0f0f0' },
})