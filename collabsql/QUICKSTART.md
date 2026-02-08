# Quick Start Guide

Get CollabSQL running in 5 minutes!

## Step 1: Install Dependencies

```bash
# Backend
cd backend
npm install

# Frontend (in new terminal)
cd frontend
npm install
```

## Step 2: Configure Backend

```bash
cd backend

# Copy environment file
copy .env.example .env

# Edit .env and set JWT_SECRET (REQUIRED)
# Use any random 32+ character string, for example:
JWT_SECRET=my-super-secret-jwt-key-change-this-12345678

# For AI features (OPTIONAL - skip if testing):
# Option A: Get free Gemini API key from https://makersuite.google.com/app/apikey
GEMINI_API_KEY=your-key-here

# Option B: Or use fallback parser (no API needed)
# Just leave GEMINI_API_KEY empty
```

## Step 3: Initialize Database

```bash
cd backend
npm run init-db
```

## Step 4: Start Services

**Terminal 1 (Backend):**
```bash
cd backend
npm run dev
```
Wait for: "CollabSQL Backend Server Running"

**Terminal 2 (Frontend):**
```bash
cd frontend
npm run dev
```
Wait for: "Local: http://localhost:3000"

## Step 5: Use the App

1. Open http://localhost:3000
2. Register a new account
3. Upload a test database (.db, .sqlite, .sqlite3 file)
4. Start chatting!

## Test Queries

Try these natural language queries:

```
"Show all tables"
"How many rows in [table_name]?"
"Get all records from [table_name]"
"Show columns from [table_name]"
"Count records in [table_name]"
```

## Don't Have a Database?

Create a simple test database:

**Option 1: Use SQLite Browser (GUI)**
- Download: https://sqlitebrowser.org/
- Create new database
- Add a simple table
- Upload to CollabSQL

**Option 2: Using Python**
```python
import sqlite3

conn = sqlite3.connect('test.db')
cursor = conn.cursor()

# Create table
cursor.execute('''
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    age INTEGER
)
''')

# Insert sample data
users = [
    ('Alice', 'alice@example.com', 25),
    ('Bob', 'bob@example.com', 30),
    ('Charlie', 'charlie@example.com', 35),
]

cursor.executemany('INSERT INTO users (name, email, age) VALUES (?, ?, ?)', users)

conn.commit()
conn.close()

print("test.db created successfully!")
```

Run: `python create_test_db.py`
Then upload `test.db` to CollabSQL

## Common Issues

**"Cannot find module" error**
```bash
rm -rf node_modules package-lock.json
npm install
```

**Port already in use**
- Backend: Change PORT in .env (default: 5000)
- Frontend: Change port in vite.config.ts (default: 3000)

**Database init fails**
```bash
# Make sure you're in backend directory
cd backend
# Remove old database
rm -rf data/
# Re-initialize
npm run init-db
```

## Next Steps

- Read the full [README.md](README.md)
- Invite collaborators (Collaborators tab)
- View change history (History tab)
- Explore database schema (Schema tab)

## Need Help?

Check the troubleshooting section in README.md

Enjoy using CollabSQL! 🚀
