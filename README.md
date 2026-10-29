# CA2 — Student Information Management System

Full-stack student CRUD system with React + Vite frontend, Node.js + Express backend, MongoDB Atlas database, and Claude Desktop MCP integration (student records + Google Sheets).

---

## Architecture

```
ca2-student-mcp/
├── backend/          Express API + MongoDB (deployed on Render)
├── frontend/         React + Vite SPA (deployed on Vercel)
├── mcp-student/      MCP server — proxies student CRUD to the API
└── mcp-sheets/       MCP server — reads/writes Google Sheets
```

| Layer     | Tech                           | Host          |
|-----------|-------------------------------|---------------|
| Frontend  | React 18, Vite 5              | Vercel        |
| Backend   | Node.js 18+, Express 4        | Render        |
| Database  | MongoDB Atlas (free tier)      | Atlas Cloud   |
| AI agent  | Claude Desktop + MCP           | Local machine |

---

## Environment Variables

### `backend/.env` (never committed — add to Render dashboard)

```env
PORT=5000
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/<db>?retryWrites=true&w=majority
FRONTEND_URL=https://ca2-student-8kyxq4q0e-jo-7859.vercel.app
```

### `frontend/.env.local` (never committed — add to Vercel dashboard)

```env
VITE_API_URL=https://ca2-student-mcp.onrender.com
```

### `mcp-student/.env` (local only)

```env
STUDENT_API_URL=https://ca2-student-mcp.onrender.com
```

### `mcp-sheets/.env` (local only)

```env
GOOGLE_SHEET_ID=<your-google-sheet-id>
GOOGLE_SHEET_RANGE=Students!A:F
GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\service-account-key.json
```

---

## Local Development

### 1. Backend

```bash
cd backend
npm install
# Create .env from .env.example and fill in MONGODB_URI
npm run dev      # node --watch server.js
```

Server starts at `http://localhost:5000`.

### 2. Frontend

```bash
cd frontend
npm install
# .env.local is NOT needed locally — the vite.config.js proxy forwards /api to :5000
npm run dev      # vite — starts at http://localhost:5173
```

> **Note:** `VITE_API_URL` is only needed for the *production* Vercel build. Locally the Vite dev proxy handles forwarding.

### 3. Build test (run this before pushing)

```bash
cd frontend
npm run build    # must produce frontend/dist/
```

---

## Backend API Routes

| Method | Path                        | Description              |
|--------|-----------------------------|--------------------------|
| GET    | `/health`                   | Health check             |
| GET    | `/api/students`             | List all (or search `?q=`) |
| GET    | `/api/students/:id`         | Get one by studentId     |
| POST   | `/api/students`             | Create student           |
| PUT    | `/api/students/:id`         | Update student           |
| DELETE | `/api/students/:id`         | Delete student           |

### Create / Update body

```json
{
  "studentId":  "STU001",
  "name":       "Alice Smith",
  "email":      "alice@example.com",
  "department": "Computer Science",
  "semester":   3
}
```

---

## Deployment

### Render (Backend)

1. Go to [dashboard.render.com](https://dashboard.render.com) → **New Web Service** → connect this repository.
2. **Root Directory:** `backend`
3. **Build Command:** `npm install`
4. **Start Command:** `node server.js`
5. **Environment Variables** (under *Environment* tab):
   - `MONGODB_URI` — your Atlas connection string
   - `FRONTEND_URL` — your Vercel URL (e.g. `https://ca2-student.vercel.app`)
   - `NODE_VERSION` — `18` (optional, Render may auto-detect)

### Vercel (Frontend)

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard) → **Add New Project** → import this repository.
2. **Root Directory:** `frontend`
3. **Framework Preset:** Vite
4. **Build Command:** `npm run build`
5. **Output Directory:** `dist`
6. **Environment Variables**:
   - `VITE_API_URL` = `https://your-render-service.onrender.com`
7. Click **Deploy**. After the URL is known, go back to Render and update `FRONTEND_URL` to this Vercel URL, then redeploy the backend.

> **Important:** `VITE_API_URL` is bundled at build time. Any time you change it you must trigger a new Vercel deployment.

### MongoDB Atlas Network Access

1. Go to [cloud.mongodb.com](https://cloud.mongodb.com) → your project → **Network Access**.
2. For Render (which has dynamic IPs), add `0.0.0.0/0` (allow all). You can restrict it later using [Render static outbound IPs](https://render.com/docs/static-outbound-ip-addresses) if you have a paid plan.
3. Ensure your database user has **readWrite** role on the correct database.

---

## MCP Integration — Claude Desktop

### Prerequisites

- [Claude Desktop](https://claude.ai/download) installed on your machine
- Node.js 18+ installed locally
- Both MCP servers' dependencies installed (`npm install` in each directory)

### Step 1: Install MCP server dependencies

```bash
cd mcp-student && npm install && cd ..
cd mcp-sheets  && npm install && cd ..
```

### Step 2: Create `.env` files

```bash
# mcp-student/.env
STUDENT_API_URL=https://ca2-student-mcp.onrender.com

# mcp-sheets/.env
GOOGLE_SHEET_ID=<your-sheet-id>
GOOGLE_SHEET_RANGE=Students!A:F
GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\service-account-key.json
```

### Step 3: Configure Claude Desktop

Edit `%APPDATA%\Claude\claude_desktop_config.json` (Windows) or `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "student-records": {
      "command": "node",
      "args": ["C:\\full\\path\\to\\ca2-student-mcp\\mcp-student\\server.js"],
      "env": {
        "STUDENT_API_URL": "https://ca2-student-mcp.onrender.com"
      }
    },
    "google-sheets": {
      "command": "node",
      "args": ["C:\\full\\path\\to\\ca2-student-mcp\\mcp-sheets\\server.js"],
      "env": {
        "GOOGLE_SHEET_ID": "your-google-sheet-id",
        "GOOGLE_SHEET_RANGE": "Students!A:F",
        "GOOGLE_APPLICATION_CREDENTIALS": "C:\\full\\path\\to\\service-account-key.json"
      }
    }
  }
}
```

> **Note:** Use double backslashes on Windows (`\\`). Alternatively use forward slashes — Node.js accepts both.

Restart Claude Desktop after saving.

### Step 4: Google Sheets Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com) → create/select a project.
2. Enable the **Google Sheets API**.
3. Create a **Service Account** → generate a JSON key → download it.
4. Open your Google Sheet → click **Share** → add the service account email with **Editor** role.
5. Note the **Sheet ID** from the URL: `https://docs.google.com/spreadsheets/d/<SHEET_ID>/edit`.

---

## Example Claude Prompts

### Add a student to both database and Google Sheets

```
Add a new student to the database and also add them to the Google Sheet:
  Student ID: STU042
  Name: Priya Sharma
  Email: priya.sharma@example.com
  Department: Electronics Engineering
  Semester: 5
```

Claude will call `create_student` (student-records MCP) **and** `append_student_to_sheet` (google-sheets MCP) in sequence. If the database write succeeds but the Sheets write fails, Claude will report the partial failure clearly.

### List all students

```
Show me all student records.
```

### Search for a student

```
Find students in the Computer Science department.
```

### Update a student

```
Update student STU042 — they are now in semester 6.
```

### Delete a student from both systems

```
Delete student STU042 from the database and remove them from the Google Sheet.
```

---

## Partial Failure Handling

The MCP servers are designed to report partial failures honestly:

- If `create_student` succeeds but `append_student_to_sheet` fails, Claude will tell you: *"Student created in database but could NOT be added to Google Sheets: [error]."*
- You can then re-run just `append_student_to_sheet` to retry the Sheets write without creating a duplicate in the database.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Frontend shows "Cannot reach the server" | `VITE_API_URL` missing or wrong in Vercel | Set env var in Vercel dashboard, redeploy |
| Backend on Render fails to connect to MongoDB | Atlas IP not whitelisted | Add `0.0.0.0/0` in Atlas Network Access |
| `vite build` on Vercel outputs dev server log | Vercel root dir wrong or build command wrong | Set Root Directory = `frontend`, Build = `npm run build` |
| Claude Desktop shows MCP server error | Wrong path or missing `.env` env vars | Check `claude_desktop_config.json` paths; restart Claude |
| Google Sheets append fails with 403 | Service account not shared on the sheet | Share sheet with service account email as Editor |

---

## Files Modified in This Fix

| File | Change |
|------|--------|
| `backend/server.js` | Full rewrite: CORS preflight, `/health`, complete CRUD, global error handler, startup guard |
| `backend/package.json` | Pinned versions, `engines.node` |
| `backend/.env.example` | Updated placeholder |
| `frontend/src/main.jsx` | Add Student form, DB status badge, descriptive "failed to fetch" messages |
| `frontend/src/style.css` | Complete UI refresh with form grid, table, flash messages |
| `frontend/index.html` | Correct emoji favicon |
| `frontend/package.json` | Correct scripts: dev/build/preview |
| `frontend/vite.config.js` | Added React plugin + dev proxy |
| `frontend/.env.example` | VITE_API_URL placeholder |
| `mcp-student/server.js` | All 5 CRUD tools, error-safe, validated |
| `mcp-student/package.json` | Pinned deps |
| `mcp-sheets/server.js` | read + append (dup-check, auto-header) + delete row tools |
| `mcp-sheets/package.json` | Added googleapis |
| `.gitignore` | Added service-account key patterns |
| `README.md` | Full rewrite: architecture, install, env vars, deployment, MCP config, troubleshooting |
