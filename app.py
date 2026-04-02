import streamlit as st
import sqlite3, hashlib, os, pandas as pd, altair as alt
from datetime import datetime

DB_PATH = "gym_data.db"

def get_conn():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_conn()
    c = conn.cursor()
    # Check version
    c.execute("CREATE TABLE IF NOT EXISTS db_version (version INTEGER)")
    version = c.execute("SELECT version FROM db_version").fetchone()
    if version is None or version[0] < 3:
        # Drop old tables and recreate
        c.execute("DROP TABLE IF EXISTS session_entries")
        c.execute("DROP TABLE IF EXISTS routine_days")
        c.execute("DROP TABLE IF EXISTS routines")
        c.execute("DROP TABLE IF EXISTS users")
        c.execute("DROP TABLE IF EXISTS db_version")
        # Recreate
        c.execute("CREATE TABLE db_version (version INTEGER)")
        c.execute("INSERT INTO db_version VALUES (3)")
        c.execute("""CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY,
                    username TEXT UNIQUE,
                    password_hash TEXT
                    )""")
        c.execute("""CREATE TABLE IF NOT EXISTS routines (
                    id INTEGER PRIMARY KEY,
                    name TEXT,
                    weeks INTEGER,
                    days_per_week INTEGER,
                    created_at TEXT
                    )""")
        c.execute("""CREATE TABLE IF NOT EXISTS routine_days (
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
                    UNIQUE(routine_id, week, day, exercise),
                    FOREIGN KEY(routine_id) REFERENCES routines(id) ON DELETE CASCADE
                    )""")
        c.execute("""CREATE TABLE IF NOT EXISTS session_entries (
                    id INTEGER PRIMARY KEY,
                    routine_day_id INTEGER,
                    set_number INTEGER,
                    entry_date TEXT,
                    actual_weight REAL,
                    actual_reps INTEGER,
                    user_notes TEXT,
                    FOREIGN KEY(routine_day_id) REFERENCES routine_days(id) ON DELETE CASCADE
                    )""")
        # Default user
        hard = hashlib.sha256("admin:admin".encode()).hexdigest()
        c.execute("INSERT OR IGNORE INTO users(username,password_hash) VALUES(?,?)", ("admin", hard))
    conn.commit()
    conn.close()

def hash_pw(username, password):
    return hashlib.sha256(f"{username}:{password}".encode()).hexdigest()

def check_login(username, password):
    conn = get_conn(); c=conn.cursor()
    pw = hash_pw(username, password)
    row = c.execute("SELECT * FROM users WHERE username=? AND password_hash=?", (username, pw)).fetchone()
    conn.close()
    return row is not None

def register_user(username, password):
    conn = get_conn(); c = conn.cursor()
    h = hash_pw(username, password)
    try:
        c.execute("INSERT INTO users(username,password_hash) VALUES (?, ?)", (username,h))
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        return False
    finally:
        conn.close()

def create_routine(name, weeks, days):
    conn = get_conn(); c = conn.cursor()
    now = datetime.utcnow().isoformat()
    c.execute("INSERT INTO routines(name,weeks,days_per_week,created_at) VALUES(?,?,?,?)", (name, weeks, days, now))
    rid = c.lastrowid
    for w in range(1, weeks+1):
        for d in range(1, days+1):
            exercises = ["Squat", "Bench Press", "Deadlift"]
            for ex in exercises:
                c.execute("""INSERT INTO routine_days(
                            routine_id,week,day,exercise,target_weight,target_sets,target_reps,rest_seconds,coach_notes
                            ) VALUES(?,?,?,?,?,?,?,?,?)""",
                          (rid, w, d, ex, 50.0, 3, 8, 90, f"Coach note for {ex} W{w}D{d}"))
    conn.commit(); conn.close()
    return rid

def get_routines():
    conn = get_conn(); c = conn.cursor()
    rows = c.execute("SELECT * FROM routines ORDER BY id DESC").fetchall()
    conn.close(); return rows

def get_days_for_routine(routine_id):
    conn = get_conn(); c = conn.cursor()
    rows = c.execute("SELECT * FROM routine_days WHERE routine_id=? ORDER BY week, day", (routine_id,)).fetchall()
    conn.close(); return rows

def save_day(routine_day_id, target_weight, target_sets, target_reps, rest_seconds, coach_notes):
    conn = get_conn(); c = conn.cursor()
    c.execute("""UPDATE routine_days SET target_weight=?, target_sets=?, target_reps=?, rest_seconds=?, coach_notes=? 
                 WHERE id=?""", (target_weight, target_sets, target_reps, rest_seconds, coach_notes, routine_day_id))
    conn.commit(); conn.close()

def save_entry(routine_day_id, set_number, actual_weight, actual_reps, user_notes):
    conn = get_conn(); c = conn.cursor()
    today = datetime.utcnow().strftime("%Y-%m-%d")
    c.execute("""INSERT INTO session_entries(routine_day_id,set_number,entry_date,actual_weight,actual_reps,user_notes)
                 VALUES(?,?,?,?,?,?)""", (routine_day_id, set_number, today, actual_weight, actual_reps, user_notes))
    conn.commit(); conn.close()

def get_last_entries(routine_day_id):
    conn = get_conn(); c = conn.cursor()
    rows = c.execute("""SELECT * FROM session_entries WHERE routine_day_id=? ORDER BY entry_date DESC, set_number""", (routine_day_id,)).fetchall()
    # Group by date, take latest date
    if rows:
        latest_date = rows[0]['entry_date']
        return [r for r in rows if r['entry_date'] == latest_date]
    return []

def copy_last_session(routine_day_id):
    lasts = get_last_entries(routine_day_id)
    if lasts:
        for last in lasts:
            save_entry(routine_day_id, last["set_number"], last["actual_weight"], last["actual_reps"], last["user_notes"])
        return True
    return False

def get_progress(routine_id):
    days = get_days_for_routine(routine_id)
    total_days = len(set((d['week'], d['day']) for d in days))
    conn = get_conn(); c = conn.cursor()
    completed_days = c.execute("""SELECT COUNT(DISTINCT rd.week || '-' || rd.day) FROM routine_days rd
                                   JOIN session_entries se ON rd.id = se.routine_day_id
                                   WHERE rd.routine_id=?""", (routine_id,)).fetchone()[0]
    conn.close()
    return completed_days, total_days

def get_pr_history(exercise):
    conn = get_conn(); c = conn.cursor()
    q = """SELECT d.exercise, s.entry_date, s.actual_weight FROM session_entries s
           JOIN routine_days d ON s.routine_day_id = d.id
           WHERE d.exercise = ?
           ORDER BY s.entry_date"""
    df = pd.DataFrame(c.execute(q, (exercise,)).fetchall())
    conn.close()
    if df.empty: return None
    df.columns = ["exercise", "entry_date", "actual_weight"]
    df["entry_date"] = pd.to_datetime(df["entry_date"])
    return df.groupby("entry_date")["actual_weight"].max().reset_index()


def safe_rerun():
    try:
        st.experimental_rerun()
    except Exception:
        # in some Streamlit versions / Cloud contexts this may be non-disponible
        pass

#### App UI
st.set_page_config(page_title="Gym Tracker", layout="wide", initial_sidebar_state="expanded")

init_db()

if "logged_in" not in st.session_state: st.session_state.logged_in = False
if "user" not in st.session_state: st.session_state.user = None

if not st.session_state.logged_in:
    st.title("Gym Tracker 🏋️")
    login_col, reg_col = st.columns(2)
    with login_col:
        st.subheader("Login")
        username = st.text_input("Username", key="u1")
        password = st.text_input("Password", type="password", key="p1")
        if st.button("Entra"):
            if check_login(username, password):
                st.session_state.logged_in = True; st.session_state.user = username
                safe_rerun()
            else:
                st.error("Credenziali errate")
    with reg_col:
        st.subheader("Registrazione")
        ru = st.text_input("Nuovo username", key="u2")
        rp = st.text_input("Nuova password", type="password", key="p2")
        if st.button("Registra"):
            ok = register_user(ru, rp)
            st.success("Utente registrato" if ok else "Username già esistente")
    if not st.session_state.logged_in:
        st.stop()

st.sidebar.markdown(f"**Utente:** {st.session_state.user}")
if st.sidebar.button("Logout"):
    st.session_state.logged_in = False; st.session_state.user = None
    safe_rerun()
    st.stop()

st.title("Gym Tracker Professionale")
st.markdown("App mobile-first ottimizzata iPhone")

with st.expander("Crea nuova scheda"):
    rn = st.text_input("Nome scheda", value="Scheda A")
    weeks = st.number_input("Settimane totali", min_value=1, max_value=24, value=4)
    days = st.number_input("Giorni/settimana", min_value=1, max_value=7, value=3)
    
    # Dynamic exercises
    if "temp_exercises" not in st.session_state:
        st.session_state.temp_exercises = []
    
    st.subheader("Esercizi per ogni giorno")
    for i, ex in enumerate(st.session_state.temp_exercises):
        col1, col2, col3, col4, col5, col6 = st.columns(6)
        with col1:
            ex['name'] = st.text_input(f"Nome esercizio {i+1}", value=ex.get('name', ''), key=f"ex_name_{i}")
        with col2:
            ex['weight'] = st.number_input(f"Peso target {i+1}", value=ex.get('weight', 50.0), min_value=0.0, step=0.5, format="%.2f", key=f"ex_weight_{i}")
        with col3:
            ex['sets'] = st.number_input(f"Sets {i+1}", value=ex.get('sets', 3), min_value=1, key=f"ex_sets_{i}")
        with col4:
            ex['reps'] = st.number_input(f"Reps {i+1}", value=ex.get('reps', 8), min_value=1, key=f"ex_reps_{i}")
        with col5:
            ex['rest'] = st.number_input(f"Rest sec {i+1}", value=ex.get('rest', 90), min_value=0, key=f"ex_rest_{i}")
        with col6:
            if st.button(f"Rimuovi {i+1}", key=f"remove_ex_{i}"):
                st.session_state.temp_exercises.pop(i)
                safe_rerun()
    
    if st.button("Aggiungi esercizio"):
        st.session_state.temp_exercises.append({'name': '', 'weight': 50.0, 'sets': 3, 'reps': 8, 'rest': 90, 'notes': ''})
        safe_rerun()
    
    if st.session_state.temp_exercises:
        if st.button("Crea scheda"):
            if all(ex['name'] for ex in st.session_state.temp_exercises):
                rid = create_routine_custom(rn, weeks, days, st.session_state.temp_exercises)
                st.success(f"Scheda {rn} creata con id {rid}")
                st.session_state.temp_exercises = []  # Reset
                safe_rerun()
            else:
                st.error("Tutti gli esercizi devono avere un nome")

routines = get_routines()
if not routines:
    st.warning("Crea una scheda per iniziare")
    st.stop()

routine_sel = st.selectbox("Seleziona scheda", options=[f"{r['id']} - {r['name']}" for r in routines])
rid = int(routine_sel.split(" - ")[0])
days = get_days_for_routine(rid)

completed, total = get_progress(rid)
st.progress(min(1.0, completed/total if total > 0 else 0.0))
st.caption(f"Progresso: {completed}/{total} giorni completati")

st.subheader("Scheda PT con log")
grouped_days = {}
for day in days:
    key = (day['week'], day['day'])
    if key not in grouped_days:
        grouped_days[key] = []
    grouped_days[key].append(day)

for (week, day_num), exercises in grouped_days.items():
    with st.expander(f"Settimana {week} - Giorno {day_num}"):
        for ex in exercises:
            st.markdown(f"**{ex['exercise']}**")
            col1, col2 = st.columns([2,1])
            with col1:
                st.markdown(f"- Target peso: **{ex['target_weight']}** kg")
                st.markdown(f"- Target sets: **{ex['target_sets']}**")
                st.markdown(f"- Target reps: **{ex['target_reps']}**")
                st.markdown(f"- Rest: **{ex['rest_seconds']}** sec")
                st.markdown(f"- Note coach: *{ex['coach_notes']}*")
            with col2:
                ex_name = st.text_input(f"Nome esercizio", value=ex["exercise"], key=f"en{ex['id']}")
                tw = st.number_input(f"Pesi target ({ex['exercise']})", value=ex["target_weight"], key=f"tw{ex['id']}")
                ts = st.number_input(f"Sets target", value=ex["target_sets"], key=f"ts{ex['id']}")
                tr = st.number_input(f"Reps target", value=ex["target_reps"], key=f"tr{ex['id']}")
                rs = st.number_input(f"Rest sec", value=ex["rest_seconds"], key=f"rs{ex['id']}")
                cn = st.text_area("Note coach", value=ex["coach_notes"], key=f"cn{ex['id']}", height=70)
                if st.button("Aggiorna PT", key=f"upd{ex['id']}"):
                    # Update exercise name too
                    conn = get_conn(); c = conn.cursor()
                    c.execute("""UPDATE routine_days SET exercise=?, target_weight=?, target_sets=?, target_reps=?, rest_seconds=?, coach_notes=? 
                                 WHERE id=?""", (ex_name, tw, ts, tr, rs, cn, ex["id"]))
                    conn.commit(); conn.close()
                    st.success("Scheda aggiornata")
                    safe_rerun()
            st.write("---")
            for set_num in range(1, ex['target_sets'] + 1):
                st.markdown(f"**Set {set_num}**")
                col3, col4 = st.columns(2)
                with col3:
                    ae = st.number_input(f"Peso effettivo Set {set_num}", key=f"aw{ex['id']}_{set_num}", min_value=0.0, step=0.5, format="%.2f")
                    ar = st.number_input(f"Reps effettive Set {set_num}", key=f"ar{ex['id']}_{set_num}", min_value=0, step=1)
                with col4:
                    un = st.text_area(f"Note personali Set {set_num}", key=f"un{ex['id']}_{set_num}", height=60)
                if st.button(f"Salva Set {set_num}", key=f"log{ex['id']}_{set_num}"):
                    save_entry(ex["id"], set_num, ae, ar, un)
                    st.success(f"Set {set_num} salvato")
            if st.button("Copia ultimo identico", key=f"cpy{ex['id']}"):
                if copy_last_session(ex["id"]):
                    st.success("Copia effettuata")
                else:
                    st.warning("Nessun dato precedente disponibile")
        # Add new exercise
        st.write("---")
        st.subheader("Aggiungi nuovo esercizio")
        new_ex_name = st.text_input(f"Nome esercizio (W{week}D{day_num})", key=f"new_ex_{week}_{day_num}")
        new_tw = st.number_input(f"Peso target", key=f"new_tw_{week}_{day_num}", min_value=0.0, step=0.5, format="%.2f")
        new_ts = st.number_input(f"Sets target", key=f"new_ts_{week}_{day_num}", min_value=1, value=3)
        new_tr = st.number_input(f"Reps target", key=f"new_tr_{week}_{day_num}", min_value=1, value=8)
        new_rs = st.number_input(f"Rest sec", key=f"new_rs_{week}_{day_num}", min_value=0, value=90)
        new_cn = st.text_area(f"Note coach", key=f"new_cn_{week}_{day_num}", height=70)
        if st.button(f"Aggiungi esercizio a Giorno {day_num}", key=f"add_ex_{week}_{day_num}"):
            if new_ex_name:
                conn = get_conn(); c = conn.cursor()
                c.execute("""INSERT INTO routine_days(routine_id,week,day,exercise,target_weight,target_sets,target_reps,rest_seconds,coach_notes)
                             VALUES(?,?,?,?,?,?,?,?,?)""", (rid, week, day_num, new_ex_name, new_tw, new_ts, new_tr, new_rs, new_cn))
                conn.commit(); conn.close()
                st.success(f"Esercizio {new_ex_name} aggiunto")
                safe_rerun()
            else:
                st.error("Inserisci nome esercizio")
            st.markdown(f"**{ex['exercise']}**")
            col1, col2 = st.columns([2,1])
            with col1:
                st.markdown(f"- Target peso: **{ex['target_weight']}** kg")
                st.markdown(f"- Target sets: **{ex['target_sets']}**")
                st.markdown(f"- Target reps: **{ex['target_reps']}**")
                st.markdown(f"- Rest: **{ex['rest_seconds']}** sec")
                st.markdown(f"- Note coach: *{ex['coach_notes']}*")
            with col2:
                ex_name = st.text_input(f"Nome esercizio", value=ex["exercise"], key=f"en{ex['id']}")
                tw = st.number_input(f"Pesi target ({ex['exercise']})", value=ex["target_weight"], key=f"tw{ex['id']}")
                ts = st.number_input(f"Sets target", value=ex["target_sets"], key=f"ts{ex['id']}")
                tr = st.number_input(f"Reps target", value=ex["target_reps"], key=f"tr{ex['id']}")
                rs = st.number_input(f"Rest sec", value=ex["rest_seconds"], key=f"rs{ex['id']}")
                cn = st.text_area("Note coach", value=ex["coach_notes"], key=f"cn{ex['id']}", height=70)
                if st.button("Aggiorna PT", key=f"upd{ex['id']}"):
                    # Update exercise name too
                    conn = get_conn(); c = conn.cursor()
                    c.execute("""UPDATE routine_days SET exercise=?, target_weight=?, target_sets=?, target_reps=?, rest_seconds=?, coach_notes=? 
                                 WHERE id=?""", (ex_name, tw, ts, tr, rs, cn, ex["id"]))
                    conn.commit(); conn.close()
                    st.success("Scheda aggiornata")
                    safe_rerun()
            st.write("---")
            for set_num in range(1, ex['target_sets'] + 1):
                st.markdown(f"**Set {set_num}**")
                col3, col4 = st.columns(2)
                with col3:
                    ae = st.number_input(f"Peso effettivo Set {set_num}", key=f"aw{ex['id']}_{set_num}", min_value=0.0, step=0.5, format="%.2f")
                    ar = st.number_input(f"Reps effettive Set {set_num}", key=f"ar{ex['id']}_{set_num}", min_value=0, step=1)
                with col4:
                    un = st.text_area(f"Note personali Set {set_num}", key=f"un{ex['id']}_{set_num}", height=60)
                if st.button(f"Salva Set {set_num}", key=f"log{ex['id']}_{set_num}"):
                    save_entry(ex["id"], set_num, ae, ar, un)
                    st.success(f"Set {set_num} salvato")
            if st.button("Copia ultimo identico", key=f"cpy{ex['id']}"):
                if copy_last_session(ex["id"]):
                    st.success("Copia effettuata")
                else:
                    st.warning("Nessun dato precedente disponibile")

st.subheader("Cronologia Carico (PR)")
exercise_options = sorted({d["exercise"] for d in days})
sel_ex = st.selectbox("Seleziona esercizio", exercise_options)
pr = get_pr_history(sel_ex)
if pr is None or pr.empty:
    st.info("Ancora nessun dato registrato per questo esercizio")
else:
    chart = alt.Chart(pr).mark_line(point=True).encode(
        x='entry_date:T', y='actual_weight:Q'
    ).properties(width=700, height=300, title=f"PR {sel_ex}")
    st.altair_chart(chart, use_container_width=True)

st.markdown("### Nota")
st.write("Questa app salva su `gym_data.db` nello stesso folder e può essere deployata su Streamlit Community Cloud.")
