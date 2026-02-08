# CollabSQL - Natural Language Database Collaboration Platform

A production-ready web application that enables users to interact with SQLite databases using natural language, featuring GitHub-style version control, real-time collaboration, and enterprise-grade security.

## Features

### Core Functionality
- **Natural Language Queries**: Convert plain English to SQL using AI (Google Gemini API or local models)
- **All SQL Operations**: Support for CREATE, SELECT, INSERT, UPDATE, DELETE, and complex queries
- **Intelligent Clarification**: Bot asks for clarification when queries are ambiguous
- **Query Execution**: Execute generated SQL with proper validation and error handling

### Collaboration (GitHub-style)
- **Real-time Sync**: Changes instantly reflect across all connected users
- **Commit History**: Track who changed what and when
- **Version Control**: Complete audit trail of all database modifications
- **Access Control**: Owner, Editor, and Viewer permission levels
- **Active User Presence**: See who's currently viewing the database

### Security
- **JWT Authentication**: Secure token-based authentication
- **Password Hashing**: Bcrypt with salt rounds
- **SQL Injection Prevention**: Parameterized queries and validation
- **Input Sanitization**: XSS and injection protection
- **Rate Limiting**: DDoS protection
- **Permission-based Access**: Role-based authorization

### User Interface
- **ChatGPT-style Interface**: Clean, modern chat interface
- **Schema Viewer**: Explore database structure visually
- **History Timeline**: View all commits with diffs
- **Collaborators Panel**: Manage team access
- **Responsive Design**: Works on desktop and mobile

## Tech Stack

### Backend
- Node.js + Express
- SQLite3 for database operations
- Socket.io for real-time features
- JWT for authentication
- Bcrypt for password hashing
- Google Gemini API (free tier) for NLP

### Frontend
- React 18 + TypeScript
- Vite for build tooling
- TailwindCSS for styling
- Socket.io-client for WebSocket
- Axios for HTTP requests
- Zustand for state management
- React Router for navigation
- React Hot Toast for notifications

## Prerequisites

- Node.js 16+ and npm
- (Optional) Google Gemini API key - [Get one here](https://makersuite.google.com/app/apikey)
- (Optional) Ollama for local AI models - [Install here](https://ollama.ai)

## Installation

### 1. Clone the Repository

```bash
cd collabsql
```

### 2. Backend Setup

```bash
cd backend
npm install

# Copy environment file
copy .env.example .env

# Edit .env and configure:
# - JWT_SECRET (generate a random 32+ character string)
# - GEMINI_API_KEY (your Google Gemini API key) OR set USE_LOCAL_MODEL=true

# Initialize the database
npm run init-db
```

### 3. Frontend Setup

```bash
cd ../frontend
npm install
```

### 4. Environment Configuration

#### Backend (.env)
```env
# REQUIRED
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production-min-32-chars

# Choose ONE of the following:
# Option 1: Use Google Gemini (Free tier - 60 requests/minute)
GEMINI_API_KEY=your-gemini-api-key-here

# Option 2: Use local Ollama (Completely free, runs locally)
USE_LOCAL_MODEL=true
LOCAL_MODEL_URL=http://localhost:11434

# Option 3: Use fallback rule-based parser (No API needed)
# Just leave GEMINI_API_KEY empty and USE_LOCAL_MODEL=false
```

## Running the Application

### Development Mode

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```
Server runs on http://localhost:5000

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```
App runs on http://localhost:3000

### Production Mode

**Backend:**
```bash
cd backend
npm start
```

**Frontend:**
```bash
cd frontend
npm run build
npm run preview
```

## Usage Guide

### 1. Register an Account
- Navigate to http://localhost:3000
- Click "Sign up"
- Enter email, username, and password
- Login with your credentials

### 2. Upload a Database
- Click "Upload Database"
- Select a .db, .sqlite, or .sqlite3 file
- Give it a name and description
- Click "Upload"

### 3. Interact with Natural Language

**Examples:**
```
User: "Show all tables"
Bot: Lists all tables in the database

User: "How many rows in customers table?"
Bot: Executes: SELECT COUNT(*) FROM customers

User: "Get all orders from last month"
Bot: Executes appropriate date-filtered query

User: "Add a new customer named John"
Bot: Asks for clarification about required fields

User: "Show columns"
Bot: "Which table would you like to see columns for?"
     - customers (5 columns, 150 rows)
     - orders (8 columns, 300 rows)
     [Click to select]
```

### 4. Collaboration

**Invite Collaborators:**
1. Go to "Collaborators" tab
2. Click "Add Collaborator"
3. Enter their email
4. Choose permission level (Viewer or Editor)

**Permission Levels:**
- **Owner**: Full control, manage collaborators
- **Editor**: Read + Write (all CRUD operations)
- **Viewer**: Read-only (SELECT only)

**Real-time Features:**
- See who's online
- Get notified when others make changes
- Changes auto-sync across all users

### 5. View History
- Click "History" tab
- See all commits with:
  - Who made the change
  - What query was executed
  - When it happened
  - What tables were affected
- Filter by operation type
- View detailed diffs

## AI Model Options

### Option 1: Google Gemini (Recommended)
- **Free tier**: 60 requests/minute
- **Setup**: Get API key from https://makersuite.google.com/app/apikey
- **Quality**: Excellent NL to SQL conversion

### Option 2: Local Ollama
- **Completely free**
- **Setup**:
  ```bash
  # Install Ollama
  # Download model
  ollama pull llama2

  # Set in .env
  USE_LOCAL_MODEL=true
  ```
- **Quality**: Good, but slower than Gemini

### Option 3: Fallback Parser
- **No setup required**
- **Works offline**
- **Limitations**: Handles basic queries only
- **Best for**: Testing without API keys

## Security Best Practices

1. **Change JWT_SECRET** in production to a strong random string
2. **Use HTTPS** in production
3. **Set strong password requirements** (already implemented)
4. **Regular backups** of system database and uploaded files
5. **Monitor logs** for suspicious activity
6. **Update dependencies** regularly

## Project Structure

```
collabsql/
├── backend/
│   ├── config/          # Database configuration
│   ├── middleware/      # Auth, validation, error handling
│   ├── routes/          # API endpoints
│   ├── services/        # Business logic (NLP, schema extraction)
│   ├── socket/          # WebSocket handlers
│   ├── scripts/         # Utility scripts
│   ├── data/           # System database
│   ├── uploads/        # User database files
│   └── server.js       # Entry point
│
├── frontend/
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── pages/       # Page components
│   │   ├── services/    # API and Socket services
│   │   ├── store/       # Zustand state management
│   │   ├── App.tsx      # Main app component
│   │   └── main.tsx     # Entry point
│   └── index.html
│
└── README.md
```

## API Documentation

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user
- `GET /api/auth/verify` - Verify token

### Database
- `POST /api/database/upload` - Upload database file
- `GET /api/database/list` - Get user's databases
- `GET /api/database/:id` - Get database details
- `GET /api/database/:id/schema` - Get database schema
- `DELETE /api/database/:id` - Delete database

### Query
- `POST /api/query/nl` - Convert natural language to SQL
- `POST /api/query/execute` - Execute SQL query
- `GET /api/query/suggestions/:id` - Get query suggestions

### Collaboration
- `GET /api/collaboration/:id/collaborators` - List collaborators
- `POST /api/collaboration/:id/collaborators` - Add collaborator
- `PUT /api/collaboration/:id/collaborators/:userId` - Update permission
- `DELETE /api/collaboration/:id/collaborators/:userId` - Remove collaborator

### History
- `GET /api/history/:id` - Get commit history
- `GET /api/history/:id/commits/:commitId` - Get commit details
- `GET /api/history/:id/stats` - Get statistics

## WebSocket Events

### Client → Server
- `join-database` - Join database room
- `leave-database` - Leave database room
- `query-executed` - Notify query execution
- `typing` - User is typing
- `stop-typing` - User stopped typing
- `heartbeat` - Keep session alive

### Server → Client
- `joined-database` - Joined successfully
- `user-joined` - Another user joined
- `user-left` - User left
- `database-updated` - Database was modified
- `user-typing` - User is typing
- `user-stop-typing` - User stopped typing

## Troubleshooting

### Backend won't start
- Check if port 5000 is available
- Verify .env file exists and is configured
- Run `npm run init-db` to initialize database

### Frontend won't start
- Check if port 3000 is available
- Clear node_modules and reinstall: `rm -rf node_modules && npm install`

### NLP not working
- Check GEMINI_API_KEY is valid
- Verify API quota (60 req/min on free tier)
- Try fallback parser by leaving API key empty

### Database upload fails
- Check file size (max 50MB)
- Verify file extension (.db, .sqlite, .sqlite3)
- Ensure uploads/ directory exists and is writable

### Real-time features not working
- Check WebSocket connection in browser console
- Verify backend is running
- Check firewall settings

## Contributing

This is a production-ready educational project. Feel free to:
- Report bugs
- Suggest features
- Submit pull requests
- Use for learning

## License

MIT License - Free to use and modify

## Support

For issues and questions:
- Open an issue on GitHub
- Check existing documentation
- Review code comments

## Roadmap

Potential future enhancements:
- [ ] PostgreSQL and MySQL support
- [ ] Advanced diff viewer
- [ ] Export query results to CSV/JSON
- [ ] Query templates and saved queries
- [ ] Database branching (like Git branches)
- [ ] Visual query builder
- [ ] Advanced role permissions
- [ ] Database metrics and analytics
- [ ] Multi-database queries
- [ ] AI-powered query optimization suggestions

---

Built with ❤️ using modern web technologies
