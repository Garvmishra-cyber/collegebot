import os
import json
import sqlite3
from datetime import datetime
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

from flask import Flask, render_template, request, jsonify, session
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv


# ============================================================
# ENVIRONMENT
# ============================================================

load_dotenv()


# ============================================================
# FLASK
# ============================================================

app = Flask(__name__)

app.secret_key = os.getenv(
    "FLASK_SECRET_KEY",
    "collegebot-secret-key-change-this"
)


# ============================================================
# CONFIG
# ============================================================

DATABASE = "collegebot.db"


# ============================================================
# GEMINI CONFIG
# ============================================================

GEMINI_API_KEY = os.getenv(
    "GEMINI_API_KEY",
    ""
).strip()

GEMINI_MODEL = os.getenv(
    "GEMINI_MODEL",
    "gemini-2.5-flash"
).strip()

GEMINI_URL = (
    "https://generativelanguage.googleapis.com/"
    f"v1beta/models/{GEMINI_MODEL}:generateContent"
)


# ============================================================
# OLLAMA CONFIG
# ============================================================

OLLAMA_URL = os.getenv(
    "OLLAMA_URL",
    "http://127.0.0.1:11434/api/chat"
).strip()

OLLAMA_TAGS_URL = os.getenv(
    "OLLAMA_TAGS_URL",
    "http://127.0.0.1:11434/api/tags"
).strip()

OLLAMA_MODEL = os.getenv(
    "OLLAMA_MODEL",
    "qwen2.5:3b"
).strip()


# ============================================================
# DATABASE
# ============================================================

def get_db():

    conn = sqlite3.connect(DATABASE)

    conn.row_factory = sqlite3.Row

    return conn


def now():

    return datetime.now().strftime(
        "%Y-%m-%d %H:%M:%S"
    )


def init_database():

    conn = get_db()

    cursor = conn.cursor()

    # --------------------------------------------------------
    # USERS
    # --------------------------------------------------------

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)

    # --------------------------------------------------------
    # CHAT HISTORY
    # --------------------------------------------------------

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS chat_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            user_message TEXT NOT NULL,
            bot_response TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    """)

    # --------------------------------------------------------
    # SETTINGS
    # --------------------------------------------------------

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER UNIQUE NOT NULL,
            language TEXT DEFAULT 'English',
            theme TEXT DEFAULT 'dark',
            notifications INTEGER DEFAULT 1,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    """)

    conn.commit()

    # --------------------------------------------------------
    # ADD PROVIDER COLUMN IF OLD DATABASE
    # --------------------------------------------------------

    try:

        cursor.execute(
            """
            ALTER TABLE chat_history
            ADD COLUMN provider TEXT DEFAULT 'unknown'
            """
        )

    except sqlite3.OperationalError:

        pass

    conn.commit()

    conn.close()


# Initialize database
init_database()


# ============================================================
# SESSION HELPERS
# ============================================================

def is_logged_in():

    return "user_id" in session


def current_user_id():

    return session.get("user_id")


# ============================================================
# SETTINGS
# ============================================================

def create_default_settings(user_id):

    conn = get_db()

    conn.execute(
        """
        INSERT OR IGNORE INTO settings
        (
            user_id,
            language,
            theme,
            notifications
        )
        VALUES (?, ?, ?, ?)
        """,
        (
            user_id,
            "English",
            "dark",
            1
        )
    )

    conn.commit()

    conn.close()


def get_user_settings(user_id):

    conn = get_db()

    row = conn.execute(
        """
        SELECT
            language,
            theme,
            notifications
        FROM settings
        WHERE user_id = ?
        """,
        (user_id,)
    ).fetchone()

    conn.close()

    if row:

        return dict(row)

    return {
        "language": "English",
        "theme": "dark",
        "notifications": 1
    }


# ============================================================
# AI SYSTEM PROMPT
# ============================================================

def build_system_prompt(settings=None):

    language = "English"

    if settings:

        language = settings.get(
            "language",
            "English"
        )

    return f"""
You are CollegeBot, a helpful AI college assistant.

You help students with:

- College questions
- Academic questions
- Programming
- C programming
- C++
- Java
- Python
- JavaScript
- HTML
- CSS
- Web development
- DSA
- Projects
- Internships
- Placements
- College procedures
- General student questions

Preferred language:
{language}

Rules:

1. Be helpful and accurate.
2. Keep answers easy to understand.
3. If the user speaks Hinglish, you may answer in Hinglish.
4. Do not unnecessarily make answers very long.
5. Use bullet points and steps when useful.
6. For programming questions, provide working code when appropriate.
7. Do not invent private college information.
8. If you are unsure, clearly say that you are unsure.
9. Be friendly and student-friendly.
"""


# ============================================================
# INTERNET CHECK
# ============================================================

def internet_available():

    try:

        req = Request(
            "https://www.google.com",
            method="HEAD",
            headers={
                "User-Agent": "CollegeBot/1.0"
            }
        )

        with urlopen(
            req,
            timeout=3
        ) as response:

            return response.status < 500

    except Exception:

        return False


# ============================================================
# GEMINI AI
# ============================================================

def ask_gemini(
    message,
    history=None,
    settings=None
):

    if not GEMINI_API_KEY:

        return None, "Gemini API key is not configured."

    try:

        contents = []

        # ----------------------------------------------------
        # OLD MESSAGES
        # ----------------------------------------------------

        if history:

            for item in history[-10:]:

                user_message = item.get(
                    "user_message",
                    ""
                )

                bot_response = item.get(
                    "bot_response",
                    ""
                )

                if user_message:

                    contents.append({
                        "role": "user",
                        "parts": [
                            {
                                "text": user_message
                            }
                        ]
                    })

                if bot_response:

                    contents.append({
                        "role": "model",
                        "parts": [
                            {
                                "text": bot_response
                            }
                        ]
                    })

        # ----------------------------------------------------
        # CURRENT MESSAGE
        # ----------------------------------------------------

        contents.append({
            "role": "user",
            "parts": [
                {
                    "text": message
                }
            ]
        })

        # ----------------------------------------------------
        # PAYLOAD
        # ----------------------------------------------------

        payload = {

            "systemInstruction": {
                "parts": [
                    {
                        "text": build_system_prompt(
                            settings
                        )
                    }
                ]
            },

            "contents": contents,

            "generationConfig": {
                "temperature": 0.7,
                "maxOutputTokens": 2048
            }
        }

        body = json.dumps(
            payload
        ).encode("utf-8")

        req = Request(
            GEMINI_URL,
            data=body,
            method="POST",
            headers={
                "Content-Type": "application/json",
                "x-goog-api-key": GEMINI_API_KEY
            }
        )

        with urlopen(
            req,
            timeout=30
        ) as response:

            raw = response.read().decode(
                "utf-8"
            )

        result = json.loads(raw)

        # ----------------------------------------------------
        # GET CANDIDATE
        # ----------------------------------------------------

        candidates = result.get(
            "candidates",
            []
        )

        if not candidates:

            return None, "Gemini returned no candidates."

        content = candidates[0].get(
            "content",
            {}
        )

        parts = content.get(
            "parts",
            []
        )

        answer_parts = []

        for part in parts:

            text = part.get(
                "text",
                ""
            )

            if text:

                answer_parts.append(text)

        answer = "\n".join(
            answer_parts
        ).strip()

        if not answer:

            return None, "Gemini returned empty response."

        return answer, None

    except HTTPError as e:

        try:

            error_text = e.read().decode(
                "utf-8",
                errors="ignore"
            )

        except Exception:

            error_text = ""

        return None, (
            f"Gemini HTTP Error {e.code}: "
            f"{error_text[:500]}"
        )

    except URLError as e:

        return None, (
            f"Gemini network error: {e}"
        )

    except Exception as e:

        return None, (
            f"Gemini error: {e}"
        )


# ============================================================
# OLLAMA CHECK
# ============================================================

def ollama_available():

    try:

        req = Request(
            OLLAMA_TAGS_URL,
            method="GET",
            headers={
                "User-Agent": "CollegeBot/1.0"
            }
        )

        with urlopen(
            req,
            timeout=3
        ) as response:

            return response.status == 200

    except Exception:

        return False


# ============================================================
# OLLAMA MODELS
# ============================================================

def get_ollama_models():

    try:

        req = Request(
            OLLAMA_TAGS_URL,
            method="GET",
            headers={
                "User-Agent": "CollegeBot/1.0"
            }
        )

        with urlopen(
            req,
            timeout=3
        ) as response:

            raw = response.read().decode(
                "utf-8"
            )

        data = json.loads(raw)

        models = []

        for model in data.get(
            "models",
            []
        ):

            name = model.get(
                "name"
            )

            if name:

                models.append(name)

        return models

    except Exception:

        return []


# ============================================================
# OLLAMA LOCAL AI
# ============================================================

def ask_local_ai(
    message,
    history=None,
    settings=None
):

    if not ollama_available():

        return None, (
            "Ollama is not running. "
            "Please start Ollama."
        )

    try:

        messages = []

        # ----------------------------------------------------
        # SYSTEM
        # ----------------------------------------------------

        messages.append({
            "role": "system",
            "content": build_system_prompt(
                settings
            )
        })

        # ----------------------------------------------------
        # HISTORY
        # ----------------------------------------------------

        if history:

            for item in history[-10:]:

                user_message = item.get(
                    "user_message",
                    ""
                )

                bot_response = item.get(
                    "bot_response",
                    ""
                )

                if user_message:

                    messages.append({
                        "role": "user",
                        "content": user_message
                    })

                if bot_response:

                    messages.append({
                        "role": "assistant",
                        "content": bot_response
                    })

        # ----------------------------------------------------
        # CURRENT MESSAGE
        # ----------------------------------------------------

        messages.append({
            "role": "user",
            "content": message
        })

        # ----------------------------------------------------
        # OLLAMA PAYLOAD
        # ----------------------------------------------------

        payload = {

            "model": OLLAMA_MODEL,

            "messages": messages,

            "stream": False,

            "options": {
                "temperature": 0.7
            }
        }

        body = json.dumps(
            payload
        ).encode("utf-8")

        req = Request(
            OLLAMA_URL,
            data=body,
            method="POST",
            headers={
                "Content-Type": "application/json"
            }
        )

        with urlopen(
            req,
            timeout=120
        ) as response:

            raw = response.read().decode(
                "utf-8"
            )

        result = json.loads(raw)

        answer = (
            result
            .get("message", {})
            .get("content", "")
            .strip()
        )

        if not answer:

            return None, (
                "Ollama returned empty response."
            )

        return answer, None

    except HTTPError as e:

        try:

            error_text = e.read().decode(
                "utf-8",
                errors="ignore"
            )

        except Exception:

            error_text = ""

        return None, (
            f"Ollama HTTP Error {e.code}: "
            f"{error_text[:500]}"
        )

    except URLError as e:

        return None, (
            f"Ollama connection error: {e}"
        )

    except Exception as e:

        return None, (
            f"Ollama error: {e}"
        )


# ============================================================
# HYBRID AI
# ============================================================

def ask_hybrid_ai(
    message,
    history=None,
    settings=None
):

    gemini_error = None
    ollama_error = None

    # ========================================================
    # FIRST TRY GEMINI
    # ========================================================

    if GEMINI_API_KEY:

        print(
            "[AI] Trying Gemini..."
        )

        answer, error = ask_gemini(
            message,
            history,
            settings
        )

        if answer:

            print(
                "[AI] Gemini response successful."
            )

            return {
                "answer": answer,
                "provider": "gemini",
                "error": None
            }

        gemini_error = error

        print(
            "[AI] Gemini failed:",
            error
        )

    else:

        gemini_error = (
            "Gemini API key not configured."
        )

        print(
            "[AI] Gemini not configured."
        )

    # ========================================================
    # FALLBACK TO OLLAMA
    # ========================================================

    print(
        "[AI] Trying local Ollama..."
    )

    answer, error = ask_local_ai(
        message,
        history,
        settings
    )

    if answer:

        print(
            "[AI] Ollama response successful."
        )

        return {
            "answer": answer,
            "provider": "ollama",
            "error": None
        }

    ollama_error = error

    print(
        "[AI] Ollama failed:",
        error
    )

    # ========================================================
    # BOTH FAILED
    # ========================================================

    return {
        "answer": None,
        "provider": "none",
        "error": (
            "Both AI services failed.\n\n"
            f"Gemini: {gemini_error}\n"
            f"Ollama: {ollama_error}"
        )
    }


# ============================================================
# SAVE CHAT
# ============================================================

def save_chat(
    user_id,
    user_message,
    bot_response,
    provider
):

    conn = get_db()

    conn.execute(
        """
        INSERT INTO chat_history
        (
            user_id,
            user_message,
            bot_response,
            provider,
            created_at
        )
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            user_id,
            user_message,
            bot_response,
            provider,
            now()
        )
    )

    conn.commit()

    conn.close()


# ============================================================
# GET HISTORY
# ============================================================

def get_history(
    user_id,
    limit=50
):

    conn = get_db()

    rows = conn.execute(
        """
        SELECT
            id,
            user_message,
            bot_response,
            provider,
            created_at
        FROM chat_history
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT ?
        """,
        (
            user_id,
            limit
        )
    ).fetchall()

    conn.close()

    return [
        dict(row)
        for row in reversed(rows)
    ]


# ============================================================
# HOME
# ============================================================

@app.route("/")
def home():

    return render_template(
        "index.html"
    )


# ============================================================
# CURRENT USER
# ============================================================

@app.route(
    "/api/me",
    methods=["GET"]
)
def api_me():

    if not is_logged_in():

        return jsonify({
            "success": True,
            "logged_in": False
        })

    user_id = current_user_id()

    conn = get_db()

    user = conn.execute(
        """
        SELECT
            id,
            name,
            email,
            created_at
        FROM users
        WHERE id = ?
        """,
        (user_id,)
    ).fetchone()

    conn.close()

    if not user:

        session.clear()

        return jsonify({
            "success": True,
            "logged_in": False
        })

    return jsonify({
        "success": True,
        "logged_in": True,
        "user": dict(user)
    })


# ============================================================
# SIGNUP
# ============================================================

@app.route(
    "/api/signup",
    methods=["POST"]
)
def signup():

    # JSON OR FORM DATA
    data = request.get_json(
        silent=True
    )

    if not isinstance(
        data,
        dict
    ):

        data = request.form.to_dict()

    # --------------------------------------------------------
    # ACCEPT MULTIPLE FIELD NAMES
    # --------------------------------------------------------

    name = str(
        data.get("name")
        or data.get("username")
        or data.get("full_name")
        or ""
    ).strip()

    email = str(
        data.get("email")
        or ""
    ).strip().lower()

    password = str(
        data.get("password")
        or ""
    )

    print()
    print("========== SIGNUP REQUEST ==========")
    print("Name:", name)
    print("Email:", email)
    print("Password received:", bool(password))
    print("Content-Type:", request.content_type)
    print("====================================")
    print()

    # --------------------------------------------------------
    # VALIDATION
    # --------------------------------------------------------

    if not name:

        return jsonify({
            "success": False,
            "message": "Name is required."
        }), 400

    if not email:

        return jsonify({
            "success": False,
            "message": "Email is required."
        }), 400

    if not password:

        return jsonify({
            "success": False,
            "message": "Password is required."
        }), 400

    if len(password) < 6:

        return jsonify({
            "success": False,
            "message": (
                "Password must be at least 6 characters."
            )
        }), 400

    conn = get_db()

    try:

        # ----------------------------------------------------
        # CHECK EXISTING USER
        # ----------------------------------------------------

        existing = conn.execute(
            """
            SELECT id
            FROM users
            WHERE LOWER(email) = ?
            """,
            (email,)
        ).fetchone()

        if existing:

            conn.close()

            return jsonify({
                "success": False,
                "message": "Email already registered."
            }), 409

        # ----------------------------------------------------
        # HASH PASSWORD
        # ----------------------------------------------------

        password_hash = generate_password_hash(
            password
        )

        # ----------------------------------------------------
        # INSERT USER
        # ----------------------------------------------------

        cursor = conn.execute(
            """
            INSERT INTO users
            (
                name,
                email,
                password,
                created_at
            )
            VALUES (?, ?, ?, ?)
            """,
            (
                name,
                email,
                password_hash,
                now()
            )
        )

        user_id = cursor.lastrowid

        conn.commit()

        conn.close()

        # ----------------------------------------------------
        # SETTINGS
        # ----------------------------------------------------

        create_default_settings(
            user_id
        )

        # ----------------------------------------------------
        # LOGIN AFTER SIGNUP
        # ----------------------------------------------------

        session.clear()

        session["user_id"] = user_id

        return jsonify({

            "success": True,

            "message": "Account created successfully.",

            "logged_in": True,

            "user": {
                "id": user_id,
                "name": name,
                "email": email
            }
        })

    except sqlite3.IntegrityError:

        conn.rollback()

        conn.close()

        return jsonify({
            "success": False,
            "message": "Email already registered."
        }), 409

    except Exception as e:

        conn.rollback()

        conn.close()

        print(
            "SIGNUP ERROR:",
            e
        )

        return jsonify({
            "success": False,
            "message": "Signup failed.",
            "error": str(e)
        }), 500


# ============================================================
# LOGIN
# ============================================================

@app.route(
    "/api/login",
    methods=["POST"]
)
def login():

    # JSON OR FORM DATA
    data = request.get_json(
        silent=True
    )

    if not isinstance(
        data,
        dict
    ):

        data = request.form.to_dict()

    # --------------------------------------------------------
    # ACCEPT EMAIL / USERNAME
    # --------------------------------------------------------

    email = str(
        data.get("email")
        or data.get("username")
        or data.get("identifier")
        or ""
    ).strip().lower()

    password = str(
        data.get("password")
        or ""
    )

    print()
    print("========== LOGIN REQUEST ==========")
    print("Email/Username:", email)
    print("Password received:", bool(password))
    print("Content-Type:", request.content_type)
    print("===================================")
    print()

    # --------------------------------------------------------
    # VALIDATION
    # --------------------------------------------------------

    if not email:

        return jsonify({
            "success": False,
            "message": "Email or username is required."
        }), 400

    if not password:

        return jsonify({
            "success": False,
            "message": "Password is required."
        }), 400

    conn = get_db()

    try:

        # ----------------------------------------------------
        # FIND USER BY EMAIL
        # ----------------------------------------------------

        user = conn.execute(
            """
            SELECT *
            FROM users
            WHERE LOWER(email) = ?
            """,
            (email,)
        ).fetchone()

        # ----------------------------------------------------
        # IF NOT FOUND, TRY NAME
        # ----------------------------------------------------

        if not user:

            user = conn.execute(
                """
                SELECT *
                FROM users
                WHERE LOWER(name) = ?
                """,
                (email,)
            ).fetchone()

        conn.close()

        # ----------------------------------------------------
        # USER NOT FOUND
        # ----------------------------------------------------

        if not user:

            return jsonify({
                "success": False,
                "message": (
                    "Invalid email/username or password."
                )
            }), 401

        # ----------------------------------------------------
        # CHECK PASSWORD
        # ----------------------------------------------------

        if not check_password_hash(
            user["password"],
            password
        ):

            return jsonify({
                "success": False,
                "message": (
                    "Invalid email/username or password."
                )
            }), 401

        # ----------------------------------------------------
        # CREATE SESSION
        # ----------------------------------------------------

        session.clear()

        session["user_id"] = user["id"]

        # ----------------------------------------------------
        # DEFAULT SETTINGS
        # ----------------------------------------------------

        create_default_settings(
            user["id"]
        )

        # ----------------------------------------------------
        # SUCCESS
        # ----------------------------------------------------

        return jsonify({

            "success": True,

            "logged_in": True,

            "message": "Login successful.",

            "user": {
                "id": user["id"],
                "name": user["name"],
                "email": user["email"]
            }
        })

    except Exception as e:

        try:
            conn.close()
        except Exception:
            pass

        print(
            "LOGIN ERROR:",
            e
        )

        return jsonify({
            "success": False,
            "message": "Login failed.",
            "error": str(e)
        }), 500


# ============================================================
# LOGOUT
# ============================================================

@app.route(
    "/api/logout",
    methods=["POST"]
)
def logout():

    session.clear()

    return jsonify({
        "success": True,
        "message": "Logged out successfully."
    })


# ============================================================
# CHAT
# ============================================================

@app.route(
    "/api/chat",
    methods=["POST"]
)
def chat():

    # --------------------------------------------------------
    # LOGIN CHECK
    # --------------------------------------------------------

    if not is_logged_in():

        return jsonify({
            "success": False,
            "message": "Please login first."
        }), 401

    # --------------------------------------------------------
    # REQUEST DATA
    # --------------------------------------------------------

    data = request.get_json(
        silent=True
    )

    if not isinstance(
        data,
        dict
    ):

        data = request.form.to_dict()

    message = str(
        data.get("message")
        or data.get("prompt")
        or data.get("query")
        or ""
    ).strip()

    if not message:

        return jsonify({
            "success": False,
            "message": "Message cannot be empty."
        }), 400

    if len(message) > 10000:

        return jsonify({
            "success": False,
            "message": "Message is too long."
        }), 400

    user_id = current_user_id()

    # --------------------------------------------------------
    # SETTINGS
    # --------------------------------------------------------

    settings = get_user_settings(
        user_id
    )

    # --------------------------------------------------------
    # HISTORY
    # --------------------------------------------------------

    history = get_history(
        user_id,
        limit=10
    )

    # --------------------------------------------------------
    # HYBRID AI
    # --------------------------------------------------------

    result = ask_hybrid_ai(
        message,
        history,
        settings
    )

    answer = result.get(
        "answer"
    )

    provider = result.get(
        "provider",
        "none"
    )

    error = result.get(
        "error"
    )

    # --------------------------------------------------------
    # FAILURE
    # --------------------------------------------------------

    if not answer:

        return jsonify({
            "success": False,
            "message": "AI response nahi aa raha.",
            "error": error,
            "provider": provider
        }), 500

    # --------------------------------------------------------
    # SAVE CHAT
    # --------------------------------------------------------

    save_chat(
        user_id,
        message,
        answer,
        provider
    )

    # --------------------------------------------------------
    # RESPONSE
    # Multiple names for old/new bot.js compatibility
    # --------------------------------------------------------

    return jsonify({

        "success": True,

        "answer": answer,

        "reply": answer,

        "response": answer,

        "message": answer,

        "provider": provider,

        "mode": (
            "online"
            if provider == "gemini"
            else "offline"
        )
    })


# ============================================================
# HISTORY
# ============================================================

@app.route(
    "/api/history",
    methods=["GET"]
)
def history():

    if not is_logged_in():

        return jsonify({
            "success": False,
            "message": "Please login first."
        }), 401

    chats = get_history(
        current_user_id(),
        limit=100
    )

    return jsonify({

        "success": True,

        "history": chats,

        "chats": chats
    })


# ============================================================
# SINGLE HISTORY ITEM
# ============================================================

@app.route(
    "/api/history/<int:chat_id>",
    methods=["GET"]
)
def single_chat(chat_id):

    if not is_logged_in():

        return jsonify({
            "success": False,
            "message": "Please login first."
        }), 401

    conn = get_db()

    row = conn.execute(
        """
        SELECT *
        FROM chat_history
        WHERE id = ?
        AND user_id = ?
        """,
        (
            chat_id,
            current_user_id()
        )
    ).fetchone()

    conn.close()

    if not row:

        return jsonify({
            "success": False,
            "message": "Chat not found."
        }), 404

    return jsonify({
        "success": True,
        "chat": dict(row)
    })


# ============================================================
# DELETE CHAT
# ============================================================

@app.route(
    "/api/history/<int:chat_id>",
    methods=["DELETE"]
)
def delete_chat(chat_id):

    if not is_logged_in():

        return jsonify({
            "success": False,
            "message": "Please login first."
        }), 401

    conn = get_db()

    cursor = conn.execute(
        """
        DELETE FROM chat_history
        WHERE id = ?
        AND user_id = ?
        """,
        (
            chat_id,
            current_user_id()
        )
    )

    conn.commit()

    deleted = cursor.rowcount

    conn.close()

    if deleted == 0:

        return jsonify({
            "success": False,
            "message": "Chat not found."
        }), 404

    return jsonify({
        "success": True,
        "message": "Chat deleted successfully."
    })


# ============================================================
# CLEAR HISTORY
# ============================================================

@app.route(
    "/api/history/clear",
    methods=["POST", "DELETE"]
)
def clear_history():

    if not is_logged_in():

        return jsonify({
            "success": False,
            "message": "Please login first."
        }), 401

    conn = get_db()

    conn.execute(
        """
        DELETE FROM chat_history
        WHERE user_id = ?
        """,
        (current_user_id(),)
    )

    conn.commit()

    conn.close()

    return jsonify({
        "success": True,
        "message": "Chat history cleared."
    })


# ============================================================
# GET SETTINGS
# ============================================================

@app.route(
    "/api/settings",
    methods=["GET"]
)
def get_settings():

    if not is_logged_in():

        return jsonify({
            "success": False,
            "message": "Please login first."
        }), 401

    settings = get_user_settings(
        current_user_id()
    )

    return jsonify({
        "success": True,
        "settings": settings
    })


# ============================================================
# UPDATE SETTINGS
# ============================================================

@app.route(
    "/api/settings",
    methods=["POST", "PUT"]
)
def update_settings():

    if not is_logged_in():

        return jsonify({
            "success": False,
            "message": "Please login first."
        }), 401

    data = request.get_json(
        silent=True
    )

    if not isinstance(
        data,
        dict
    ):

        data = request.form.to_dict()

    user_id = current_user_id()

    current = get_user_settings(
        user_id
    )

    language = data.get(
        "language",
        current["language"]
    )

    theme = data.get(
        "theme",
        current["theme"]
    )

    notifications = data.get(
        "notifications",
        current["notifications"]
    )

    if isinstance(
        notifications,
        str
    ):

        notifications = notifications.lower() in [
            "true",
            "1",
            "yes",
            "on"
        ]

    if isinstance(
        notifications,
        bool
    ):

        notifications = (
            1
            if notifications
            else 0
        )

    try:

        notifications = int(
            notifications
        )

    except Exception:

        notifications = 1

    conn = get_db()

    conn.execute(
        """
        INSERT INTO settings
        (
            user_id,
            language,
            theme,
            notifications
        )
        VALUES (?, ?, ?, ?)

        ON CONFLICT(user_id)
        DO UPDATE SET
            language = excluded.language,
            theme = excluded.theme,
            notifications = excluded.notifications
        """,
        (
            user_id,
            language,
            theme,
            notifications
        )
    )

    conn.commit()

    conn.close()

    return jsonify({

        "success": True,

        "message": "Settings updated successfully.",

        "settings": {
            "language": language,
            "theme": theme,
            "notifications": notifications
        }
    })


# ============================================================
# AI STATUS
# ============================================================

@app.route(
    "/api/status",
    methods=["GET"]
)
def status():

    gemini_configured = bool(
        GEMINI_API_KEY
    )

    ollama_status = ollama_available()

    internet = internet_available()

    # --------------------------------------------------------
    # MODE
    # --------------------------------------------------------

    if gemini_configured and ollama_status:

        mode = "hybrid"

    elif gemini_configured:

        mode = "online"

    elif ollama_status:

        mode = "offline"

    else:

        mode = "none"

    return jsonify({

        "success": True,

        "internet": internet,

        "gemini": gemini_configured,

        "gemini_configured": gemini_configured,

        "gemini_model": GEMINI_MODEL,

        "ollama": ollama_status,

        "local_ai": ollama_status,

        "ollama_model": OLLAMA_MODEL,

        "model": OLLAMA_MODEL,

        "mode": mode,

        "hybrid": (
            gemini_configured
            and ollama_status
        )
    })


# ============================================================
# TEST AI
# ============================================================

@app.route(
    "/api/test-ai",
    methods=["GET", "POST"]
)
def test_ai():

    if not is_logged_in():

        return jsonify({
            "success": False,
            "message": "Please login first."
        }), 401

    settings = get_user_settings(
        current_user_id()
    )

    result = ask_hybrid_ai(
        "Hello! Give me a short introduction as CollegeBot.",
        [],
        settings
    )

    if not result.get("answer"):

        return jsonify({

            "success": False,

            "message": "AI test failed.",

            "error": result.get(
                "error"
            ),

            "provider": result.get(
                "provider"
            )
        }), 500

    return jsonify({

        "success": True,

        "message": "AI is working.",

        "answer": result["answer"],

        "reply": result["answer"],

        "provider": result["provider"],

        "mode": (
            "online"
            if result["provider"] == "gemini"
            else "offline"
        )
    })


# ============================================================
# OLLAMA MODELS
# ============================================================

@app.route(
    "/api/ollama/models",
    methods=["GET"]
)
def ollama_models():

    models = get_ollama_models()

    return jsonify({

        "success": True,

        "models": models,

        "current_model": OLLAMA_MODEL
    })


# ============================================================
# AI INFO
# ============================================================

@app.route(
    "/api/ai-info",
    methods=["GET"]
)
def ai_info():

    gemini = bool(
        GEMINI_API_KEY
    )

    ollama = ollama_available()

    if gemini and ollama:

        mode = "HYBRID"

    elif gemini:

        mode = "ONLINE"

    elif ollama:

        mode = "OFFLINE"

    else:

        mode = "UNAVAILABLE"

    return jsonify({

        "success": True,

        "mode": mode,

        "providers": {

            "gemini": {
                "available": gemini,
                "model": GEMINI_MODEL
            },

            "ollama": {
                "available": ollama,
                "model": OLLAMA_MODEL
            }
        }
    })


# ============================================================
# ERROR HANDLERS
# ============================================================

@app.errorhandler(404)
def not_found(error):

    # Browser page request ke liye index
    if request.path == "/":

        return render_template(
            "index.html"
        )

    return jsonify({

        "success": False,

        "message": "Route not found."

    }), 404


@app.errorhandler(500)
def internal_error(error):

    return jsonify({

        "success": False,

        "message": "Internal server error.",

        "error": str(error)

    }), 500


# ============================================================
# START SERVER
# ============================================================

if __name__ == "__main__":

    print()
    print("=" * 65)
    print("                    COLLEGEBOT")
    print("=" * 65)

    print()
    print("AI CONFIGURATION")
    print("-" * 65)

    # --------------------------------------------------------
    # GEMINI
    # --------------------------------------------------------

    if GEMINI_API_KEY:

        print(
            "Gemini API       : CONFIGURED"
        )

    else:

        print(
            "Gemini API       : NOT CONFIGURED"
        )

    print(
        "Gemini Model     :",
        GEMINI_MODEL
    )

    # --------------------------------------------------------
    # OLLAMA
    # --------------------------------------------------------

    ollama_status = ollama_available()

    if ollama_status:

        print(
            "Ollama            : RUNNING"
        )

    else:

        print(
            "Ollama            : NOT RUNNING"
        )

    print(
        "Ollama Model      :",
        OLLAMA_MODEL
    )

    # --------------------------------------------------------
    # INTERNET
    # --------------------------------------------------------

    internet = internet_available()

    print(
        "Internet          :",
        "AVAILABLE"
        if internet
        else "OFFLINE"
    )

    print()

    # --------------------------------------------------------
    # MODE
    # --------------------------------------------------------

    if GEMINI_API_KEY and ollama_status:

        print(
            "AI MODE           : HYBRID"
        )

        print(
            "                    Gemini + Ollama fallback"
        )

    elif GEMINI_API_KEY:

        print(
            "AI MODE           : ONLINE"
        )

        print(
            "                    Gemini"
        )

    elif ollama_status:

        print(
            "AI MODE           : OFFLINE"
        )

        print(
            "                    Ollama"
        )

    else:

        print(
            "AI MODE           : NONE"
        )

        print(
            "                    Configure Gemini or start Ollama"
        )

    print()
    print("-" * 65)

    print(
        "Website           : http://127.0.0.1:5000"
    )

    print("-" * 65)

    print()
    print(
        "CollegeBot server starting..."
    )
    print()

    app.run(
        host="127.0.0.1",
        port=5000,
        debug=True
    )