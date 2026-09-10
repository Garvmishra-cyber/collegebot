import os
import sqlite3
from datetime import datetime

from flask import Flask, render_template, request, jsonify, session
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv

try:
    from google import genai
except ImportError:
    genai = None


# =========================================================
# CONFIG
# =========================================================

load_dotenv()

app = Flask(__name__)

app.secret_key = os.getenv(
    "FLASK_SECRET_KEY",
    "collegebot-secret-key-change-this"
)

DATABASE = "collegebot.db"

GEMINI_API_KEY = os.getenv(
    "GEMINI_API_KEY",
    ""
).strip()

GEMINI_MODEL = os.getenv(
    "GEMINI_MODEL",
    "gemini-2.5-flash"
).strip()


# =========================================================
# GEMINI CLIENT
# =========================================================

gemini_client = None

if genai and GEMINI_API_KEY:
    try:
        gemini_client = genai.Client(
            api_key=GEMINI_API_KEY
        )

        print("Gemini client initialized successfully.")

    except Exception as e:
        print("Gemini initialization error:", repr(e))
        gemini_client = None


# =========================================================
# DATABASE
# =========================================================

def get_db():

    conn = sqlite3.connect(DATABASE)

    conn.row_factory = sqlite3.Row

    conn.execute("PRAGMA foreign_keys = ON")

    return conn


def column_exists(table_name, column_name):

    conn = get_db()

    columns = conn.execute(
        f"PRAGMA table_info({table_name})"
    ).fetchall()

    conn.close()

    return any(
        row["name"] == column_name
        for row in columns
    )


def init_db():

    conn = get_db()

    # USERS
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)

    # CHATS
    conn.execute("""
        CREATE TABLE IF NOT EXISTS chats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            created_at TEXT NOT NULL,

            FOREIGN KEY(user_id)
            REFERENCES users(id)
            ON DELETE CASCADE
        )
    """)

    # MESSAGES
    conn.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id INTEGER NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL,

            FOREIGN KEY(chat_id)
            REFERENCES chats(id)
            ON DELETE CASCADE
        )
    """)

    # SETTINGS
    conn.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER UNIQUE NOT NULL,
            language TEXT DEFAULT 'auto',
            persona TEXT DEFAULT 'friendly',
            theme TEXT DEFAULT 'light',
            save_history INTEGER DEFAULT 1,

            FOREIGN KEY(user_id)
            REFERENCES users(id)
            ON DELETE CASCADE
        )
    """)

    # Existing DB me agar column missing ho
    # to automatically add kar denge.

    if not column_exists("settings", "language"):
        conn.execute(
            "ALTER TABLE settings ADD COLUMN language TEXT DEFAULT 'auto'"
        )

    if not column_exists("settings", "persona"):
        conn.execute(
            "ALTER TABLE settings ADD COLUMN persona TEXT DEFAULT 'friendly'"
        )

    if not column_exists("settings", "theme"):
        conn.execute(
            "ALTER TABLE settings ADD COLUMN theme TEXT DEFAULT 'light'"
        )

    if not column_exists("settings", "save_history"):
        conn.execute(
            "ALTER TABLE settings ADD COLUMN save_history INTEGER DEFAULT 1"
        )

    conn.commit()

    conn.close()


init_db()


# =========================================================
# HELPERS
# =========================================================

def now():

    return datetime.now().strftime(
        "%Y-%m-%d %H:%M:%S"
    )


def get_json():

    return request.get_json(
        silent=True
    ) or {}


# =========================================================
# CURRENT USER
# =========================================================

def current_user():

    user_id = session.get("user_id")

    if not user_id:
        return None

    conn = get_db()

    user = conn.execute(
        """
        SELECT *
        FROM users
        WHERE id = ?
        """,
        (user_id,)
    ).fetchone()

    conn.close()

    return user


def login_required():

    user = current_user()

    if not user:

        return None

    return user


# =========================================================
# SETTINGS
# =========================================================

ALLOWED_THEMES = {
    "light",
    "dark",
    "pink",
    "blue",
    "purple"
}

ALLOWED_LANGUAGES = {
    "auto",
    "english",
    "hindi"
}

ALLOWED_PERSONAS = {
    "friendly",
    "formal",
    "teacher",
    "concise"
}


def get_settings(user_id):

    conn = get_db()

    settings = conn.execute(
        """
        SELECT *
        FROM settings
        WHERE user_id = ?
        """,
        (user_id,)
    ).fetchone()

    if not settings:

        conn.execute(
            """
            INSERT INTO settings
            (
                user_id,
                language,
                persona,
                theme,
                save_history
            )
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                user_id,
                "auto",
                "friendly",
                "light",
                1
            )
        )

        conn.commit()

        settings = conn.execute(
            """
            SELECT *
            FROM settings
            WHERE user_id = ?
            """,
            (user_id,)
        ).fetchone()

    conn.close()

    return settings


# =========================================================
# CHAT HELPERS
# =========================================================

def create_chat(user_id, title):

    conn = get_db()

    cursor = conn.execute(
        """
        INSERT INTO chats
        (
            user_id,
            title,
            created_at
        )
        VALUES (?, ?, ?)
        """,
        (
            user_id,
            title,
            now()
        )
    )

    chat_id = cursor.lastrowid

    conn.commit()

    conn.close()

    return chat_id


def save_message(chat_id, role, content):

    conn = get_db()

    conn.execute(
        """
        INSERT INTO messages
        (
            chat_id,
            role,
            content,
            created_at
        )
        VALUES (?, ?, ?, ?)
        """,
        (
            chat_id,
            role,
            content,
            now()
        )
    )

    conn.commit()

    conn.close()


def get_chat_messages(chat_id):

    conn = get_db()

    rows = conn.execute(
        """
        SELECT
            role,
            content,
            created_at
        FROM messages
        WHERE chat_id = ?
        ORDER BY id ASC
        """,
        (chat_id,)
    ).fetchall()

    conn.close()

    return [
        dict(row)
        for row in rows
    ]


# =========================================================
# GEMINI
# =========================================================

def ask_gemini(
    user_message,
    history=None,
    settings=None
):

    if not gemini_client:

        return (
            None,
            "Gemini is not configured."
        )

    history = history or []

    settings = settings or {}

    language = settings.get(
        "language",
        "auto"
    )

    persona = settings.get(
        "persona",
        "friendly"
    )


    # -----------------------------------------------------
    # LANGUAGE
    # -----------------------------------------------------

    if language == "hindi":

        language_instruction = (
            "Answer mainly in Hindi or Hinglish."
        )

    elif language == "english":

        language_instruction = (
            "Answer only in English."
        )

    else:

        language_instruction = (
            "Answer in the same language and style "
            "used by the user."
        )


    # -----------------------------------------------------
    # PERSONA
    # -----------------------------------------------------

    if persona == "formal":

        persona_instruction = (
            "Be professional and formal."
        )

    elif persona == "teacher":

        persona_instruction = (
            "Explain concepts like a helpful teacher."
        )

    elif persona == "concise":

        persona_instruction = (
            "Keep answers concise and direct."
        )

    else:

        persona_instruction = (
            "Be friendly, helpful and natural."
        )


    # -----------------------------------------------------
    # SYSTEM INSTRUCTION
    # -----------------------------------------------------

    system_instruction = f"""
You are CollegeBot, a helpful AI college assistant.

You can help with:

- College questions
- Admission
- Fees
- Exams
- Attendance
- Courses
- Programming
- C
- C++
- Java
- Python
- JavaScript
- Web development
- DSA
- Projects
- Internships
- Placements
- Career questions
- General knowledge
- Normal casual questions

Do not say that you can only answer college questions.

{language_instruction}

{persona_instruction}

Important rules:

1. Give useful answers.
2. If the user asks for code, provide working code.
3. Explain code when useful.
4. Do not invent college-specific facts.
5. If something is unknown, clearly say so.
6. Keep answers understandable.
"""


    # -----------------------------------------------------
    # CONVERSATION
    # -----------------------------------------------------

    conversation = []

    for item in history[-20:]:

        role = item.get("role")

        if role not in [
            "user",
            "assistant"
        ]:
            continue

        conversation.append(
            {
                "role": role,
                "parts": [
                    {
                        "text": item.get(
                            "content",
                            ""
                        )
                    }
                ]
            }
        )


    conversation.append(
        {
            "role": "user",
            "parts": [
                {
                    "text": user_message
                }
            ]
        }
    )


    # -----------------------------------------------------
    # GEMINI REQUEST
    # -----------------------------------------------------

    try:

        response = gemini_client.models.generate_content(

            model=GEMINI_MODEL,

            contents=conversation,

            config={
                "system_instruction":
                    system_instruction,

                "temperature":
                    0.7
            }
        )

        text = getattr(
            response,
            "text",
            None
        )

        if text:

            return (
                text.strip(),
                None
            )

        return (
            None,
            "Gemini returned an empty response."
        )

    except Exception as e:

        print(
            "Gemini API error:",
            repr(e)
        )

        return (
            None,
            str(e)
        )


# =========================================================
# MAIN PAGE
# =========================================================

@app.route("/")
def index():

    user = current_user()

    if not user:

        return render_template(
            "index.html",
            logged_in=False,
            username="Guest Student",
            settings={}
        )

    settings = get_settings(
        user["id"]
    )

    return render_template(
        "index.html",
        logged_in=True,
        username=user["username"],
        settings=dict(settings)
    )


# =========================================================
# API - CURRENT USER
# =========================================================

@app.get("/api/me")
def api_me():

    user = current_user()

    if not user:

        return jsonify(
            {
                "logged_in": False
            }
        )

    settings = get_settings(
        user["id"]
    )

    return jsonify(
        {
            "logged_in": True,
            "user": {
                "id": user["id"],
                "username": user["username"]
            },
            "settings": dict(settings)
        }
    )


# =========================================================
# SIGNUP
# =========================================================

@app.post("/api/signup")
def signup():

    data = get_json()

    username = str(
        data.get(
            "username",
            ""
        )
    ).strip()

    password = str(
        data.get(
            "password",
            ""
        )
    )


    if len(username) < 3:

        return jsonify(
            {
                "success": False,
                "message":
                    "Username must be at least 3 characters."
            }
        ), 400


    if len(password) < 4:

        return jsonify(
            {
                "success": False,
                "message":
                    "Password must be at least 4 characters."
            }
        ), 400


    conn = get_db()

    try:

        cursor = conn.execute(
            """
            INSERT INTO users
            (
                username,
                password,
                created_at
            )
            VALUES (?, ?, ?)
            """,
            (
                username,
                generate_password_hash(password),
                now()
            )
        )

        user_id = cursor.lastrowid


        conn.execute(
            """
            INSERT INTO settings
            (
                user_id,
                language,
                persona,
                theme,
                save_history
            )
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                user_id,
                "auto",
                "friendly",
                "light",
                1
            )
        )


        conn.commit()

        session.clear()

        session["user_id"] = user_id


        return jsonify(
            {
                "success": True,
                "message":
                    "Account created successfully.",
                "username":
                    username
            }
        )


    except sqlite3.IntegrityError:

        conn.rollback()

        return jsonify(
            {
                "success": False,
                "message":
                    "Username already exists."
            }
        ), 409


    finally:

        conn.close()


# =========================================================
# LOGIN
# =========================================================

@app.post("/api/login")
def login():

    data = get_json()

    username = str(
        data.get(
            "username",
            ""
        )
    ).strip()

    password = str(
        data.get(
            "password",
            ""
        )
    )


    if not username or not password:

        return jsonify(
            {
                "success": False,
                "message":
                    "Username and password are required."
            }
        ), 400


    conn = get_db()

    user = conn.execute(
        """
        SELECT *
        FROM users
        WHERE username = ?
        """,
        (username,)
    ).fetchone()

    conn.close()


    if (
        not user
        or not check_password_hash(
            user["password"],
            password
        )
    ):

        return jsonify(
            {
                "success": False,
                "message":
                    "Invalid username or password."
            }
        ), 401


    session.clear()

    session["user_id"] = user["id"]


    return jsonify(
        {
            "success": True,
            "message":
                "Login successful.",
            "username":
                user["username"]
        }
    )


# =========================================================
# LOGOUT
# =========================================================

@app.post("/api/logout")
def logout():

    session.clear()

    return jsonify(
        {
            "success": True
        }
    )


# =========================================================
# CHAT
# =========================================================

@app.post("/api/chat")
def chat():

    user = login_required()

    if not user:

        return jsonify(
            {
                "success": False,
                "message":
                    "Please login first."
            }
        ), 401


    data = get_json()

    message = str(
        data.get(
            "message",
            ""
        )
    ).strip()

    chat_id = data.get(
        "chat_id"
    )


    if not message:

        return jsonify(
            {
                "success": False,
                "message":
                    "Please enter a message."
            }
        ), 400


    settings = get_settings(
        user["id"]
    )


    # -----------------------------------------------------
    # CREATE CHAT
    # -----------------------------------------------------

    if not chat_id:

        title = message[:60]

        chat_id = create_chat(
            user["id"],
            title
        )

    else:

        conn = get_db()

        chat = conn.execute(
            """
            SELECT *
            FROM chats
            WHERE id = ?
            AND user_id = ?
            """,
            (
                chat_id,
                user["id"]
            )
        ).fetchone()

        conn.close()


        if not chat:

            return jsonify(
                {
                    "success": False,
                    "message":
                        "Chat not found."
                }
            ), 404


    # -----------------------------------------------------
    # OLD HISTORY
    # -----------------------------------------------------

    history = get_chat_messages(
        chat_id
    )


    # -----------------------------------------------------
    # GEMINI
    # -----------------------------------------------------

    answer, error = ask_gemini(
        message,
        history,
        dict(settings)
    )


    if answer is None:

        return jsonify(
            {
                "success": False,
                "message":
                    "Gemini response nahi aa raha.",
                "error":
                    error
            }
        ), 500


    # -----------------------------------------------------
    # SAVE
    # -----------------------------------------------------

    save_history = bool(
        settings["save_history"]
    )


    if save_history:

        save_message(
            chat_id,
            "user",
            message
        )

        save_message(
            chat_id,
            "assistant",
            answer
        )


    return jsonify(
        {
            "success": True,
            "chat_id": chat_id,
            "answer": answer
        }
    )


# =========================================================
# CHAT HISTORY
# =========================================================

@app.get("/api/history")
def history():

    user = login_required()

    if not user:

        return jsonify(
            {
                "success": False,
                "message":
                    "Please login first."
            }
        ), 401


    conn = get_db()

    chats = conn.execute(
        """
        SELECT
            id,
            title,
            created_at
        FROM chats
        WHERE user_id = ?
        ORDER BY id DESC
        """,
        (user["id"],)
    ).fetchall()

    conn.close()


    return jsonify(
        {
            "success": True,
            "chats": [
                dict(chat)
                for chat in chats
            ]
        }
    )


# =========================================================
# SINGLE CHAT
# =========================================================

@app.get("/api/history/<int:chat_id>")
def get_history_chat(chat_id):

    user = login_required()

    if not user:

        return jsonify(
            {
                "success": False,
                "message":
                    "Please login first."
            }
        ), 401


    conn = get_db()

    chat = conn.execute(
        """
        SELECT *
        FROM chats
        WHERE id = ?
        AND user_id = ?
        """,
        (
            chat_id,
            user["id"]
        )
    ).fetchone()

    conn.close()


    if not chat:

        return jsonify(
            {
                "success": False,
                "message":
                    "Chat not found."
            }
        ), 404


    return jsonify(
        {
            "success": True,
            "chat": dict(chat),
            "messages":
                get_chat_messages(chat_id)
        }
    )


# =========================================================
# DELETE CHAT
# =========================================================

@app.delete("/api/history/<int:chat_id>")
def delete_chat(chat_id):

    user = login_required()

    if not user:

        return jsonify(
            {
                "success": False,
                "message":
                    "Please login first."
            }
        ), 401


    conn = get_db()

    cursor = conn.execute(
        """
        DELETE FROM chats
        WHERE id = ?
        AND user_id = ?
        """,
        (
            chat_id,
            user["id"]
        )
    )

    conn.commit()

    deleted = cursor.rowcount

    conn.close()


    if deleted == 0:

        return jsonify(
            {
                "success": False,
                "message":
                    "Chat not found."
            }
        ), 404


    return jsonify(
        {
            "success": True,
            "message":
                "Chat deleted successfully."
        }
    )


# =========================================================
# SETTINGS GET
# =========================================================

@app.get("/api/settings")
def settings_get():

    user = login_required()

    if not user:

        return jsonify(
            {
                "success": False,
                "message":
                    "Please login first."
            }
        ), 401


    settings = get_settings(
        user["id"]
    )


    return jsonify(
        {
            "success": True,
            "settings": dict(settings)
        }
    )


# =========================================================
# SETTINGS POST
# =========================================================

@app.post("/api/settings")
def settings_post():

    user = login_required()

    if not user:

        return jsonify(
            {
                "success": False,
                "message":
                    "Please login first."
            }
        ), 401


    data = get_json()


    language = data.get(
        "language",
        "auto"
    )

    persona = data.get(
        "persona",
        "friendly"
    )

    theme = data.get(
        "theme",
        "light"
    )

    save_history = data.get(
        "save_history",
        True
    )


    if language not in ALLOWED_LANGUAGES:

        language = "auto"


    if persona not in ALLOWED_PERSONAS:

        persona = "friendly"


    if theme not in ALLOWED_THEMES:

        theme = "light"


    save_history = 1 if save_history else 0


    conn = get_db()

    conn.execute(
        """
        INSERT INTO settings
        (
            user_id,
            language,
            persona,
            theme,
            save_history
        )
        VALUES (?, ?, ?, ?, ?)

        ON CONFLICT(user_id)
        DO UPDATE SET

            language = excluded.language,
            persona = excluded.persona,
            theme = excluded.theme,
            save_history = excluded.save_history
        """,
        (
            user["id"],
            language,
            persona,
            theme,
            save_history
        )
    )


    conn.commit()

    conn.close()


    return jsonify(
        {
            "success": True,
            "message":
                "Settings saved successfully.",
            "settings": {
                "language":
                    language,
                "persona":
                    persona,
                "theme":
                    theme,
                "save_history":
                    save_history
            }
        }
    )


# =========================================================
# CLEAR ALL HISTORY
# =========================================================

@app.delete("/api/history")
def clear_history():

    user = login_required()

    if not user:

        return jsonify(
            {
                "success": False,
                "message":
                    "Please login first."
            }
        ), 401


    conn = get_db()

    conn.execute(
        """
        DELETE FROM chats
        WHERE user_id = ?
        """,
        (user["id"],)
    )

    conn.commit()

    conn.close()


    return jsonify(
        {
            "success": True,
            "message":
                "Chat history cleared."
        }
    )


# =========================================================
# STATUS
# =========================================================

@app.get("/api/status")
def status():

    return jsonify(
        {
            "success": True,
            "gemini":
                gemini_client is not None,
            "model":
                GEMINI_MODEL
        }
    )


# =========================================================
# TEST AI
# =========================================================

@app.get("/api/test-ai")
def test_ai():

    user = login_required()

    if not user:

        return jsonify(
            {
                "success": False,
                "message":
                    "Please login first."
            }
        ), 401


    answer, error = ask_gemini(
        "Say hello to the user in one short sentence.",
        [],
        {}
    )


    if answer is None:

        return jsonify(
            {
                "success": False,
                "message":
                    "Gemini test failed.",
                "error":
                    error
            }
        ), 500


    return jsonify(
        {
            "success": True,
            "answer": answer
        }
    )


# =========================================================
# RUN
# =========================================================

if __name__ == "__main__":

    print("")
    print("========================================")
    print("        COLLEGEBOT STARTED")
    print("========================================")
    print("")
    print("Open: http://127.0.0.1:5000")
    print("")

    app.run(
        host="127.0.0.1",
        port=5000,
        debug=True
    )