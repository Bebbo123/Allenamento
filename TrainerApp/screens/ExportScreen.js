import { useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView
} from 'react-native'
import { supabase } from '../lib/supabase'

export default function ExportScreen({ onBack, atletaId }) {
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState(null)

  async function fetchTuttiDati() {
    let uid = atletaId
    if (!uid) {
      const { data: { user } } = await supabase.auth.getUser()
      uid = user.id
    }

    const { data: exData } = await supabase.from('exercises')
      .select('*').eq('atleta_id', uid).order('created_at')

    if (!exData || exData.length === 0) return null

    const rows = []

    for (const ex of exData) {
      const { data: seriesData } = await supabase.from('series')
        .select('*, series_pt(*), series_atleta(*)')
        .eq('exercise_id', ex.id)
        .order('settimana').order('sessione').order('numero')

      if (!seriesData) continue

      for (const s of seriesData) {
        rows.push({
          esercizio: ex.nome,
          settimana: s.settimana,
          sessione: s.sessione,
          serie: s.numero,
          carico_pt: s.series_pt?.carico || '',
          recupero_pt: s.series_pt?.recupero || '',
          rip_pt: s.series_pt?.ripetizioni || '',
          note_pt: s.series_pt?.note || '',
          carico_fatto: s.series_atleta?.carico || '',
          recupero_fatto: s.series_atleta?.recupero || '',
          rip_fatto: s.series_atleta?.ripetizioni || '',
          note_fatto: s.series_atleta?.note || '',
        })
      }
    }

    return rows
  }

  function buildCSV(rows) {
    const headers = [
      'Esercizio', 'Settimana', 'Sessione', 'Serie #',
      'Carico PT', 'Recupero PT', 'Ripetizioni PT', 'Note PT',
      'Carico Effettuato', 'Recupero Effettuato', 'Ripetizioni Effettuate', 'Note Atleta'
    ]

    const escape = (v) => `"${String(v || '').replace(/"/g, '""')}"`

    const lines = [
      headers.map(escape).join(','),
      ...rows.map(r => [
        r.esercizio, r.settimana, r.sessione, r.serie,
        r.carico_pt, r.recupero_pt, r.rip_pt, r.note_pt,
        r.carico_fatto, r.recupero_fatto, r.rip_fatto, r.note_fatto
      ].map(escape).join(','))
    ]

    return '\uFEFF' + lines.join('\n') // BOM per Excel
  }

  async function esportaCSV() {
    setLoading(true)
    setMsg(null)

    const rows = await fetchTuttiDati()

    if (!rows || rows.length === 0) {
      setMsg({ tipo: 'errore', testo: 'Nessun dato da esportare.' })
      setLoading(false)
      return
    }

    const csv = buildCSV(rows)

    // Su web usa download link
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `scheda_allenamento_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    setMsg({ tipo: 'ok', testo: `✓ Esportate ${rows.length} righe. File scaricato!` })
    setLoading(false)
  }

  async function esportaRiepilogo() {
    setLoading(true)
    setMsg(null)

    const rows = await fetchTuttiDati()

    if (!rows || rows.length === 0) {
      setMsg({ tipo: 'errore', testo: 'Nessun dato da esportare.' })
      setLoading(false)
      return
    }

    // Raggruppa per esercizio
    const exMap = {}
    rows.forEach(r => {
      if (!exMap[r.esercizio]) {
        exMap[r.esercizio] = {
          nome: r.esercizio,
          totaleSerie: 0,
          serieFatte: 0,
          maxCarico: 0,
          settimane: new Set()
        }
      }
      exMap[r.esercizio].totaleSerie++
      exMap[r.esercizio].settimane.add(r.settimana)
      if (r.carico_fatto || r.rip_fatto) exMap[r.esercizio].serieFatte++
      const c = parseFloat(r.carico_fatto)
      if (!isNaN(c) && c > exMap[r.esercizio].maxCarico) exMap[r.esercizio].maxCarico = c
    })

    const headers = ['Esercizio', 'Settimane', 'Serie Totali', 'Serie Fatte', '% Completamento', 'Carico Massimo (kg)']
    const escape = (v) => `"${String(v || '').replace(/"/g, '""')}"`

    const lines = [
      headers.map(escape).join(','),
      ...Object.values(exMap).map(e => [
        e.nome,
        e.settimane.size,
        e.totaleSerie,
        e.serieFatte,
        e.totaleSerie > 0 ? Math.round(e.serieFatte / e.totaleSerie * 100) + '%' : '0%',
        e.maxCarico > 0 ? e.maxCarico : '–'
      ].map(escape).join(','))
    ]

    const csv = '\uFEFF' + lines.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `riepilogo_allenamento_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    setMsg({ tipo: 'ok', testo: `✓ Riepilogo esportato. File scaricato!` })
    setLoading(false)
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>← Indietro</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>📊 Esporta</Text>
        <View style={{ width: 90 }} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>Come funziona</Text>
          <Text style={styles.infoText}>
            I file vengono scaricati in formato CSV, apribile direttamente in Excel, Numbers o Google Sheets.
            Il file viene scaricato automaticamente sul tuo dispositivo.
          </Text>
        </View>

        {/* EXPORT COMPLETO */}
        <View style={styles.exportCard}>
          <View style={styles.exportIcon}>
            <Text style={styles.exportIconText}>📋</Text>
          </View>
          <View style={styles.exportInfo}>
            <Text style={styles.exportTitle}>Scheda Completa</Text>
            <Text style={styles.exportDesc}>
              Tutte le settimane, sessioni e serie con prescrizione PT e valori effettuati dall'atleta.
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.exportBtn, loading && styles.exportBtnDisabled]}
            onPress={esportaCSV}
            disabled={loading}
          >
            <Text style={styles.exportBtnText}>
              {loading ? '...' : '⬇ Scarica'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* EXPORT RIEPILOGO */}
        <View style={styles.exportCard}>
          <View style={[styles.exportIcon, { backgroundColor: '#52e89e22' }]}>
            <Text style={styles.exportIconText}>📈</Text>
          </View>
          <View style={styles.exportInfo}>
            <Text style={styles.exportTitle}>Riepilogo Progressi</Text>
            <Text style={styles.exportDesc}>
              Un esercizio per riga con carico massimo, serie completate e percentuale di completamento.
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.exportBtn, styles.exportBtnGreen, loading && styles.exportBtnDisabled]}
            onPress={esportaRiepilogo}
            disabled={loading}
          >
            <Text style={styles.exportBtnText}>
              {loading ? '...' : '⬇ Scarica'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* MESSAGGIO */}
        {msg && (
          <View style={[styles.msgBox, msg.tipo === 'ok' ? styles.msgOk : styles.msgErrore]}>
            <Text style={[styles.msgText, msg.tipo === 'ok' ? styles.msgTextOk : styles.msgTextErrore]}>
              {msg.testo}
            </Text>
          </View>
        )}

        {/* ANTEPRIMA COLONNE */}
        <Text style={styles.sectionTitle}>Colonne del file completo</Text>
        <View style={styles.colonneWrap}>
          {[
            'Esercizio', 'Settimana', 'Sessione', 'Serie #',
            'Carico PT', 'Recupero PT', 'Ripetizioni PT', 'Note PT',
            'Carico Effettuato', 'Recupero Effettuato', 'Ripetizioni Effettuate', 'Note Atleta'
          ].map((c, i) => (
            <View key={i} style={[styles.colonna, i < 4 && styles.colonnaBlu]}>
              <Text style={[styles.colonnaText, i < 4 && styles.colonnaTextBlu]}>{c}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0f' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#1e1e24'
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#f0f0f0' },
  backBtn: { backgroundColor: '#1e1e24', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, width: 90 },
  backText: { color: '#9CA3AF', fontSize: 13, fontWeight: '600' },
  scroll: { flex: 1 },
  infoBox: {
    margin: 16, backgroundColor: '#1A56DB22', borderWidth: 1,
    borderColor: '#1A56DB44', borderRadius: 14, padding: 16
  },
  infoTitle: { fontSize: 13, fontWeight: '800', color: '#93C5FD', marginBottom: 6 },
  infoText: { fontSize: 13, color: '#93C5FD', lineHeight: 20 },
  exportCard: {
    backgroundColor: '#16161a', borderWidth: 1, borderColor: '#2e2e3a',
    borderRadius: 14, marginHorizontal: 16, marginBottom: 12,
    padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14
  },
  exportIcon: {
    width: 48, height: 48, borderRadius: 12,
    backgroundColor: '#e8ff4722', justifyContent: 'center', alignItems: 'center'
  },
  exportIconText: { fontSize: 22 },
  exportInfo: { flex: 1 },
  exportTitle: { fontSize: 15, fontWeight: '700', color: '#f0f0f0', marginBottom: 4 },
  exportDesc: { fontSize: 12, color: '#9CA3AF', lineHeight: 18 },
  exportBtn: {
    backgroundColor: '#e8ff47', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center'
  },
  exportBtnGreen: { backgroundColor: '#52e89e' },
  exportBtnDisabled: { opacity: 0.5 },
  exportBtnText: { color: '#000', fontWeight: '800', fontSize: 13 },
  msgBox: {
    marginHorizontal: 16, marginBottom: 12,
    borderRadius: 12, padding: 14, borderWidth: 1
  },
  msgOk: { backgroundColor: '#52e89e22', borderColor: '#52e89e44' },
  msgErrore: { backgroundColor: '#ff3b3b22', borderColor: '#ff3b3b44' },
  msgText: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  msgTextOk: { color: '#52e89e' },
  msgTextErrore: { color: '#ff6b6b' },
  sectionTitle: {
    fontSize: 13, fontWeight: '800', color: '#f0f0f0',
    paddingHorizontal: 16, marginBottom: 12, marginTop: 8
  },
  colonneWrap: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    paddingHorizontal: 16
  },
  colonna: {
    backgroundColor: '#1e1e24', borderWidth: 1, borderColor: '#2e2e3a',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6
  },
  colonnaBlu: { backgroundColor: '#1A56DB22', borderColor: '#1A56DB44' },
  colonnaText: { fontSize: 11, fontWeight: '600', color: '#9CA3AF' },
  colonnaTextBlu: { color: '#93C5FD' },
})