require('dotenv').config();
const { google } = require('googleapis');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const sheetId = process.env.GOOGLE_SHEET_ID;
const range = process.env.GOOGLE_SHEET_RANGE || 'Students!A:F';
if (!sheetId) throw new Error('Set GOOGLE_SHEET_ID in mcp-sheets/.env');
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) throw new Error('Set GOOGLE_APPLICATION_CREDENTIALS to the service account JSON path');
const auth = new google.auth.GoogleAuth({ keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const sheets = google.sheets({ version: 'v4', auth });
const server = new McpServer({ name: 'google-sheets', version: '1.0.0' });
const output = value => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
server.tool('read_student_sheet', 'Read rows from the configured Google Sheet. The first row should contain headers.', {}, async () => {
  const r = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range });
  return output({ range, rows: r.data.values || [] });
});
server.tool('append_student_to_sheet', 'Append a student row to the configured Google Sheet. Check for duplicates first when appropriate.', {
  studentId: z.string().min(1), name: z.string().min(1), email: z.string().email(), department: z.string().min(1), semester: z.number().int().min(1).max(12)
}, async s => {
  const values = [[s.studentId, s.name, s.email, s.department, s.semester, new Date().toISOString()]];
  const r = await sheets.spreadsheets.values.append({ spreadsheetId: sheetId, range, valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS', requestBody: { values } });
  return output({ success: true, message: 'Student appended to Google Sheet', updatedRange: r.data.updates?.updatedRange, studentId: s.studentId });
});
server.tool('find_student_in_sheet', 'Find rows in the configured Google Sheet matching a student ID.', { studentId: z.string().min(1) }, async ({ studentId }) => {
  const r = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range });
  const rows = r.data.values || [];
  const matches = rows.filter((row, i) => i > 0 && String(row[0] || '').trim().toLowerCase() === studentId.trim().toLowerCase());
  return output({ studentId, matches });
});
(async () => { const transport = new StdioServerTransport(); await server.connect(transport); })().catch(err => { console.error(err.message); process.exit(1); });
