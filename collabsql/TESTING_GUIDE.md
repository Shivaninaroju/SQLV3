# CollabSQL Testing & Debugging Guide

## ✅ System Status Check

### 1. **Verify Servers are Running**

#### Backend (Port 5000)
```bash
# Check backend health
curl http://localhost:5000/api/health

# Expected output:
# {"status":"ok","timestamp":"...","environment":"development"}
```

#### Frontend (Port 3000)
```bash
# Check if frontend is accessible
curl http://localhost:3000

# Should return HTML content with React app
```

### 2. **Test Authentication Endpoints**

#### Test Registration
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@example.com",
    "username": "testuser",
    "password": "Test1234"
  }'

# Expected response:
# {
#   "message": "User registered successfully",
#   "user": {...},
#   "token": "eyJ..."
# }
```

#### Test Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@example.com",
    "password": "Test1234"
  }'

# Expected response:
# {
#   "message": "Login successful",
#   "user": {...},
#   "token": "eyJ..."
# }
```

## 🔍 Common Issues & Solutions

### Issue 1: "Sign in not working"

**Symptoms:**
- User enters credentials
- Nothing happens or page doesn't redirect
- No error message appears

**Debugging Steps:**

1. **Check Browser Console** (F12 > Console tab)
   - Look for JavaScript errors
   - Check Network tab for failed API calls
   - Verify API requests are reaching http://localhost:5000/api/auth/login

2. **Verify User Exists in Database**
   ```bash
   cd backend
   sqlite3 data/system.db "SELECT id, email, username, is_active FROM users;"
   ```

3. **Test Login with Correct Credentials**
   - Email: `shivaninaroju1@gmail.com`
   - Password: (The password you used when registering)

   OR create a new test account:
   - Go to http://localhost:3000/register
   - Fill in: email, username (min 3 chars), password (min 8 chars with uppercase, lowercase, number)
   - After registration, you should be automatically logged in

4. **Check if Token is Stored**
   - Open Browser DevTools (F12)
   - Go to Application > Local Storage > http://localhost:3000
   - Look for 'token' key
   - If token exists, authentication worked

5. **Verify Network Response**
   - Open Network tab in DevTools
   - Click login
   - Look for request to `/api/auth/login`
   - Check response:
     - Status 200: Success - should redirect
     - Status 401: Wrong email or password
     - Status 500: Server error - check backend logs
     - No request: Frontend issue

### Issue 2: CORS Errors

**Symptoms:**
- Console shows "CORS policy" error
- Requests blocked

**Solution:**
```bash
# Verify backend .env has correct CORS_ORIGIN
cat backend/.env | grep CORS_ORIGIN

# Should be: CORS_ORIGIN=http://localhost:3000
```

### Issue 3: "Invalid email or password"

**Causes:**
1. User doesn't exist - Register first at /register
2. Wrong password - Try password reset or register new account
3. Email typed incorrectly - Check for typos

**Solution:**
Create a new test account:
```
Email: test@example.com
Username: testuser123
Password: Test1234
```

### Issue 4: Validation Errors

**Password Requirements:**
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number

**Username Requirements:**
- Minimum 3 characters
- Only letters, numbers, underscores, hyphens

**Email Requirements:**
- Valid email format (contains @)

## 🧪 Step-by-Step Login Test

### Manual Test Process:

1. **Open Application**
   ```
   Navigate to: http://localhost:3000
   ```

2. **Should see Login page**
   - If you see Dashboard, you're already logged in
   - Click "Logout" to test login

3. **Try to Login**
   - Use existing account OR
   - Click "Sign up" to create new account first

4. **After successful login:**
   - Should redirect to `/dashboard`
   - Should see "My Databases" heading
   - Top right should show your username
   - Can click "Upload Database" button

5. **Verify Token Storage:**
   - F12 > Application > Local Storage
   - Should see `token` with JWT value

## 📊 Database Queries for Debugging

### Check Existing Users
```bash
cd backend
sqlite3 data/system.db "SELECT id, email, username, is_active, created_at FROM users;"
```

### Check Recent Login Activity
```bash
cd backend
sqlite3 data/system.db "SELECT email, username, last_login FROM users ORDER BY last_login DESC;"
```

### Create Test User Manually (if needed)
```bash
# Use the API to register instead of manual DB insert
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "debug@test.com",
    "username": "debuguser",
    "password": "Debug123"
  }'
```

## 🚀 Quick Start Checklist

- [ ] Backend server running (port 5000)
- [ ] Frontend server running (port 3000)
- [ ] Database initialized (data/system.db exists)
- [ ] .env files configured
- [ ] Browser on http://localhost:3000
- [ ] No CORS errors in console
- [ ] At least one user exists OR can register new user

## 💡 Recommended Test Flow

**Option A: Using Existing User**
1. Go to http://localhost:3000/login
2. Enter: `shivaninaroju1@gmail.com`
3. Enter password (that was set during registration)
4. Click "Sign In"
5. Should redirect to dashboard

**Option B: Create New Test User**
1. Go to http://localhost:3000/register
2. Fill form:
   - Email: `test@example.com`
   - Username: `testuser`
   - Password: `Test1234`
   - Confirm Password: `Test1234`
3. Click "Create Account"
4. Should automatically login and redirect to dashboard

## 🔧 Backend Logs

To see real-time backend logs while testing:
```bash
cd backend
npm run dev

# Watch for:
# - "Connected to system database"
# - POST /api/auth/login requests
# - Any error messages
```

## ⚠️ Known Working State

- ✅ Backend health check responds
- ✅ Database has at least 1 user
- ✅ Login endpoint returns correct errors for invalid credentials
- ✅ All environment variables configured
- ✅ CORS settings correct
- ✅ Frontend and backend servers running

If all above are ✅, login **should work**. If it doesn't:
1. Check browser console for errors
2. Check Network tab for failed requests
3. Verify credentials are correct
4. Try registering a new account instead
