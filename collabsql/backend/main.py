import os
import shutil
import uuid
import json
import logging
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, Request, Body, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import jwt
import bcrypt
from pydantic import BaseModel, EmailStr
from dotenv import load_dotenv
import socketio
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import random
import string

from database_manager import db_manager
from services.premium_nlp_service import premium_nlp_service

# Configuration
load_dotenv()
JWT_SECRET = os.getenv("JWT_SECRET", "super-secret-key")
JWT_ALGORITHM = "HS256"
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "./uploads/databases")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# SMTP Configuration
SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")

def send_email(to_email, subject, body):
    if not SMTP_USER or not SMTP_PASS:
        logging.warning(f"SMTP not configured. Email to {to_email} skipped. Body: {body}")
        return False
    try:
        msg = MIMEMultipart()
        msg['From'] = SMTP_USER
        msg['To'] = to_email
        msg['Subject'] = subject
        msg.attach(MIMEText(body, 'plain'))
        
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.starttls()
        server.login(SMTP_USER, SMTP_PASS)
        server.send_message(msg)
        server.quit()
        return True
    except Exception as e:
        logging.error(f"SMTP Error: {e}")
        return False

def verify_gmail_credentials(email, password):
    try:
        server = smtplib.SMTP("smtp.gmail.com", 587)
        server.starttls()
        server.login(email, password)
        server.quit()
        return True, "Success"
    except smtplib.SMTPAuthenticationError as e:
        logging.error(f"Gmail Verification Error: {e}")
        # Error 534 5.7.9 specifically means 2FA is on and an App Password is required
        if b'5.7.9' in bytes(str(e), 'utf-8') or b'Application-specific password required' in bytes(str(e), 'utf-8'):
            return False, "Google Security Block: Because you have 2-Step Verification enabled, Google requires an 'App Password' instead of your regular password for this step."
        return False, "Security verification failed. Please check if your Gmail password is correct."
    except Exception as e:
        logging.error(f"Gmail Verification Error: {e}")
        return False, "Verification failed. Please ensure you are using a valid Gmail account."

api_app = FastAPI(title="CollabSQL API")

# Setup CORS
api_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Socket.io Setup
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')
app = socketio.ASGIApp(sio, api_app)

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

class GmailVerify(BaseModel):
    email: EmailStr
    password: str

class ForgotPassword(BaseModel):
    email: EmailStr

class ResetPassword(BaseModel):
    token: str
    newPassword: str

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

@api_app.post("/api/auth/register")
def register(user: UserRegister):
    existing = db_manager.get_system_row("SELECT id FROM users WHERE email = ? OR username = ?", (user.email, user.username))
    if existing:
        raise HTTPException(status_code=400, detail="User already exists")
    
    # Using 10 rounds for better performance while maintaining high security
    hashed_password = bcrypt.hashpw(user.password.encode('utf-8'), bcrypt.gensalt(10)).decode('utf-8')
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

@api_app.post("/api/auth/verify-gmail")
async def verify_gmail(data: GmailVerify):
    if not data.email.endswith("@gmail.com"):
        raise HTTPException(status_code=400, detail="Only Gmail addresses are supported for this verification step.")
    
    is_valid, message = verify_gmail_credentials(data.email, data.password)
    if not is_valid:
        raise HTTPException(status_code=401, detail=message)
    
    return {"message": "Gmail verified successfully"}

@api_app.post("/api/auth/forgot-password")
async def forgot_password(data: ForgotPassword):
    user = db_manager.get_system_row("SELECT id FROM users WHERE email = ?", (data.email,))
    if not user:
        # Don't reveal if user exists for security, but return success
        return {"message": "If an account exists with this email, a reset link has been sent."}
    
    token = ''.join(random.choices(string.ascii_letters + string.digits, k=40))
    expiry = (datetime.now() + timedelta(hours=1)).strftime("%Y-%m-%d %H:%M:%S")
    
    db_manager.run_system_query(
        "UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE id = ?",
        (token, expiry, user["id"])
    )
    
    reset_url = f"http://localhost:3000/auth?token={token}" # Adjust for production
    body = f"Hello,\n\nPlease click the following link to reset your CollabSQL password:\n{reset_url}\n\nThis link expires in 1 hour."
    
    send_email(data.email, "Reset your CollabSQL Password", body)
    
    return {"message": "Reset instructions sent to your email."}

@api_app.post("/api/auth/reset-password")
def reset_password(data: ResetPassword):
    user = db_manager.get_system_row(
        "SELECT id FROM users WHERE reset_token = ? AND reset_token_expiry > CURRENT_TIMESTAMP",
        (data.token,)
    )
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    
    hashed_password = bcrypt.hashpw(data.newPassword.encode('utf-8'), bcrypt.gensalt(10)).decode('utf-8')
    db_manager.run_system_query(
        "UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expiry = NULL WHERE id = ?",
        (hashed_password, user["id"])
    )
    
    return {"message": "Password reset successful. You can now log in."}

@api_app.post("/api/auth/login")
def login(user_data: UserLogin):
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

@api_app.get("/api/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    user = db_manager.get_system_row("SELECT id, email, username FROM users WHERE id = ?", (current_user["userId"],))
    return {"user": user}

@api_app.get("/api/auth/verify")
def verify_token(current_user: dict = Depends(get_current_user)):
    user = db_manager.get_system_row("SELECT id, email, username FROM users WHERE id = ?", (current_user["userId"],))
    return {"valid": True, "user": user}

@api_app.post("/api/auth/logout")
async def logout_user():
    return {"message": "Logged out"}

# --- DATABASE ROUTES ---

@api_app.post("/api/database/upload")
async def upload_database(name: str = Form(...), file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    file_ext = os.path.splitext(file.filename)[1].lower()
    
    # Check if it's a supported file format
    if file_ext not in [".db", ".sqlite", ".sqlite3", ".csv", ".xlsx", ".xls"]:
        raise HTTPException(status_code=400, detail="Unsupported file format. Please upload .db, .sqlite, .sqlite3, .csv, .xlsx, or .xls")

    unique_filename = f"{uuid.uuid4()}.db" # Save as .db
    file_path = os.path.join(UPLOAD_DIR, unique_filename)
    
    if file_ext == ".csv":
        import csv
        import sqlite3
        import io
        
        # Read CSV content
        content = await file.read()
        try:
            stream = io.StringIO(content.decode('utf-8'))
        except UnicodeDecodeError:
            stream = io.StringIO(content.decode('latin-1'))
        
        reader = csv.reader(stream)
        headers = next(reader)
        
        # Sanitize headers for SQLite
        sanitized_headers = [h.strip().replace(" ", "_").replace("-", "_") for h in headers]
        table_name = os.path.splitext(file.filename)[0].strip().replace(" ", "_").replace("-", "_")
        if not table_name: table_name = "data"
        
        # Create SQLite database from CSV
        conn = sqlite3.connect(file_path)
        cursor = conn.cursor()
        
        # Create table
        cols = ", ".join([f'"{h}" TEXT' for h in sanitized_headers])
        cursor.execute(f'CREATE TABLE "{table_name}" ({cols})')
        
        # Insert data
        placeholders = ", ".join(["?" for _ in sanitized_headers])
        cursor.executemany(f'INSERT INTO "{table_name}" VALUES ({placeholders})', reader)
        
        conn.commit()
        conn.close()
    
    elif file_ext in [".xlsx", ".xls"]:
        import sqlite3
        try:
            import pandas as pd
        except ImportError:
            raise HTTPException(status_code=500, detail="Excel support not available. Please install pandas and openpyxl.")
        
        # Save uploaded file temporarily
        temp_path = os.path.join(UPLOAD_DIR, f"temp_{uuid.uuid4()}{file_ext}")
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        try:
            # Read Excel file
            excel_file = pd.ExcelFile(temp_path)
            
            # Create SQLite database
            conn = sqlite3.connect(file_path)
            
            # Convert each sheet to a table
            for sheet_name in excel_file.sheet_names:
                df = pd.read_excel(temp_path, sheet_name=sheet_name)
                
                # Sanitize table name
                table_name = sheet_name.strip().replace(" ", "_").replace("-", "_")
                if not table_name: table_name = "data"
                
                # Write to SQLite
                df.to_sql(table_name, conn, if_exists='replace', index=False)
            
            conn.close()
        finally:
            # Clean up temp file
            if os.path.exists(temp_path):
                os.remove(temp_path)
    
    else:
        # Standard SQLite file upload
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
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
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

@api_app.get("/api/database/list")
async def list_databases(current_user: dict = Depends(get_current_user)):
    # Get databases owned by the user
    own_databases = db_manager.get_system_rows(
        "SELECT *, 'owner' as user_role FROM databases WHERE owner_id = ?",
        (current_user["userId"],)
    )
    
    # Get databases where the user is a collaborator but NOT the owner
    collaborated_databases = db_manager.get_system_rows(
        """
        SELECT d.*, dp.permission_level as user_role, u.username as owner_username
        FROM databases d
        JOIN database_permissions dp ON d.id = dp.database_id
        JOIN users u ON d.owner_id = u.id
        WHERE dp.user_id = ? AND d.owner_id != ?
        """,
        (current_user["userId"], current_user["userId"])
    )
    
    return {
        "databases": own_databases,
        "collaborated": collaborated_databases
    }


def _extract_schema(file_path: str) -> dict:
    """Helper to extract schema from a SQLite database file"""
    import sqlite3
    schema = {"tables": []}
    try:
        conn = sqlite3.connect(file_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        tables = [row[0] for row in cursor.fetchall()]

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
    except Exception as e:
        logging.warning(f"Could not extract schema from {file_path}: {e}")
        # If it's a CSV or other file, we might return an empty schema for now
        # Future: Add CSV parsing logic here
    return schema


@api_app.get("/api/database/{database_id}")
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
    user_permission = None
    if db["owner_id"] == current_user["userId"]:
        user_permission = "owner"
    else:
        perm_row = db_manager.get_system_row(
            "SELECT permission_level FROM database_permissions WHERE database_id = ? AND user_id = ?",
            (database_id, current_user["userId"])
        )
        if perm_row:
            user_permission = perm_row["permission_level"]
        else:
            raise HTTPException(status_code=403, detail="You do not have permission to access this database")

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


@api_app.get("/api/database/{database_id}/schema")
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


@api_app.get("/api/database/{database_id}/analytics")
async def get_database_analytics(database_id: int, current_user: dict = Depends(get_current_user)):
    # 1. Basic Schema Information
    db_row = db_manager.get_system_row("SELECT file_path, name FROM databases WHERE id = ?", (database_id,))
    if not db_row:
        raise HTTPException(status_code=404, detail="Database not found")

    schema_row = db_manager.get_system_row(
        "SELECT schema_json FROM schema_cache WHERE database_id = ? ORDER BY cached_at DESC LIMIT 1",
        (database_id,)
    )
    
    if not schema_row:
        return {"summary": {"tableCount": 0, "tables": []}}
    
    schema = json.loads(schema_row["schema_json"])
    tables = schema.get("tables", [])
    
    # 2. Mutation Activity Distribution
    mutation_stats = db_manager.get_system_rows(
        "SELECT operation_type, COUNT(*) as count FROM commits WHERE database_id = ? GROUP BY operation_type",
        (database_id,)
    )
    mutations = {
        "INSERT": 0, "UPDATE": 0, "DELETE": 0, "ALTER": 0, "CREATE": 0, "DROP": 0
    }
    for row in mutation_stats:
        op = row["operation_type"]
        if op in mutations:
            mutations[op] = row["count"]

    # 3. Calculate Global Column Distribution
    total_numeric = 0
    total_text = 0
    detailed_tables = []

    import sqlite3
    conn = sqlite3.connect(db_row["file_path"])
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    for table in tables:
        table_name = table["name"]
        row_count = table["rowCount"]
        cols = table["columns"]
        
        table_stats = {
            "name": table_name,
            "rowCount": row_count,
            "columnCount": len(cols),
            "numericCount": 0,
            "textCount": 0,
            "avgNullPercent": 0,
            "columns": [],
            "numeric_stats": [],
            "categorical_stats": []
        }

        null_sums = 0
        
        for col in cols:
            col_name = col["name"]
            col_type = col["type"].upper()
            is_numeric = any(t in col_type for t in ["INT", "FLOAT", "DECIMAL", "NUMERIC", "REAL", "DOUBLE"])
            
            if is_numeric:
                table_stats["numericCount"] += 1
                total_numeric += 1
            else:
                table_stats["textCount"] += 1
                total_text += 1

            # Get distinct and Null info
            try:
                cursor.execute(f'SELECT COUNT(DISTINCT "{col_name}"), COUNT(*) - COUNT("{col_name}") FROM "{table_name}"')
                row_res = cursor.fetchone()
                distinct_count = row_res[0]
                null_count = row_res[1]
                null_percent = round((null_count / row_count * 100), 1) if row_count > 0 else 0
                null_sums += null_percent
                
                table_stats["columns"].append({
                    "name": col_name,
                    "type": col_type,
                    "distinct": distinct_count,
                    "nullPercent": null_percent,
                    "category": "Numeric" if is_numeric else "Text",
                    "constraint": "PK" if col.get("primaryKey") else "-"
                })

                # Detailed Numeric Stats
                if is_numeric and row_count > 0:
                    cursor.execute(f'SELECT MIN("{col_name}"), MAX("{col_name}"), AVG("{col_name}"), SUM("{col_name}") FROM "{table_name}" WHERE "{col_name}" IS NOT NULL')
                    num_res = cursor.fetchone()
                    table_stats["numeric_stats"].append({
                        "name": col_name,
                        "min": num_res[0],
                        "max": num_res[1],
                        "avg": round(num_res[2], 2) if num_res[2] else 0,
                        "sum": num_res[3],
                        "distinct": distinct_count
                    })
                
                # Detailed Categorical Stats
                if not is_numeric and row_count > 0 and distinct_count > 0:
                    cursor.execute(f'SELECT "{col_name}", COUNT(*) as freq FROM "{table_name}" GROUP BY "{col_name}" ORDER BY freq DESC LIMIT 5')
                    top_vals = [dict(r) for r in cursor.fetchall()]
                    table_stats["categorical_stats"].append({
                        "name": col_name,
                        "distinct": distinct_count,
                        "top_values": top_vals
                    })

            except Exception as e:
                print(f"Stats Error for {table_name}.{col_name}: {e}")

        table_stats["avgNullPercent"] = round(null_sums / len(cols), 1) if cols else 0
        detailed_tables.append(table_stats)

    conn.close()

    return {
        "summary": {
            "databaseName": db_row["name"],
            "tableCount": len(tables),
            "totalRows": sum(t["rowCount"] for t in tables),
            "totalNumeric": total_numeric,
            "totalText": total_text,
            "mutations": mutations
        },
        "tables": detailed_tables,
        "reportDate": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }



@api_app.get("/api/database/{database_id}/download")
async def download_database(database_id: int, current_user: dict = Depends(get_current_user)):
    from fastapi.responses import FileResponse
    db = db_manager.get_system_row("SELECT file_path, original_filename FROM databases WHERE id = ?", (database_id,))
    if not db:
        raise HTTPException(status_code=404, detail="Database not found")
    return FileResponse(path=db["file_path"], filename=db["original_filename"], media_type="application/x-sqlite3")


@api_app.delete("/api/database/{database_id}")
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


@api_app.get("/api/database/{database_id}/table/{table_name}/sample")
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

@api_app.post("/api/query/nl")
async def query_nl(data: NLQuery, current_user: dict = Depends(get_current_user)):
    schema_row = db_manager.get_system_row(
        "SELECT schema_json FROM schema_cache WHERE database_id = ? ORDER BY cached_at DESC LIMIT 1",
        (data.databaseId,)
    )
    if not schema_row:
        raise HTTPException(status_code=404, detail="Schema not found")

    schema = json.loads(schema_row["schema_json"])
    # Pass username and database path for logging and feedback loop
    username = current_user.get("username", "anonymous")
    db_row = db_manager.get_system_row("SELECT file_path FROM databases WHERE id = ?", (data.databaseId,))
    db_path = db_row["file_path"] if db_row else None
    
    result = await premium_nlp_service.process_query(
        data.query,
        schema,
        data.conversationHistory,
        data.selectedTable,
        username=username,
        db_path=db_path
    )

    # EXECUTE AND RETRIEVE DATA if SQL was generated
    if result.get("type") == "sql" and result.get("query"):
        sql = result["query"]
        # Use existing db_row from above
        if db_row:
            try:
                import sqlite3
                conn = sqlite3.connect(db_row["file_path"])
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                
                query_upper = sql.strip().upper()
                is_read = query_upper.startswith("SELECT") or query_upper.startswith("PRAGMA") or query_upper.startswith("WITH")
                
                if is_read:
                    cursor.execute(sql)
                    rows = cursor.fetchall()
                    data = [dict(r) for r in rows]
                    result["result"] = data
                    
                    # Update explanation with actual data summary to avoid "silent success"
                    count = len(data)
                    prefix = f"**[Result: Found {count} records]**\n\n" if count > 0 else "**[Result: No records found matching the criteria]**\n\n"
                    result["explanation"] = prefix + (result.get("explanation") or "")
                    
                    if not data:
                        print(f"\n[INFO] Query ran but returned no data.")
                    else:
                        print(f"\n[OK] DATA RETRIEVED: Found {len(data)} records.")
                else:
                    cursor.execute(sql)
                    changes = conn.total_changes
                    conn.commit()
                    result["changes"] = changes
                    
                    # Update explanation for Write operations
                    result["explanation"] = f"**[Result: Success, {changes} row(s) affected]**\n\n" + (result.get("explanation") or "")
                    print(f"\n[OK] DATABASE UPDATED: {changes} rows affected.")
                    
                    # Record commit
                    op_type = "UPDATE"
                    if query_upper.startswith("INSERT"): op_type = "INSERT"
                    elif query_upper.startswith("DELETE"): op_type = "DELETE"
                    
                    db_manager.run_system_query(
                        "INSERT INTO commits (database_id, user_id, query_executed, rows_affected, operation_type) VALUES (?, ?, ?, ?, ?)",
                        (data.databaseId, current_user["userId"], sql, changes, op_type)
                    )
                    
                    # Refresh schema if it's a structural change
                    if any(x in query_upper for x in ["CREATE", "ALTER", "DROP", "RENAME"]):
                        new_schema = _extract_schema(db_row["file_path"])
                        db_manager.run_system_query(
                            "INSERT INTO schema_cache (database_id, schema_json) VALUES (?, ?)",
                            (data.databaseId, json.dumps(new_schema))
                        )
                
                conn.close()
            except Exception as e:
                print(f"[ERROR] EXECUTION FAILED: {e}")
                result["error"] = str(e)
                result["type"] = "error"

    return result

@api_app.get("/api/query/suggestions/{database_id}")
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


@api_app.post("/api/query/execute")
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

            # Determine success message
            success_msg = f"{op_type.capitalize()} successful"
            if changes > 0:
                success_msg = f"{changes} row(s) affected. {op_type.capitalize()} successful."
            else:
                success_msg = f"{op_type.capitalize()} successful (No rows affected)."

            return {"success": True, "result": {"rowsAffected": changes, "message": success_msg}, "queryType": "WRITE", "message": success_msg}
    except Exception as e:
        return JSONResponse(status_code=400, content={"success": False, "error": str(e)})

# --- HISTORY ROUTES ---

@api_app.get("/api/history/{database_id}")
async def get_history(database_id: int, current_user: dict = Depends(get_current_user)):
    commits = db_manager.get_system_rows(
        "SELECT c.*, u.username FROM commits c JOIN users u ON c.user_id = u.id WHERE c.database_id = ? ORDER BY c.timestamp DESC LIMIT 50",
        (database_id,)
    )
    return {"commits": commits}


@api_app.get("/api/history/{database_id}/stats")
async def get_history_stats(database_id: int, current_user: dict = Depends(get_current_user)):
    total = db_manager.get_system_row("SELECT COUNT(*) as count FROM commits WHERE database_id = ?", (database_id,))
    
    # Get operation distribution
    ops = db_manager.get_system_rows(
        "SELECT operation_type, COUNT(*) as count FROM commits WHERE database_id = ? GROUP BY operation_type",
        (database_id,)
    )
    
    return {
        "totalCommits": total["count"] if total else 0,
        "operationStats": ops
    }



# --- COLLABORATION ROUTES ---

@api_app.get("/api/collaboration/{database_id}/collaborators")
async def get_collaborators(database_id: int, current_user: dict = Depends(get_current_user)):
    collaborators = db_manager.get_system_rows(
        "SELECT dp.*, u.username, u.email FROM database_permissions dp JOIN users u ON dp.user_id = u.id WHERE dp.database_id = ?",
        (database_id,)
    )
    return {"collaborators": collaborators}


@api_app.post("/api/collaboration/{database_id}/collaborators")
async def add_collaborator(database_id: int, data: dict = Body(...), current_user: dict = Depends(get_current_user)):
    user = db_manager.get_system_row("SELECT id FROM users WHERE email = ?", (data.get("userEmail"),))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    db_manager.run_system_query(
        "INSERT OR REPLACE INTO database_permissions (database_id, user_id, permission_level, granted_by) VALUES (?, ?, ?, ?)",
        (database_id, user["id"], data.get("permissionLevel", "viewer"), current_user["userId"])
    )
    return {"message": "Collaborator added"}


@api_app.get("/api/collaboration/{database_id}/active")
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
async def typing(sid, data):
    # data is expected to be {'databaseId': ..., 'isTyping': ...}
    database_id = data.get('databaseId')
    is_typing = data.get('isTyping', True)
    
    # We should ideally have the user info from the session, 
    # but for now we'll emit what the frontend expects
    await sio.emit('typing', {
        'username': 'Collaborator', # This should be dynamic in a real app
        'isTyping': is_typing,
        'databaseId': database_id
    }, room=f"db_{database_id}", skip_sid=sid)

@sio.on('stop-typing')
async def stop_typing(sid, database_id):
    await sio.emit('typing', {
        'username': 'Collaborator',
        'isTyping': False,
        'databaseId': database_id
    }, room=f"db_{database_id}", skip_sid=sid)

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 5000))
    print(f"Starting CollabSQL Backend on port {port}...")
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)





