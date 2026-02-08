# 🧪 COMPLETE TESTING GUIDE

## 🔧 SETUP (Do this first!)

### 1. Install Dependencies

```bash
# Backend
cd c:\Users\SHIVANI\Desktop\SQLV3\collabsql\backend
npm install

# Frontend
cd c:\Users\SHIVANI\Desktop\SQLV3\collabsql\frontend
npm install
```

### 2. Set Up Gmail App Password (for email features)

**Steps:**
1. Go to https://myaccount.google.com/security
2. Enable **2-Step Verification** (if not already enabled)
3. Search for "App passwords" or go to https://myaccount.google.com/apppasswords
4. Select "Mail" and "Windows Computer"
5. Click "Generate"
6. Copy the 16-character password (e.g., `abcd efgh ijkl mnop`)

### 3. Configure Backend Environment

```bash
# Navigate to backend
cd c:\Users\SHIVANI\Desktop\SQLV3\collabsql\backend

# Copy example env file
cp .env.example .env

# Edit .env file with your credentials
```

**Edit `.env` file:**
```bash
PORT=5000
NODE_ENV=development
JWT_SECRET=your-super-secret-jwt-key-change-this
JWT_EXPIRES_IN=7d

# Gmail Configuration (IMPORTANT!)
GMAIL_USER=your.email@gmail.com
GMAIL_APP_PASSWORD=abcd efgh ijkl mnop
EMAIL_FROM=noreply@collabsql.com
APP_URL=http://localhost:5173

# Optional
GEMINI_API_KEY=your-gemini-api-key-here
```

### 4. Start the Application

**Terminal 1 - Backend:**
```bash
cd c:\Users\SHIVANI\Desktop\SQLV3\collabsql\backend
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd c:\Users\SHIVANI\Desktop\SQLV3\collabsql\frontend
npm run dev
```

**Expected Output:**
- Backend: `✅ Email service ready to send emails`
- Frontend: `Local: http://localhost:5173/`

---

## ✅ TEST CHECKLIST

### **PHASE 1: Bot Features** (Should still work from before)

#### Test 1: DELETE Query
```
1. Upload a database (or use existing)
2. Type: "delete employee name Kavya"
3. ✅ PASS if: Deletes the full name 'Kavya', not just 'K'
4. ❌ FAIL if: Only deletes names starting with 'K'
```

#### Test 2: Show Table
```
1. Type: "show employee table"
2. ✅ PASS if: Displays employee data in a table
3. ❌ FAIL if: Shows list of all tables
```

#### Test 3: View Data
```
1. Type: "view data of student table"
2. ✅ PASS if: Shows student table data
3. ❌ FAIL if: Generic error message
```

#### Test 4: Explain Schema
```
1. Type: "explain the database schema"
2. ✅ PASS if: Shows formatted schema with tables, columns, keys
3. ❌ FAIL if: Generic message
```

#### Test 5: General Questions
```
1. Type: "what is artificial intelligence"
2. ✅ PASS if: Educational answer about AI
3. ❌ FAIL if: "I'm not sure" message
```

---

### **PHASE 2: UI/UX Features** (NEW!)

#### Test 6: Table Selector
```
1. Open any database
2. ✅ PASS if: Table selector appears above chat input
3. Select "EMPLOYEE" table
4. Type: "show all records" (don't mention table name)
5. ✅ PASS if: Shows EMPLOYEE data automatically
6. ❌ FAIL if: Asks "Which table?"
```

#### Test 7: Download Database
```
1. Open any database
2. Look for "Download" button in header (next to active users)
3. ✅ PASS if: Button exists with download icon
4. Click "Download"
5. ✅ PASS if: .db file downloads with correct filename
6. Open downloaded file in DB Browser to verify
7. ❌ FAIL if: Error or file corrupted
```

#### Test 8: Chat History Persistence
```
1. Open database, send 3-4 chat messages
2. ✅ PASS if: Messages appear in chat
3. Refresh page (F5)
4. ✅ PASS if: All messages reload automatically
5. Click "Clear Chat" button (top right of input)
6. ✅ PASS if: Chat resets to welcome message
7. ❌ FAIL if: History lost or not clearing
```

---

### **PHASE 3: Authentication & Email** (NEW!)

#### Test 9: User Registration & Email Verification

**Step 1: Register New Account**
```
1. Go to http://localhost:5173/register
2. Fill in:
   - Email: Use your REAL email (you'll receive emails)
   - Username: testuser123
   - Password: Test@123
3. Click "Sign Up"
4. ✅ PASS if: Success message "Check your email to verify"
5. ✅ PASS if: Redirects to login page
6. ❌ FAIL if: Immediately logs in (should NOT happen)
```

**Step 2: Check Verification Email**
```
1. Check your email inbox
2. ✅ PASS if: Email arrives within 1-2 minutes
3. ✅ PASS if: Email has subject "Verify Your Email - CollabSQL"
4. ✅ PASS if: Email is beautifully formatted with HTML
5. ✅ PASS if: "Verify Email Address" button exists
6. ❌ FAIL if: No email or plain text email
```

**Step 3: Verify Email**
```
1. Click "Verify Email Address" button in email
2. ✅ PASS if: Opens verification page in browser
3. ✅ PASS if: Shows "Email Verified!" success message
4. ✅ PASS if: Auto-redirects to dashboard after 2 seconds
5. ✅ PASS if: You're logged in automatically
6. ❌ FAIL if: Error or no redirect
```

**Step 4: Check Welcome Email**
```
1. Check email again
2. ✅ PASS if: Welcome email arrives
3. ✅ PASS if: Subject is "Welcome to CollabSQL! 🎉"
4. ✅ PASS if: Lists features nicely
5. ❌ FAIL if: No welcome email
```

#### Test 10: Login Before Verification

**Step 1: Register Another Account (Don't Verify)**
```
1. Register another account: testuser2@email.com
2. DON'T click verification link
3. Try to login with testuser2 credentials
4. ✅ PASS if: Error "Please verify your email before logging in"
5. ✅ PASS if: Toast shows "Check your email"
6. ❌ FAIL if: Allows login without verification
```

#### Test 11: Forgot Password Flow

**Step 1: Request Password Reset**
```
1. Go to login page
2. ✅ PASS if: "Forgot password?" link exists
3. Click "Forgot password?"
4. ✅ PASS if: Redirects to /forgot-password page
5. Enter verified email address
6. Click "Send Reset Link"
7. ✅ PASS if: Success message appears
8. ✅ PASS if: Shows instructions screen
9. ❌ FAIL if: Error or no email sent
```

**Step 2: Check Reset Email**
```
1. Check email inbox
2. ✅ PASS if: Email arrives with subject "Reset Your Password"
3. ✅ PASS if: Email has red "Reset Password" button
4. ✅ PASS if: Shows security warning (1 hour expiry)
5. ❌ FAIL if: No email arrives
```

**Step 3: Reset Password**
```
1. Click "Reset Password" button in email
2. ✅ PASS if: Opens reset password page
3. Enter new password: NewPass@123
4. Confirm password: NewPass@123
5. ✅ PASS if: Shows green checkmark for matching passwords
6. Click "Reset Password"
7. ✅ PASS if: Success message appears
8. ✅ PASS if: Redirects to login after 3 seconds
9. ❌ FAIL if: Error or doesn't work
```

**Step 4: Login with New Password**
```
1. Login with email + new password (NewPass@123)
2. ✅ PASS if: Login successful
3. ✅ PASS if: Redirects to dashboard
4. ❌ FAIL if: Login fails
```

#### Test 12: Token Expiry (Optional - Advanced)

**Test Verification Token Expiry:**
```
1. Register account, get verification email
2. DON'T click link for 24+ hours
3. Then click verification link
4. ✅ PASS if: Shows "Verification token has expired"
5. ✅ PASS if: Offers "Request New Link" option
6. ❌ FAIL if: Still works after 24 hours
```

**Test Reset Token Expiry:**
```
1. Request password reset
2. Wait 1+ hour
3. Click reset link
4. ✅ PASS if: Shows "Reset token has expired"
5. ❌ FAIL if: Still works after 1 hour
```

---

## 📊 RESULTS TRACKING

### Feature Status Table

| Test # | Feature | Status | Notes |
|--------|---------|--------|-------|
| 1 | DELETE Query | ⬜ | |
| 2 | Show Table | ⬜ | |
| 3 | View Data | ⬜ | |
| 4 | Explain Schema | ⬜ | |
| 5 | General Questions | ⬜ | |
| 6 | Table Selector | ⬜ | |
| 7 | Download Database | ⬜ | |
| 8 | Chat History | ⬜ | |
| 9 | Email Verification | ⬜ | |
| 10 | Block Unverified Login | ⬜ | |
| 11 | Password Reset | ⬜ | |
| 12 | Token Expiry | ⬜ | |

**Legend:**
- ✅ = PASS
- ❌ = FAIL
- ⬜ = Not Tested
- ⚠️ = Partial Pass

---

## 🐛 TROUBLESHOOTING

### Email Not Arriving

**Issue:** Verification/reset emails not received

**Solutions:**
1. Check spam/junk folder
2. Verify Gmail App Password is correct in .env
3. Check backend console for email sending errors
4. Verify GMAIL_USER matches the account that generated App Password
5. Try sending to different email address
6. Check Gmail sending limits (500/day max)

**Backend should show:**
```
✅ Email service ready to send emails
✅ Verification email sent to user@email.com
```

---

### Backend Errors

**Issue:** Backend crashes or errors

**Common Fixes:**
1. Check .env file exists and has correct values
2. Run `npm install` to ensure nodemailer is installed
3. Check database.db exists
4. Verify JWT_SECRET is set in .env

---

### Table Selector Not Showing

**Issue:** Table selector doesn't appear

**Check:**
1. Database has tables
2. Schema loaded successfully
3. Frontend connected to backend
4. Check browser console for errors

---

### Download Not Working

**Issue:** Download button doesn't download file

**Check:**
1. Database file exists on server
2. Backend route is working (check Network tab)
3. Browser blocks download (check download settings)
4. File permissions on server

---

## ✅ SUCCESS CRITERIA

**Minimum to Pass:**
- ✅ At least 8/12 tests pass
- ✅ Email verification works end-to-end
- ✅ Password reset works end-to-end
- ✅ Table selector working
- ✅ Download working
- ✅ Chat history working

**Perfect Score:**
- ✅ All 12 tests pass
- ✅ No errors in browser console
- ✅ No errors in backend logs
- ✅ Emails arrive within 1 minute
- ✅ Beautiful UI with no glitches

---

## 📝 TESTING NOTES

**Date Tested:** _____________

**Tester:** _____________

**Results:**
- Tests Passed: ___/12
- Tests Failed: ___/12
- Overall Status: ⬜ PASS / ⬜ FAIL

**Issues Found:**
```
1.
2.
3.
```

**Next Steps:**
```
1.
2.
3.
```

---

## 🚀 AFTER TESTING

### If Everything Passes:
✅ Ready to continue with Phase 4!
✅ Consider production deployment
✅ Share with stakeholders for feedback

### If Issues Found:
1. Document all failing tests
2. Share error messages/screenshots
3. I'll help debug and fix
4. Retest after fixes

---

**Happy Testing!** 🧪✨

Let me know results and I'll help fix any issues!
