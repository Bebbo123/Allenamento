import streamlit as st
import sqlite3, hashlib, pandas as pd, altair as alt
from datetime import datetime

DB_PATH = "gym_data.db"

# ─────────────────────────── DB ───────────────────────────

def get_conn():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_conn(); c = conn.cursor()
    c.execute("CREATE TABLE IF NOT EXISTS db_version (version INTEGER)")
    version = c.execute("SELECT version FROM db_version").fetchone()
    if version is None or version[0] < 4:
        for t in ["session_entries","routine_days","routines","users","db_version"]:
            c.execute(f"DROP TABLE IF EXISTS {t}")
        c.execute("CREATE TABLE db_version (version INTEGER)")
        c.execute("INSERT INTO db_version VALUES (4)")
        c.execute("""CREATE TABLE users (
            id INTEGER PRIMARY KEY,
            username TEXT UNIQUE,
            password_hash TEXT
        )""")
        c.execute("""CREATE TABLE routines (
            id INTEGER PRIMARY KEY,
            name TEXT,
            weeks INTEGER,
            days_per_week INTEGER,
            created_at TEXT
        )""")
        c.execute("""CREATE TABLE routine_days (
            id INTEGER PRIMARY KEY,
            routine_id INTEGER,
            week INTEGER,
            day INTEGER,
            exercise TEXT,
            target_weight REAL,
            target_sets INTEGER,
            target_reps INTEGER,
            rest_seconds INTEGER,
            coach_notes TEXT,
            FOREIGN KEY(routine_id) REFERENCES routines(id) ON DELETE CASCADE
        )""")
        c.execute("""CREATE TABLE session_entries (
            id INTEGER PRIMARY KEY,
            routine_day_id INTEGER,
            set_number INTEGER,
            entry_date TEXT,
            actual_weight REAL,
            actual_reps INTEGER,
            user_notes TEXT,
            FOREIGN KEY(routine_day_id) REFERENCES routine_days(id) ON DELETE CASCADE
        )""")
        h = hashlib.sha256("admin:admin".encode()).hexdigest()
        c.execute("INSERT OR IGNORE INTO users(username,password_hash) VALUES(?,?)", ("admin", h))
    conn.commit(); conn.close()

def hash_pw(u, p): return hashlib.sha256(f"{u}:{p}".encode()).hexdigest()

def check_login(u, p):
    conn = get_conn(); c = conn.cursor()
    row = c.execute("SELECT * FROM users WHERE username=? AND password_hash=?", (u, hash_pw(u,p))).fetchone()
    conn.close(); return row is not None

def register_user(u, p):
    conn = get_conn(); c = conn.cursor()
    try:
        c.execute("INSERT INTO users(username,password_hash) VALUES(?,?)", (u, hash_pw(u,p)))
        conn.commit(); return True
    except sqlite3.IntegrityError: return False
    finally: conn.close()

def get_all_exercises():
    """Return sorted list of all exercise names ever used."""
    conn = get_conn(); c = conn.cursor()
    rows = c.execute("SELECT DISTINCT exercise FROM routine_days ORDER BY exercise").fetchall()
    conn.close()
    return [r[0] for r in rows]

def create_routine(name, weeks, days_per_week, days_exercises):
    """
    days_exercises: dict {day_num: [{'name','weight','sets','reps','rest','notes'}, ...]}
    Each exercise is replicated for every week.
    """
    conn = get_conn(); c = conn.cursor()
    now = datetime.utcnow().isoformat()
    c.execute("INSERT INTO routines(name,weeks,days_per_week,created_at) VALUES(?,?,?,?)", (name, weeks, days_per_week, now))
    rid = c.lastrowid
    for w in range(1, weeks+1):
        for day_num, exlist in days_exercises.items():
            for ex in exlist:
                c.execute("""INSERT INTO routine_days
                    (routine_id,week,day,exercise,target_weight,target_sets,target_reps,rest_seconds,coach_notes)
                    VALUES(?,?,?,?,?,?,?,?,?)""",
                    (rid, w, day_num, ex['name'], ex['weight'], ex['sets'], ex['reps'], ex['rest'], ex['notes']))
    conn.commit(); conn.close()
    return rid

def get_routines():
    conn = get_conn(); c = conn.cursor()
    rows = c.execute("SELECT * FROM routines ORDER BY id DESC").fetchall()
    conn.close(); return rows

def delete_routine(rid):
    conn = get_conn(); c = conn.cursor()
    c.execute("DELETE FROM routines WHERE id=?", (rid,))
    conn.commit(); conn.close()

def get_days_for_routine(rid):
    conn = get_conn(); c = conn.cursor()
    rows = c.execute("SELECT * FROM routine_days WHERE routine_id=? ORDER BY week,day,id", (rid,)).fetchall()
    conn.close(); return rows

def update_routine_day(rd_id, exercise, target_weight, target_sets, target_reps, rest_seconds, coach_notes):
    conn = get_conn(); c = conn.cursor()
    c.execute("""UPDATE routine_days SET exercise=?,target_weight=?,target_sets=?,target_reps=?,rest_seconds=?,coach_notes=?
                 WHERE id=?""", (exercise, target_weight, target_sets, target_reps, rest_seconds, coach_notes, rd_id))
    conn.commit(); conn.close()

def delete_routine_day(rd_id):
    conn = get_conn(); c = conn.cursor()
    c.execute("DELETE FROM routine_days WHERE id=?", (rd_id,))
    conn.commit(); conn.close()

def add_exercise_to_day(rid, week, day, exercise, target_weight, target_sets, target_reps, rest_seconds, coach_notes):
    conn = get_conn(); c = conn.cursor()
    c.execute("""INSERT INTO routine_days(routine_id,week,day,exercise,target_weight,target_sets,target_reps,rest_seconds,coach_notes)
                 VALUES(?,?,?,?,?,?,?,?,?)""",
              (rid, week, day, exercise, target_weight, target_sets, target_reps, rest_seconds, coach_notes))
    conn.commit(); conn.close()

def save_entry(routine_day_id, set_number, actual_weight, actual_reps, user_notes):
    conn = get_conn(); c = conn.cursor()
    today = datetime.utcnow().strftime("%Y-%m-%d")
    c.execute("""INSERT INTO session_entries(routine_day_id,set_number,entry_date,actual_weight,actual_reps,user_notes)
                 VALUES(?,?,?,?,?,?)""", (routine_day_id, set_number, today, actual_weight, actual_reps, user_notes))
    conn.commit(); conn.close()

def get_last_entries(routine_day_id):
    conn = get_conn(); c = conn.cursor()
    rows = c.execute("""SELECT * FROM session_entries WHERE routine_day_id=? ORDER BY entry_date DESC, set_number""",
                     (routine_day_id,)).fetchall()
    if rows:
        latest = rows[0]['entry_date']
        return [r for r in rows if r['entry_date'] == latest]
    return []

def get_progress(rid):
    days = get_days_for_routine(rid)
    total_days = len(set((d['week'], d['day']) for d in days))
    conn = get_conn(); c = conn.cursor()
    done = c.execute("""SELECT COUNT(DISTINCT rd.week || '-' || rd.day) FROM routine_days rd
                        JOIN session_entries se ON rd.id=se.routine_day_id
                        WHERE rd.routine_id=?""", (rid,)).fetchone()[0]
    conn.close()
    return done, total_days

def get_pr_history(exercise):
    conn = get_conn(); c = conn.cursor()
    df = pd.DataFrame(c.execute("""SELECT d.exercise, s.entry_date, s.actual_weight FROM session_entries s
           JOIN routine_days d ON s.routine_day_id=d.id WHERE d.exercise=? ORDER BY s.entry_date""",
           (exercise,)).fetchall())
    conn.close()
    if df.empty: return None
    df.columns = ["exercise","entry_date","actual_weight"]
    df["entry_date"] = pd.to_datetime(df["entry_date"])
    return df.groupby("entry_date")["actual_weight"].max().reset_index()

def safe_rerun():
    try: st.rerun()
    except: pass

# ─────────────────────────── UI SETUP ───────────────────────────

st.set_page_config(page_title="Gym Tracker", layout="wide", initial_sidebar_state="expanded")
init_db()

# Custom CSS
st.markdown("""
<style>
    /* Main theme */
    .main { background: #0a0a0f; }
    .stApp { background: #0a0a0f; color: #e8e8e0; }
    
    /* Cards */
    .card {
        background: #13131a;
        border: 1px solid #2a2a3a;
        border-radius: 12px;
        padding: 20px;
        margin-bottom: 16px;
    }
    .card-accent {
        background: linear-gradient(135deg, #13131a, #1a1a2e);
        border: 1px solid #3a3a5c;
        border-radius: 12px;
        padding: 20px;
        margin-bottom: 16px;
    }
    
    /* Section headers */
    .section-header {
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 3px;
        text-transform: uppercase;
        color: #6c63ff;
        margin-bottom: 8px;
    }
    .section-title {
        font-size: 28px;
        font-weight: 800;
        color: #e8e8e0;
        margin-bottom: 4px;
    }
    
    /* Exercise pill */
    .exercise-header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 12px;
    }
    .exercise-badge {
        background: #6c63ff22;
        border: 1px solid #6c63ff55;
        border-radius: 20px;
        padding: 4px 14px;
        font-size: 12px;
        color: #a89cff;
        font-weight: 600;
        letter-spacing: 1px;
    }
    .exercise-name {
        font-size: 20px;
        font-weight: 700;
        color: #e8e8e0;
    }
    
    /* Target stats row */
    .stats-row {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        margin-bottom: 16px;
    }
    .stat-chip {
        background: #1e1e2e;
        border: 1px solid #2a2a3a;
        border-radius: 8px;
        padding: 8px 14px;
        text-align: center;
    }
    .stat-chip .value { font-size: 18px; font-weight: 700; color: #6c63ff; }
    .stat-chip .label { font-size: 11px; color: #888; letter-spacing: 1px; text-transform: uppercase; }
    
    /* Set row */
    .set-container {
        background: #0f0f18;
        border: 1px solid #1e1e30;
        border-radius: 10px;
        padding: 14px 16px;
        margin-bottom: 10px;
    }
    .set-number {
        font-size: 12px;
        font-weight: 700;
        color: #6c63ff;
        letter-spacing: 2px;
        text-transform: uppercase;
        margin-bottom: 8px;
    }
    
    /* Day header */
    .day-header {
        background: linear-gradient(90deg, #6c63ff22, transparent);
        border-left: 3px solid #6c63ff;
        padding: 12px 16px;
        border-radius: 0 8px 8px 0;
        margin-bottom: 16px;
    }
    .day-title {
        font-size: 18px;
        font-weight: 700;
        color: #e8e8e0;
    }
    .day-subtitle {
        font-size: 13px;
        color: #888;
    }
    
    /* Previous session box */
    .prev-session {
        background: #0d1a0d;
        border: 1px solid #1a3a1a;
        border-radius: 8px;
        padding: 10px 14px;
        margin-bottom: 12px;
    }
    .prev-title {
        font-size: 11px;
        color: #4caf50;
        font-weight: 700;
        letter-spacing: 2px;
        text-transform: uppercase;
        margin-bottom: 6px;
    }
    
    /* Divider */
    .section-divider {
        border: none;
        border-top: 1px solid #2a2a3a;
        margin: 24px 0;
    }
    
    /* Progress bar override */
    .stProgress > div > div { background: #6c63ff !important; }
    
    /* Buttons */
    .stButton > button {
        border-radius: 8px;
        font-weight: 600;
        letter-spacing: 0.5px;
    }
    
    /* Coach notes */
    .coach-note {
        background: #1a1500;
        border: 1px solid #3a3000;
        border-radius: 8px;
        padding: 10px 14px;
        font-size: 13px;
        color: #c8b800;
        font-style: italic;
        margin-bottom: 12px;
    }
    .coach-note-label {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 2px;
        color: #886a00;
        margin-bottom: 3px;
    }
</style>
""", unsafe_allow_html=True)

# ─────────────────────────── AUTH ───────────────────────────

if "logged_in" not in st.session_state: st.session_state.logged_in = False
if "user" not in st.session_state: st.session_state.user = None

if not st.session_state.logged_in:
    st.markdown('<div class="section-header">BENVENUTO</div>', unsafe_allow_html=True)
    st.markdown('<div class="section-title">Gym Tracker 🏋️</div>', unsafe_allow_html=True)
    st.markdown("<br>", unsafe_allow_html=True)
    login_col, reg_col = st.columns(2)
    with login_col:
        st.subheader("Accedi")
        username = st.text_input("Username", key="u1")
        password = st.text_input("Password", type="password", key="p1")
        if st.button("Entra →", type="primary", use_container_width=True):
            if check_login(username, password):
                st.session_state.logged_in = True; st.session_state.user = username
                safe_rerun()
            else:
                st.error("Credenziali errate")
    with reg_col:
        st.subheader("Registrati")
        ru = st.text_input("Nuovo username", key="u2")
        rp = st.text_input("Nuova password", type="password", key="p2")
        if st.button("Crea account", use_container_width=True):
            ok = register_user(ru, rp)
            st.success("Account creato!" if ok else "Username già esistente")
    st.stop()

# ─────────────────────────── SIDEBAR ───────────────────────────

st.sidebar.markdown(f"**👤 {st.session_state.user}**")
if st.sidebar.button("Logout"):
    st.session_state.logged_in = False; st.session_state.user = None; safe_rerun()

st.sidebar.divider()
page = st.sidebar.radio("Navigazione", ["🏠 Home", "📋 Crea Scheda", "🏃 Esegui Allenamento", "📈 Statistiche"])

routines = get_routines()

# ═══════════════════════════════════════════════════════════════
#  HOME
# ═══════════════════════════════════════════════════════════════
if page == "🏠 Home":
    st.markdown('<div class="section-header">PANNELLO PRINCIPALE</div>', unsafe_allow_html=True)
    st.markdown('<div class="section-title">Gym Tracker</div>', unsafe_allow_html=True)
    st.markdown("<br>", unsafe_allow_html=True)
    
    if not routines:
        st.info("Non hai ancora nessuna scheda. Vai su **Crea Scheda** per iniziare!")
    else:
        for r in routines:
            done, total = get_progress(r['id'])
            pct = done / total if total > 0 else 0
            with st.container():
                st.markdown(f"""
                <div class="card-accent">
                    <div style="font-size:18px;font-weight:700;color:#e8e8e0;margin-bottom:4px">{r['name']}</div>
                    <div style="font-size:13px;color:#888;margin-bottom:12px">
                        {r['weeks']} settimane · {r['days_per_week']} giorni/settimana · 
                        Creata il {r['created_at'][:10]}
                    </div>
                    <div style="font-size:13px;color:#aaa">{done} / {total} giorni completati</div>
                </div>
                """, unsafe_allow_html=True)
                st.progress(pct)
                col1, col2 = st.columns([1, 4])
                with col1:
                    if st.button("🗑️ Elimina", key=f"del_{r['id']}"):
                        delete_routine(r['id'])
                        safe_rerun()
                st.markdown("<br>", unsafe_allow_html=True)


# ═══════════════════════════════════════════════════════════════
#  CREA SCHEDA
# ═══════════════════════════════════════════════════════════════
elif page == "📋 Crea Scheda":
    st.markdown('<div class="section-header">CONFIGURAZIONE</div>', unsafe_allow_html=True)
    st.markdown('<div class="section-title">Crea nuova scheda</div>', unsafe_allow_html=True)
    st.markdown("<br>", unsafe_allow_html=True)

    # Init session state for builder
    if "builder_days" not in st.session_state:
        st.session_state.builder_days = {}  # {day_num: [exercises]}

    # ── Parametri base ──
    col1, col2, col3 = st.columns(3)
    with col1: rn = st.text_input("Nome scheda", value="Scheda A", key="rname")
    with col2: weeks = st.number_input("Settimane", min_value=1, max_value=52, value=4, key="rweeks")
    with col3: days_per_week = st.number_input("Giorni/settimana", min_value=1, max_value=7, value=3, key="rdpw")

    st.markdown('<hr class="section-divider">', unsafe_allow_html=True)

    # Sincronizza i giorni quando cambia days_per_week
    current_days = int(days_per_week)
    # Rimuovi giorni in eccesso
    for k in list(st.session_state.builder_days.keys()):
        if k > current_days:
            del st.session_state.builder_days[k]
    # Aggiungi giorni mancanti
    for d in range(1, current_days + 1):
        if d not in st.session_state.builder_days:
            st.session_state.builder_days[d] = []

    st.markdown('<div class="section-header">ESERCIZI PER GIORNO</div>', unsafe_allow_html=True)
    st.caption("Configura gli esercizi per ogni giorno di allenamento. Verranno replicati per tutte le settimane.")

    existing_exercises = get_all_exercises()

    for day_num in range(1, current_days + 1):
        st.markdown(f"""
        <div class="day-header">
            <div class="day-title">Giorno {day_num}</div>
            <div class="day-subtitle">{len(st.session_state.builder_days[day_num])} esercizi configurati</div>
        </div>
        """, unsafe_allow_html=True)

        exercises = st.session_state.builder_days[day_num]

        for i, ex in enumerate(exercises):
            with st.container():
                st.markdown(f'<div class="card">', unsafe_allow_html=True)
                
                # Nome esercizio — con selectbox + opzione custom
                col_name, col_del = st.columns([5, 1])
                with col_name:
                    options = ["✏️ Digita nuovo esercizio..."] + existing_exercises
                    sel = st.selectbox(
                        f"Esercizio {i+1}",
                        options=options,
                        index=options.index(ex['name']) if ex['name'] in options else 0,
                        key=f"d{day_num}_ex_sel_{i}"
                    )
                    if sel == "✏️ Digita nuovo esercizio...":
                        ex['name'] = st.text_input(
                            "Nome esercizio",
                            value=ex.get('custom_name', ''),
                            placeholder="es. Curl con bilanciere",
                            key=f"d{day_num}_ex_name_{i}"
                        )
                        ex['custom_name'] = ex['name']
                    else:
                        ex['name'] = sel

                with col_del:
                    st.markdown("<br>", unsafe_allow_html=True)
                    if st.button("✕", key=f"d{day_num}_del_{i}", help="Rimuovi esercizio"):
                        exercises.pop(i)
                        safe_rerun()

                # Parametri in una riga
                c1, c2, c3, c4 = st.columns(4)
                with c1: ex['sets'] = st.number_input("Serie", min_value=1, max_value=20, value=ex.get('sets', 3), key=f"d{day_num}_sets_{i}")
                with c2: ex['reps'] = st.number_input("Reps target", min_value=1, max_value=100, value=ex.get('reps', 8), key=f"d{day_num}_reps_{i}")
                with c3: ex['rest'] = st.number_input("Riposo (sec)", min_value=0, max_value=600, value=ex.get('rest', 90), step=15, key=f"d{day_num}_rest_{i}")
                with c4: ex['weight'] = st.number_input("Peso target (kg)", min_value=0.0, value=ex.get('weight', 0.0), step=0.5, format="%.1f", key=f"d{day_num}_w_{i}")
                
                ex['notes'] = st.text_area(
                    "Note del coach (opzionale)",
                    value=ex.get('notes', ''),
                    height=60,
                    placeholder="es. Mantieni la schiena dritta, vai lento nella fase eccentrica...",
                    key=f"d{day_num}_notes_{i}"
                )
                
                st.markdown('</div>', unsafe_allow_html=True)

        if st.button(f"＋ Aggiungi esercizio al Giorno {day_num}", key=f"add_ex_day_{day_num}", use_container_width=True):
            exercises.append({'name': '', 'sets': 3, 'reps': 8, 'rest': 90, 'weight': 0.0, 'notes': ''})
            safe_rerun()

        if day_num < current_days:
            st.markdown('<hr class="section-divider">', unsafe_allow_html=True)

    st.markdown('<hr class="section-divider">', unsafe_allow_html=True)

    # ── Bottone crea ──
    all_filled = all(
        ex['name'].strip()
        for d_exs in st.session_state.builder_days.values()
        for ex in d_exs
    )
    any_exercise = any(len(exs) > 0 for exs in st.session_state.builder_days.values())

    if not any_exercise:
        st.warning("Aggiungi almeno un esercizio per creare la scheda.")
    elif not all_filled:
        st.warning("Tutti gli esercizi devono avere un nome prima di salvare.")
    else:
        if st.button("✅ Crea scheda", type="primary", use_container_width=True):
            rid = create_routine(rn, int(weeks), current_days, st.session_state.builder_days)
            st.success(f"Scheda **{rn}** creata con successo! ({int(weeks)} settimane × {current_days} giorni)")
            st.session_state.builder_days = {}
            safe_rerun()


# ═══════════════════════════════════════════════════════════════
#  ESEGUI ALLENAMENTO
# ═══════════════════════════════════════════════════════════════
elif page == "🏃 Esegui Allenamento":
    st.markdown('<div class="section-header">ALLENAMENTO</div>', unsafe_allow_html=True)
    st.markdown('<div class="section-title">Esegui allenamento</div>', unsafe_allow_html=True)
    st.markdown("<br>", unsafe_allow_html=True)

    if not routines:
        st.warning("Nessuna scheda disponibile. Crea prima una scheda!")
        st.stop()

    # Selezione scheda
    routine_options = {f"{r['id']} — {r['name']}": r['id'] for r in routines}
    sel_routine_label = st.selectbox("Seleziona scheda", options=list(routine_options.keys()), key="exec_routine")
    rid = routine_options[sel_routine_label]

    all_days = get_days_for_routine(rid)
    if not all_days:
        st.info("Questa scheda non ha esercizi.")
        st.stop()

    done, total = get_progress(rid)
    pct = done / total if total > 0 else 0
    st.progress(pct)
    st.caption(f"Progresso scheda: **{done}/{total}** giorni completati ({int(pct*100)}%)")

    # Raggruppa per settimana e giorno
    grouped = {}
    for d in all_days:
        key = (d['week'], d['day'])
        if key not in grouped: grouped[key] = []
        grouped[key].append(d)

    # Selezione settimana e giorno
    weeks_available = sorted(set(k[0] for k in grouped.keys()))
    sel_week = st.selectbox("Settimana", options=weeks_available, format_func=lambda w: f"Settimana {w}", key="exec_week")

    days_in_week = sorted(set(k[1] for k in grouped.keys() if k[0] == sel_week))
    sel_day = st.selectbox("Giorno", options=days_in_week, format_func=lambda d: f"Giorno {d}", key="exec_day")

    exercises_today = grouped.get((sel_week, sel_day), [])

    st.markdown('<hr class="section-divider">', unsafe_allow_html=True)

    st.markdown(f"""
    <div class="day-header">
        <div class="day-title">📅 Settimana {sel_week} — Giorno {sel_day}</div>
        <div class="day-subtitle">{len(exercises_today)} esercizi · Oggi: {datetime.now().strftime("%d/%m/%Y")}</div>
    </div>
    """, unsafe_allow_html=True)

    # ── Ogni esercizio ──
    for ex in exercises_today:
        st.markdown(f"""
        <div class="exercise-header">
            <span class="exercise-name">{ex['exercise']}</span>
            <span class="exercise-badge">ESERCIZIO</span>
        </div>
        """, unsafe_allow_html=True)

        # Target stats chips
        weight_display = f"{ex['target_weight']:.1f} kg" if ex['target_weight'] > 0 else "—"
        st.markdown(f"""
        <div class="stats-row">
            <div class="stat-chip">
                <div class="value">{ex['target_sets']}</div>
                <div class="label">Serie</div>
            </div>
            <div class="stat-chip">
                <div class="value">{ex['target_reps']}</div>
                <div class="label">Reps</div>
            </div>
            <div class="stat-chip">
                <div class="value">{weight_display}</div>
                <div class="label">Peso target</div>
            </div>
            <div class="stat-chip">
                <div class="value">{ex['rest_seconds']}s</div>
                <div class="label">Riposo</div>
            </div>
        </div>
        """, unsafe_allow_html=True)

        # Note coach
        if ex['coach_notes'] and ex['coach_notes'].strip():
            st.markdown(f"""
            <div class="coach-note">
                <div class="coach-note-label">📝 Note del coach</div>
                {ex['coach_notes']}
            </div>
            """, unsafe_allow_html=True)

        # Sessione precedente
        last_entries = get_last_entries(ex['id'])
        if last_entries:
            prev_date = last_entries[0]['entry_date']
            st.markdown(f"""
            <div class="prev-session">
                <div class="prev-title">✅ Ultima sessione ({prev_date})</div>
                {''.join([f'<span style="color:#88c88a;font-size:13px;margin-right:12px">Set {e["set_number"]}: {e["actual_weight"]}kg × {e["actual_reps"]} reps</span>' for e in last_entries])}
            </div>
            """, unsafe_allow_html=True)

        # ── Log delle serie effettive ──
        st.markdown(f'<div class="section-header">LOG SERIE — {ex["exercise"].upper()}</div>', unsafe_allow_html=True)

        last_map = {e['set_number']: e for e in last_entries}

        for set_num in range(1, ex['target_sets'] + 1):
            last = last_map.get(set_num)
            
            st.markdown(f'<div class="set-container">', unsafe_allow_html=True)
            st.markdown(f'<div class="set-number">SET {set_num} / {ex["target_sets"]}</div>', unsafe_allow_html=True)

            c1, c2, c3 = st.columns([2, 2, 3])
            with c1:
                default_w = float(last['actual_weight']) if last else (ex['target_weight'] or 0.0)
                ae = st.number_input(
                    f"Peso effettivo (kg)",
                    min_value=0.0, step=0.5, format="%.1f",
                    value=default_w,
                    key=f"aw_{ex['id']}_{set_num}"
                )
            with c2:
                default_r = int(last['actual_reps']) if last else ex['target_reps']
                ar = st.number_input(
                    f"Reps effettive",
                    min_value=0, step=1,
                    value=default_r,
                    key=f"ar_{ex['id']}_{set_num}"
                )
            with c3:
                un = st.text_input(
                    "Note (opzionale)",
                    value=last['user_notes'] if last else '',
                    placeholder="es. facile, sentivo il muscolo...",
                    key=f"un_{ex['id']}_{set_num}"
                )

            if st.button(f"💾 Salva Set {set_num}", key=f"save_{ex['id']}_{set_num}"):
                save_entry(ex['id'], set_num, ae, ar, un)
                st.success(f"Set {set_num} salvato! {ae}kg × {ar} reps")

            st.markdown('</div>', unsafe_allow_html=True)

        # Bottone copia sessione precedente
        if last_entries:
            if st.button(f"📋 Copia ultima sessione identica", key=f"cpy_{ex['id']}"):
                for last in last_entries:
                    save_entry(ex['id'], last['set_number'], last['actual_weight'], last['actual_reps'], last['user_notes'])
                st.success("Sessione precedente copiata!")

        # Modifica esercizio (collassato)
        with st.expander(f"⚙️ Modifica parametri — {ex['exercise']}"):
            ec1, ec2, ec3, ec4 = st.columns(4)
            ex_name_edit = st.text_input("Nome esercizio", value=ex['exercise'], key=f"edit_name_{ex['id']}")
            with ec1: new_sets = st.number_input("Serie", value=ex['target_sets'], min_value=1, key=f"edit_sets_{ex['id']}")
            with ec2: new_reps = st.number_input("Reps", value=ex['target_reps'], min_value=1, key=f"edit_reps_{ex['id']}")
            with ec3: new_rest = st.number_input("Riposo (sec)", value=ex['rest_seconds'], min_value=0, key=f"edit_rest_{ex['id']}")
            with ec4: new_w = st.number_input("Peso target", value=ex['target_weight'], min_value=0.0, step=0.5, format="%.1f", key=f"edit_w_{ex['id']}")
            new_notes = st.text_area("Note coach", value=ex['coach_notes'] or '', height=70, key=f"edit_notes_{ex['id']}")
            
            col_save, col_del = st.columns([2,1])
            with col_save:
                if st.button("💾 Aggiorna", key=f"upd_{ex['id']}", type="primary"):
                    update_routine_day(ex['id'], ex_name_edit, new_w, new_sets, new_reps, new_rest, new_notes)
                    st.success("Aggiornato!")
                    safe_rerun()
            with col_del:
                if st.button("🗑️ Elimina esercizio", key=f"del_ex_{ex['id']}"):
                    delete_routine_day(ex['id'])
                    st.warning("Esercizio eliminato")
                    safe_rerun()

        st.markdown('<hr class="section-divider">', unsafe_allow_html=True)

    # Aggiungi esercizio a questo giorno
    with st.expander(f"＋ Aggiungi esercizio a Settimana {sel_week} — Giorno {sel_day}"):
        existing_exercises = get_all_exercises()
        options = ["✏️ Digita nuovo esercizio..."] + existing_exercises
        new_sel = st.selectbox("Esercizio", options=options, key=f"add_sel_{sel_week}_{sel_day}")
        if new_sel == "✏️ Digita nuovo esercizio...":
            new_ex_name = st.text_input("Nome esercizio", key=f"add_name_{sel_week}_{sel_day}")
        else:
            new_ex_name = new_sel

        nc1, nc2, nc3, nc4 = st.columns(4)
        with nc1: new_ts = st.number_input("Serie", min_value=1, value=3, key=f"add_ts_{sel_week}_{sel_day}")
        with nc2: new_tr = st.number_input("Reps target", min_value=1, value=8, key=f"add_tr_{sel_week}_{sel_day}")
        with nc3: new_rs = st.number_input("Riposo (sec)", min_value=0, value=90, key=f"add_rs_{sel_week}_{sel_day}")
        with nc4: new_tw = st.number_input("Peso target (kg)", min_value=0.0, value=0.0, step=0.5, format="%.1f", key=f"add_tw_{sel_week}_{sel_day}")
        new_cn = st.text_area("Note coach", height=60, key=f"add_cn_{sel_week}_{sel_day}")

        if st.button("Aggiungi esercizio", type="primary", key=f"add_ex_exec_{sel_week}_{sel_day}"):
            if new_ex_name and new_ex_name.strip():
                add_exercise_to_day(rid, sel_week, sel_day, new_ex_name.strip(), new_tw, new_ts, new_tr, new_rs, new_cn)
                st.success(f"Esercizio **{new_ex_name}** aggiunto!")
                safe_rerun()
            else:
                st.error("Inserisci un nome per l'esercizio")


# ═══════════════════════════════════════════════════════════════
#  STATISTICHE
# ═══════════════════════════════════════════════════════════════
elif page == "📈 Statistiche":
    st.markdown('<div class="section-header">ANALISI</div>', unsafe_allow_html=True)
    st.markdown('<div class="section-title">Statistiche & PR</div>', unsafe_allow_html=True)
    st.markdown("<br>", unsafe_allow_html=True)

    if not routines:
        st.info("Nessuna scheda trovata.")
        st.stop()

    # Raccoglie tutti gli esercizi da tutte le schede
    all_exercises_all_routines = []
    for r in routines:
        for d in get_days_for_routine(r['id']):
            all_exercises_all_routines.append(d['exercise'])
    exercise_options = sorted(set(all_exercises_all_routines))

    if not exercise_options:
        st.info("Nessun esercizio trovato nelle schede.")
        st.stop()

    sel_ex = st.selectbox("Seleziona esercizio", exercise_options)
    pr = get_pr_history(sel_ex)

    if pr is None or pr.empty:
        st.info(f"Ancora nessun dato registrato per **{sel_ex}**.")
    else:
        max_weight = pr['actual_weight'].max()
        latest_weight = pr.iloc[-1]['actual_weight']
        sessions_count = len(pr)

        c1, c2, c3 = st.columns(3)
        c1.metric("🏆 PR Massimo", f"{max_weight} kg")
        c2.metric("📅 Ultimo carico", f"{latest_weight} kg")
        c3.metric("📊 Sessioni", sessions_count)

        chart = alt.Chart(pr).mark_line(
            point=alt.OverlayMarkDef(color="#6c63ff", size=80),
            color="#6c63ff",
            strokeWidth=2
        ).encode(
            x=alt.X('entry_date:T', title='Data'),
            y=alt.Y('actual_weight:Q', title='Peso (kg)'),
            tooltip=['entry_date:T', 'actual_weight:Q']
        ).properties(
            height=300,
            title=f"Storico carico — {sel_ex}",
            background="#13131a"
        ).configure_axis(
            gridColor="#2a2a3a",
            labelColor="#888",
            titleColor="#888"
        ).configure_title(
            color="#e8e8e0"
        )
        st.altair_chart(chart, use_container_width=True)