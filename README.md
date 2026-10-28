# CA2: Three-Tier Student Information Management System + Multi-MCP Claude Agent

This starter repository implements the assignment's core architecture and an extra Claude Desktop integration:

- **Frontend:** React + Vite, deploy to Vercel
- **REST API:** Node.js + Express + Mongoose, deploy to Render
- **Database:** MongoDB Atlas
- **MCP server 1:** student CRUD/statistics tools that call the REST API
- **MCP server 2:** Google Sheets read/append/find tools using a Google service account
- **AI client:** Claude Desktop connects to both MCP servers locally and can coordinate them from one prompt

> The MCP servers run on your laptop for Claude Desktop. The three-tier web application is cloud-hosted. This meets the local Claude Desktop setup requested. If your instructor explicitly requires remotely hosted MCP endpoints, that is a separate extension using Streamable HTTP plus authentication.

## 0. Requirements

Install Node.js 20+ and Git. Create accounts for MongoDB Atlas, Render, Vercel, Google Cloud, and Claude Desktop. Do not commit `.env` files, service-account JSON keys, or database credentials.

## 1. Configure MongoDB Atlas

1. Create a free/shared cluster and database named `studentDB` (the collection is created automatically on first insert).
2. In **Database Access**, create a database user with a strong password and only the permissions needed for `studentDB`.
3. In **Network Access**, allow the IP address where the Render backend runs. For a short educational test, `0.0.0.0/0` may be used only if necessary; it exposes the cluster to connection attempts from any IP, so pair it with a strong restricted database user and remove it afterward. Prefer the provider's documented network option where possible.
4. Choose **Connect → Drivers → Node.js** and copy the connection URI.
5. Replace the username, password, and cluster host. URL-encode special characters in the password (for example `@` becomes `%40`, `:` becomes `%3A`, `/` becomes `%2F`, `#` becomes `%23`, `%` becomes `%25`). Do not encode the whole URI.

Example shape (not a real connection string):

```text
mongodb+srv://DB_USER:URL_ENCODED_PASSWORD@cluster-name.example.mongodb.net/studentDB?retryWrites=true&w=majority
```

### MongoDB URI troubleshooting

- **`URI must be a string` / missing URI:** set `MONGODB_URI` in the backend environment; check spelling and redeploy.
- **`Authentication failed`:** confirm database username/password (not your Atlas website login); URL-encode password characters; verify user privileges.
- **`querySrv ENOTFOUND` / DNS error:** check the cluster hostname copied from Atlas, internet/DNS connectivity, and whether the cluster is paused/deleted.
- **`Server selection timed out` / IP not allowed:** check Atlas Network Access and allow the Render service's required outbound connectivity as documented by your provider.
- **TLS/certificate error:** use the full Atlas-provided `mongodb+srv://` URI and a supported Node.js version; do not disable TLS verification.
- **Works locally but not on Render:** set the variable in Render's service environment settings, save, and redeploy. Never put the URI in frontend `VITE_*` variables.
- **Special characters:** URL-encode only the password component. Do not add quotes or angle brackets around the actual URI in Render's environment field.

## 2. Run the REST API locally

```bash
cd backend
cp .env.example .env
# Edit .env and set a real MONGODB_URI
npm install
npm run dev
```

On Windows PowerShell, copy the file using `Copy-Item .env.example .env` instead of `cp` if needed.

Test `http://localhost:5000/health`. Expected JSON includes `ok: true` and `database: "connected"`.

REST endpoints:

- `GET /api/students` — list records; optional `?q=search-term`
- `GET /api/students/:studentId` — find by student ID (not MongoDB `_id`)
- `POST /api/students` — create
- `PUT /api/students/:studentId` — replace/update all editable fields
- `DELETE /api/students/:studentId` — delete

Example request body:

```json
{
  "studentId": "ST101",
  "name": "Rahul Sharma",
  "email": "rahul@example.com",
  "department": "Computer Science",
  "semester": 5
}
```

Use fictional test data. The API currently has no login/authentication and is intended as an educational starter. Do not put real or sensitive student records on a public unauthenticated endpoint. Add authentication/authorization before real use.

## 3. Deploy backend to Render

1. Push this repository to a GitHub repository.
2. In Render, create **New → Web Service** and connect the repository.
3. Set **Root Directory** to `backend`.
4. Build command: `npm install`; Start command: `npm start`.
5. Set environment variables in Render:
   - `MONGODB_URI` = your Atlas URI
   - `FRONTEND_URL` = your eventual Vercel URL (can temporarily use `http://localhost:5173` for local testing; later change it)
   - `NODE_VERSION` = `20` (if offered by the dashboard)
6. Deploy. Copy the actual service URL, e.g. `https://your-service.onrender.com`.
7. Open `/health` and test the CRUD endpoints with an API client before continuing.

Render free services may sleep when idle, so the first request can take a while.

## 4. Run and deploy the frontend to Vercel

Local run:

```bash
cd frontend
cp .env.example .env
# Set VITE_API_URL=http://localhost:5000
npm install
npm run dev
```

Deploy:

1. Import the repository into Vercel.
2. Set **Root Directory** to `frontend`.
3. Framework preset: Vite; Build command `npm run build`; Output directory `dist`.
4. Add environment variable `VITE_API_URL` = your Render URL, without a trailing slash.
5. Deploy and copy the Vercel URL.
6. Update Render's `FRONTEND_URL` to the exact Vercel origin (scheme + host only, no path). Save and redeploy.

For local frontend testing, keep `FRONTEND_URL=http://localhost:5173` on your local backend `.env`. For deployed use, set it to the production Vercel URL in Render. If you need both, comma-separate exact origins in the backend environment.

## 5. Configure Google Sheets MCP server

### Create a spreadsheet

1. Create a Google Sheet and add a tab named `Students`.
2. Put these headers in row 1: `Student ID | Name | Email | Department | Semester | Added At`.
3. Copy the spreadsheet ID from its URL: `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit`.

### Create service-account credentials

1. In Google Cloud Console, create/select a project.
2. Enable **Google Sheets API**.
3. Create a service account and generate a JSON key. Store it outside this repository in a safe local folder.
4. Share the spreadsheet with the service account's email address and grant Editor access.
5. Copy `mcp-sheets/.env.example` to `.env` and set:
   - `GOOGLE_APPLICATION_CREDENTIALS` to the **absolute path** of the downloaded JSON key
   - `GOOGLE_SHEET_ID` to the spreadsheet ID
   - `GOOGLE_SHEET_RANGE=Students!A:F`

Example Windows path: `C:/Users/YourUser/keys/ca2-sheets-service-account.json`. Do not upload the key to GitHub or paste it into Claude prompts. If a key is exposed, revoke it in Google Cloud and create a new one.

Install dependencies:

```bash
cd mcp-sheets
npm install
```

Tools provided: `read_student_sheet`, `append_student_to_sheet`, and `find_student_in_sheet`.

## 6. Configure the Student MCP server

1. Copy `mcp-student/.env.example` to `mcp-student/.env`.
2. Set `STUDENT_API_URL` to the deployed Render URL (or `http://localhost:5000` for local development).
3. Install dependencies:

```bash
cd mcp-student
npm install
```

Tools provided: `list_students`, `search_student`, `add_student`, `update_student`, `delete_student`, and `student_statistics`.

## 7. Connect both servers to Claude Desktop

Find the Claude Desktop config file location in the official Claude Desktop MCP documentation for your OS. On Windows it is commonly under `%APPDATA%\Claude\claude_desktop_config.json`; use the current official docs if your installation differs.

Replace the sample paths below with the **absolute path** to your project and your installed Node.js executable if necessary. Use forward slashes in JSON paths on Windows to avoid escaping backslashes. This configuration assumes you installed dependencies in both MCP folders.

```json
{
  "mcpServers": {
    "student-records": {
      "command": "node",
      "args": ["C:/ABSOLUTE/PATH/ca2-student-mcp/mcp-student/server.js"],
      "env": {
        "STUDENT_API_URL": "https://YOUR-RENDER-SERVICE.onrender.com"
      }
    },
    "google-sheets": {
      "command": "node",
      "args": ["C:/ABSOLUTE/PATH/ca2-student-mcp/mcp-sheets/server.js"],
      "env": {
        "GOOGLE_APPLICATION_CREDENTIALS": "C:/ABSOLUTE/PATH/keys/google-service-account.json",
        "GOOGLE_SHEET_ID": "YOUR_SPREADSHEET_ID",
        "GOOGLE_SHEET_RANGE": "Students!A:F"
      }
    }
  }
}
```

If you use this Claude Desktop config, you do not strictly need `.env` files for MCP settings because values are supplied under each server's `env` block. Keep the service-account JSON file outside the repo. Restart Claude Desktop after editing the config and inspect its MCP/server logs if either server fails to start. The config must be valid JSON: no comments, trailing commas, or placeholder paths left unchanged.

## 8. Test a one-prompt multi-platform workflow

Start with test records and test sheet rows. In Claude Desktop, try:

> First search the student database for student ID ST101. If it does not exist, add a test student with ID ST101, name Rahul Sharma, email rahul@example.com, department Computer Science, and semester 5. Then check the Google Sheet for ST101. If it is not already present, append the same student to the sheet. Report which steps succeeded and which failed. Do not delete or overwrite any existing record without asking me.

This demonstrates the unified-agent behavior: Claude decides which server's tool to call and can call both servers from one user request. Verify the result in both MongoDB Atlas and Google Sheets. If the first action succeeds and the second fails, ask Claude to report the partial success and retry only the failed step.

**Avoid duplicates:** the Google Sheets append tool itself does not enforce uniqueness. The prompt above asks Claude to search first, but for production reliability, implement duplicate checking and append as a single guarded tool or workflow.

## 9. CA2 test checklist

- [ ] `GET /health` reports MongoDB connected.
- [ ] Add a student from the web UI; verify it in Atlas.
- [ ] Search for a student ID and name.
- [ ] Update the student's department/semester.
- [ ] Delete a fictional test student after confirmation.
- [ ] Invalid email/semester is rejected.
- [ ] Duplicate student ID returns a conflict response.
- [ ] The deployed Vercel site can call the Render API (CORS works).
- [ ] Claude Desktop shows both MCP servers/tools.
- [ ] Claude reads/adds a test student in MongoDB and checks/appends it in Google Sheets from one prompt.
- [ ] Demonstrate a failure case (e.g. temporarily misconfigure the sheet ID in a test setup) and show that Claude reports partial success rather than claiming both platforms updated.

## 10. What to explain in your viva

- **Three tiers:** presentation (Vercel), application/business logic (Render), data (MongoDB Atlas).
- **REST API:** HTTP methods map to CRUD; the browser never connects directly to MongoDB.
- **MCP:** a standard protocol that lets an AI client discover/call tools from multiple servers.
- **Unified agent:** Claude coordinates tools from `student-records` and `google-sheets` in one conversational request.
- **Security:** secrets live in environment variables/local credential files; CORS is not authentication; real student data requires authentication and authorization.
- **Failure handling:** two separate platform calls can partially succeed; report the actual state and retry carefully.
