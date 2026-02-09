import os
import shutil
import uuid
import json
import logging
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, Request, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import jwt
import bcrypt
from pydantic import BaseModel, EmailStr
from dotenv import load_dotenv
import socketio

from database_manager import db_manager
from services.nlp_to_sql_v2 import nlp_to_sql

# Configuration
load_dotenv()
JWT_SECRET = os.getenv("JWT_SECRET", "super-secret-key")
JWT_ALGORITHM = "HS256"
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "./uploads/databases")
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = FastAPI(title="CollabSQL API")

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Socket.io Setup
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')
socket_app = socketio.ASGIApp(sio, app)

# Pydantic Models
class UserRegister(BaseModel):
    email: EmailStr
    username: str
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class NLQuery(BaseModel):
    databaseId: int
    query: str
    conversationHistory: List = []
    selectedTable: Optional[str] = None

class SQLExecute(BaseModel):
    databaseId: int
    query: str
    isWrite: bool = False

# Auth Middleware
async def get_current_user(request: Request):
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    
    token = auth_header.split(" ")[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# --- AUTH ROUTES ---

@app.post("/api/auth/register")
async def register(user: UserRegister):
    existing = db_manager.get_system_row("SELECT id FROM users WHERE email = ? OR username = ?", (user.email, user.username))
    if existing:
        raise HTTPException(status_code=400, detail="User already exists")
    
    hashed_password = bcrypt.hashpw(user.password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    result = db_manager.run_system_query(
        "INSERT INTO users (email, username, password_hash, email_verified) VALUES (?, ?, ?, 1)",
        (user.email, user.username, hashed_password)
    )
    
    token_payload = {"userId": result["lastID"], "email": user.email, "username": user.username}
    token = jwt.encode(token_payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    
    return {
        "message": "Registration successful",
        "user": {"id": result["lastID"], "email": user.email, "username": user.username},
        "token": token
    }

@app.post("/api/auth/login")
async def login(user_data: UserLogin):
    user = db_manager.get_system_row("SELECT * FROM users WHERE email = ?", (user_data.email,))
    if not user or not bcrypt.checkpw(user_data.password.encode('utf-8'), user["password_hash"].encode('utf-8')):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    token_payload = {"userId": user["id"], "email": user["email"], "username": user["username"]}
    token = jwt.encode(token_payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    
    return {
        "message": "Login successful",
        "user": {"id": user["id"], "email": user["email"], "username": user["username"]},
        "token": token
    }

@app.get("/api/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    user = db_manager.get_system_row("SELECT id, email, username FROM users WHERE id = ?", (current_user["userId"],))
    return {"user": user}

@app.get("/api/auth/verify")
async def verify_token(current_user: dict = Depends(get_current_user)):
    user = db_manager.get_system_row("SELECT id, email, username FROM users WHERE id = ?", (current_user["userId"],))
    return {"valid": True, "user": user}

@app.post("/api/auth/logout")
async def logout_user():
    return {"message": "Logged out"}

# --- DATABASE ROUTES ---

@app.post("/api/database/upload")
async def upload_database(name: str = Body(...), file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    file_ext = os.path.splitext(file.filename)[1]
    unique_filename = f"{uuid.uuid4()}{file_ext}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    result = db_manager.run_system_query(
        "INSERT INTO databases (name, original_filename, file_path, owner_id) VALUES (?, ?, ?, ?)",
        (name, file.filename, file_path, current_user["userId"])
    )
    
    # Extract schema and cache it
    try:
        import sqlite3
        conn = sqlite3.connect(file_path)
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [row[0] for row in cursor.fetchall()]
        
        schema = {"tables": []}
        for table_name in tables:
            cursor.execute(f"PRAGMA table_info(\"{table_name}\")")
            columns = [{"name": r[1], "type": r[2], "notNull": bool(r[3]), "primaryKey": bool(r[5])} for r in cursor.fetchall()]
            
            cursor.execute(f"SELECT COUNT(*) FROM \"{table_name}\"")
            row_count = cursor.fetchone()[0]
            
            schema["tables"].append({
                "name": table_name,
                "columns": columns,
                "rowCount": row_count
            })
        conn.close()
        
        db_manager.run_system_query(
            "INSERT INTO schema_cache (database_id, schema_json) VALUES (?, ?)",
            (result["lastID"], json.dumps(schema))
        )
    except Exception as e:
        print(f"Schema extraction error: {e}")

    return {"id": result["lastID"], "name": name, "message": "Database uploaded successfully"}

@app.get("/api/database/list")
async def list_databases(current_user: dict = Depends(get_current_user)):
    databases = db_manager.get_system_rows(
        "SELECT * FROM databases WHERE owner_id = ?",
        (current_user["userId"],)
    )
    return {"databases": databases}


def _extract_schema(file_path: str) -> dict:
    """Helper to extract schema from a SQLite database file"""
    import sqlite3
    conn = sqlite3.connect(file_path)
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    tables = [row[0] for row in cursor.fetchall()]

    schema = {"tables": []}
    for table_name in tables:
        cursor.execute(f'PRAGMA table_info("{table_name}")')
        columns = [{"name": r[1], "type": r[2], "notNull": bool(r[3]), "primaryKey": bool(r[5])} for r in cursor.fetchall()]

        cursor.execute(f'SELECT COUNT(*) FROM "{table_name}"')
        row_count = cursor.fetchone()[0]

        schema["tables"].append({
            "name": table_name,
            "columns": columns,
            "rowCount": row_count
        })
    conn.close()
    return schema


@app.get("/api/database/{database_id}")
async def get_database_details(database_id: int, current_user: dict = Depends(get_current_user)):
    db = db_manager.get_system_row(
        "SELECT d.*, u.username as owner_username FROM databases d JOIN users u ON d.owner_id = u.id WHERE d.id = ?",
        (database_id,)
    )
    if not db:
        raise HTTPException(status_code=404, detail="Database not found")

    # Get schema
    schema_row = db_manager.get_system_row(
        "SELECT schema_json FROM schema_cache WHERE database_id = ? ORDER BY cached_at DESC LIMIT 1",
        (database_id,)
    )

    schema = None
    if schema_row:
        schema = json.loads(schema_row["schema_json"])
    elif os.path.exists(db["file_path"]):
        schema = _extract_schema(db["file_path"])
        db_manager.run_system_query(
            "INSERT INTO schema_cache (database_id, schema_json) VALUES (?, ?)",
            (database_id, json.dumps(schema))
        )

    # Get collaborators
    collaborators = db_manager.get_system_rows(
        "SELECT dp.*, u.username, u.email FROM database_permissions dp JOIN users u ON dp.user_id = u.id WHERE dp.database_id = ?",
        (database_id,)
    )

    # Determine user permission
    user_permission = "owner" if db["owner_id"] == current_user["userId"] else "viewer"
    perm_row = db_manager.get_system_row(
        "SELECT permission_level FROM database_permissions WHERE database_id = ? AND user_id = ?",
        (database_id, current_user["userId"])
    )
    if perm_row:
        user_permission = perm_row["permission_level"]

    return {
        "database": {
            "id": db["id"],
            "name": db["name"],
            "original_filename": db["original_filename"],
            "owner_username": db["owner_username"],
            "created_at": db["created_at"],
            "updated_at": db.get("created_at", ""),
            "schema": schema or {"tables": []},
            "collaborators": collaborators,
            "userPermission": user_permission
        }
    }


@app.get("/api/database/{database_id}/schema")
async def get_database_schema(database_id: int, refresh: bool = False, current_user: dict = Depends(get_current_user)):
    db = db_manager.get_system_row("SELECT file_path FROM databases WHERE id = ?", (database_id,))
    if not db:
        raise HTTPException(status_code=404, detail="Database not found")

    if not refresh:
        schema_row = db_manager.get_system_row(
            "SELECT schema_json FROM schema_cache WHERE database_id = ? ORDER BY cached_at DESC LIMIT 1",
            (database_id,)
        )
        if schema_row:
            return {"schema": json.loads(schema_row["schema_json"])}

    schema = _extract_schema(db["file_path"])
    db_manager.run_system_query(
        "INSERT INTO schema_cache (database_id, schema_json) VALUES (?, ?)",
        (database_id, json.dumps(schema))
    )
    return {"schema": schema}


@app.get("/api/database/{database_id}/download")
async def download_database(database_id: int, current_user: dict = Depends(get_current_user)):
    from fastapi.responses import FileResponse
    db = db_manager.get_system_row("SELECT file_path, original_filename FROM databases WHERE id = ?", (database_id,))
    if not db:
        raise HTTPException(status_code=404, detail="Database not found")
    return FileResponse(path=db["file_path"], filename=db["original_filename"], media_type="application/x-sqlite3")


@app.delete("/api/database/{database_id}")
async def delete_database(database_id: int, current_user: dict = Depends(get_current_user)):
    db = db_manager.get_system_row("SELECT * FROM databases WHERE id = ? AND owner_id = ?", (database_id, current_user["userId"]))
    if not db:
        raise HTTPException(status_code=404, detail="Database not found or not owned by you")

    if os.path.exists(db["file_path"]):
        os.remove(db["file_path"])

    db_manager.run_system_query("DELETE FROM schema_cache WHERE database_id = ?", (database_id,))
    db_manager.run_system_query("DELETE FROM commits WHERE database_id = ?", (database_id,))
    db_manager.run_system_query("DELETE FROM database_permissions WHERE database_id = ?", (database_id,))
    db_manager.run_system_query("DELETE FROM databases WHERE id = ?", (database_id,))

    return {"message": "Database deleted successfully"}


@app.get("/api/database/{database_id}/table/{table_name}/sample")
async def get_sample_data(database_id: int, table_name: str, limit: int = 5, current_user: dict = Depends(get_current_user)):
    import sqlite3
    db = db_manager.get_system_row("SELECT file_path FROM databases WHERE id = ?", (database_id,))
    if not db:
        raise HTTPException(status_code=404, detail="Database not found")
    conn = sqlite3.connect(db["file_path"])
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute(f'SELECT * FROM "{table_name}" LIMIT ?', (limit,))
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return {"data": rows}


# --- QUERY ROUTES ---

@app.post("/api/query/nl")
async def query_nl(data: NLQuery, current_user: dict = Depends(get_current_user)):
    schema_row = db_manager.get_system_row(
        "SELECT schema_json FROM schema_cache WHERE database_id = ? ORDER BY cached_at DESC LIMIT 1",
        (data.databaseId,)
    )
    if not schema_row:
        raise HTTPException(status_code=404, detail="Schema not found")
        
    schema = json.loads(schema_row["schema_json"])
    result = await nlp_to_sql.convert_to_sql(data.query, schema, data.conversationHistory, data.selectedTable)
    return result

@app.get("/api/query/suggestions/{database_id}")
async def get_suggestions(database_id: int, current_user: dict = Depends(get_current_user)):
    schema_row = db_manager.get_system_row(
        "SELECT schema_json FROM schema_cache WHERE database_id = ? ORDER BY cached_at DESC LIMIT 1",
        (database_id,)
    )
    if not schema_row:
        return {"suggestions": []}

    schema = json.loads(schema_row["schema_json"])
    suggestions = []
    for table in schema.get("tables", [])[:3]:
        suggestions.append({"category": "View Data", "query": f"Show all data from {table['name']}", "description": f"View all {table.get('rowCount', 0)} records"})
        suggestions.append({"category": "Count", "query": f"How many rows in {table['name']}?", "description": "Count total records"})
    return {"suggestions": suggestions}


@app.post("/api/query/execute")
async def execute_sql(data: SQLExecute, current_user: dict = Depends(get_current_user)):
    db_row = db_manager.get_system_row("SELECT file_path FROM databases WHERE id = ?", (data.databaseId,))
    if not db_row:
        raise HTTPException(status_code=404, detail="Database not found")
        
    try:
        import sqlite3
        conn = sqlite3.connect(db_row["file_path"])
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        query_upper = data.query.strip().upper()
        if query_upper.startswith("SELECT") or query_upper.startswith("PRAGMA"):
            cursor.execute(data.query)
            rows = cursor.fetchall()
            result = [dict(r) for r in rows]
            conn.close()
            return {"success": True, "result": result, "queryType": "SELECT"}
        else:
            cursor.execute(data.query)
            changes = conn.total_changes
            conn.commit()
            conn.close()

            # Record commit for history
            op_type = "UPDATE"
            if query_upper.startswith("INSERT"):
                op_type = "INSERT"
            elif query_upper.startswith("DELETE"):
                op_type = "DELETE"
            elif query_upper.startswith("CREATE"):
                op_type = "CREATE"

            try:
                db_manager.run_system_query(
                    "INSERT INTO commits (database_id, user_id, query_executed, rows_affected, operation_type) VALUES (?, ?, ?, ?, ?)",
                    (data.databaseId, current_user["userId"], data.query, changes, op_type)
                )
                # Refresh schema cache after write operations
                schema = _extract_schema(db_row["file_path"])
                db_manager.run_system_query(
                    "INSERT INTO schema_cache (database_id, schema_json) VALUES (?, ?)",
                    (data.databaseId, json.dumps(schema))
                )
            except Exception as commit_err:
                logging.warning(f"Failed to record commit: {commit_err}")

            return {"success": True, "result": {"rowsAffected": changes}, "queryType": "WRITE"}
    except Exception as e:
        return JSONResponse(status_code=400, content={"success": False, "error": str(e)})

# --- HISTORY ROUTES ---

@app.get("/api/history/{database_id}")
async def get_history(database_id: int, current_user: dict = Depends(get_current_user)):
    commits = db_manager.get_system_rows(
        "SELECT c.*, u.username FROM commits c JOIN users u ON c.user_id = u.id WHERE c.database_id = ? ORDER BY c.timestamp DESC LIMIT 50",
        (database_id,)
    )
    return {"commits": commits}


@app.get("/api/history/{database_id}/stats")
async def get_history_stats(database_id: int, current_user: dict = Depends(get_current_user)):
    total = db_manager.get_system_row("SELECT COUNT(*) as count FROM commits WHERE database_id = ?", (database_id,))
    return {"totalCommits": total["count"] if total else 0}


# --- COLLABORATION ROUTES ---

@app.get("/api/collaboration/{database_id}/collaborators")
async def get_collaborators(database_id: int, current_user: dict = Depends(get_current_user)):
    collaborators = db_manager.get_system_rows(
        "SELECT dp.*, u.username, u.email FROM database_permissions dp JOIN users u ON dp.user_id = u.id WHERE dp.database_id = ?",
        (database_id,)
    )
    return {"collaborators": collaborators}


@app.post("/api/collaboration/{database_id}/collaborators")
async def add_collaborator(database_id: int, data: dict = Body(...), current_user: dict = Depends(get_current_user)):
    user = db_manager.get_system_row("SELECT id FROM users WHERE email = ?", (data.get("userEmail"),))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    db_manager.run_system_query(
        "INSERT OR REPLACE INTO database_permissions (database_id, user_id, permission_level) VALUES (?, ?, ?)",
        (database_id, user["id"], data.get("permissionLevel", "viewer"))
    )
    return {"message": "Collaborator added"}


@app.get("/api/collaboration/{database_id}/active")
async def get_active_users(database_id: int, current_user: dict = Depends(get_current_user)):
    return []


# --- SOCKET EVENTS ---

@sio.event
async def connect(sid, environ, auth):
    print(f"Client connected: {sid}")

@sio.on('join-database')
async def join_database(sid, database_id):
    await sio.enter_room(sid, f"db_{database_id}")
    await sio.emit('joined-database', {'databaseId': database_id}, room=sid)
    await sio.emit('user-joined', {'userId': 'some_id'}, room=f"db_{database_id}", skip_sid=sid)

@sio.on('leave-database')
async def leave_database(sid, database_id):
    await sio.leave_room(sid, f"db_{database_id}")
    await sio.emit('user-left', {'userId': 'some_id'}, room=f"db_{database_id}", skip_sid=sid)

@sio.on('query-executed')
async def query_executed(sid, data):
    database_id = data.get('databaseId')
    await sio.emit('database-updated', data, room=f"db_{database_id}", skip_sid=sid)

@sio.on('typing')
async def typing(sid, database_id):
    await sio.emit('user-typing', {'userId': 'some_id'}, room=f"db_{database_id}", skip_sid=sid)

@sio.on('stop-typing')
async def stop_typing(sid, database_id):
    await sio.emit('user-stop-typing', {'userId': 'some_id'}, room=f"db_{database_id}", skip_sid=sid)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(socket_app, host="0.0.0.0", port=5000)
