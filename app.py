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
                target_reps INTEGER,
                rest_seconds INTEGER,
                coach_notes TEXT,
                UNIQUE(routine_id, week, day),
                FOREIGN KEY(routine_id) REFERENCES routines(id) ON DELETE CASCADE
                )""")
    c.execute("""CREATE TABLE IF NOT EXISTS session_entries (
                id INTEGER PRIMARY KEY,
                routine_day_id INTEGER,
                entry_date TEXT,
                actual_weight REAL,
                actual_reps INTEGER,
                user_notes TEXT,
                FOREIGN KEY(routine_day_id) REFERENCES routine_days(id) ON DELETE CASCADE
                )""")
    conn.commit()
    if not c.execute("SELECT 1 FROM users LIMIT 1").fetchone():
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
            c.execute("""INSERT INTO routine_days(
                        routine_id,week,day,exercise,target_weight,target_reps,rest_seconds,coach_notes
                        ) VALUES(?,?,?,?,?,?,?,?)""",
                      (rid, w, d, f"Workout {d}", 50.0, 8, 90, f"Coach note W{w}D{d}"))
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

def save_day(routine_day_id, target_weight, target_reps, rest_seconds, coach_notes):
    conn = get_conn(); c = conn.cursor()
    c.execute("""UPDATE routine_days SET target_weight=?, target_reps=?, rest_seconds=?, coach_notes=? 
                 WHERE id=?""", (target_weight, target_reps, rest_seconds, coach_notes, routine_day_id))
    conn.commit(); conn.close()

def save_entry(routine_day_id, actual_weight, actual_reps, user_notes):
    conn = get_conn(); c = conn.cursor()
    today = datetime.utcnow().strftime("%Y-%m-%d")
    c.execute("""INSERT INTO session_entries(routine_day_id,entry_date,actual_weight,actual_reps,user_notes)
                 VALUES(?,?,?,?,?)""", (routine_day_id, today, actual_weight, actual_reps, user_notes))
    conn.commit(); conn.close()

def get_last_entry(routine_day_id):
    conn = get_conn(); c = conn.cursor()
    row = c.execute("""SELECT * FROM session_entries WHERE routine_day_id=? ORDER BY id DESC LIMIT 1""", (routine_day_id,)).fetchone()
    conn.close(); return row

def copy_last_session(routine_day_id):
    last = get_last_entry(routine_day_id)
    if last:
        save_entry(routine_day_id, last["actual_weight"], last["actual_reps"], last["user_notes"])
        return True
    return False

def get_progress(routine_id):
    days = get_days_for_routine(routine_id)
    total = len(days)
    conn = get_conn(); c = conn.cursor()
    completed = c.execute("""SELECT COUNT(DISTINCT routine_day_id) FROM session_entries
                             WHERE routine_day_id IN (SELECT id FROM routine_days WHERE routine_id=?)""", (routine_id,)).fetchone()[0]
    conn.close()
    return completed, total

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
    if st.button("Crea scheda"):
        rid = create_routine(rn, weeks, days)
        st.success(f"Scheda {rn} creata con id {rid}")
        safe_rerun()

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
for day in days:
    with st.expander(f"Settimana {day['week']} - Giorno {day['day']} ({day['exercise']})"):
        col1, col2 = st.columns([2,1])
        with col1:
            st.markdown(f"- Target peso: **{day['target_weight']}** kg")
            st.markdown(f"- Target reps: **{day['target_reps']}**")
            st.markdown(f"- Rest: **{day['rest_seconds']}** sec")
            st.markdown(f"- Note coach: *{day['coach_notes']}*")
        with col2:
            tw = st.number_input(f"Pesi target (W{day['week']}D{day['day']})", value=day["target_weight"], key=f"tw{day['id']}")
            tr = st.number_input(f"Reps target", value=day["target_reps"], key=f"tr{day['id']}")
            rs = st.number_input(f"Rest sec", value=day["rest_seconds"], key=f"rs{day['id']}")
            cn = st.text_area("Note coach", value=day["coach_notes"], key=f"cn{day['id']}", height=70)
            if st.button("Aggiorna PT", key=f"upd{day['id']}"):
                save_day(day["id"], tw, tr, rs, cn)
                st.success("Scheda aggiornata")
        st.write("---")
        ae = st.number_input("Peso effettivo", key=f"aw{day['id']}", min_value=0.0, step=0.5, format="%.2f")
        ar = st.number_input("Reps effettive", key=f"ar{day['id']}", min_value=0, step=1)
        un = st.text_area("Note personali", key=f"un{day['id']}", height=80)
        if st.button("Salva log", key=f"log{day['id']}"):
            save_entry(day["id"], ae, ar, un)
            st.success("Log salvato")
        if st.button("Copia ultimo identico", key=f"cpy{day['id']}"):
            if copy_last_session(day["id"]):
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
