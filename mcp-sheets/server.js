require('dotenv').config();
const { google } = require('googleapis');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');

// ── Config ────────────────────────────────────────────────────────────────────
const sheetId = process.env.GOOGLE_SHEET_ID;
const credFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!sheetId) {
  console.error('FATAL: Set GOOGLE_SHEET_ID in mcp-sheets/.env or Claude config');
  process.exit(1);
}
if (!credFile) {
  console.error('FATAL: Set GOOGLE_APPLICATION_CREDENTIALS to the path of your service-account JSON key file');
  process.exit(1);
}

// ── Google Sheets auth ────────────────────────────────────────────────────────
const auth   = new google.auth.GoogleAuth({ keyFile: credFile, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const sheets = google.sheets({ version: 'v4', auth });

// ── Dynamic Tab Discovery Helper ─────────────────────────────────────────────
const HEADER = ['StudentId', 'Name', 'Email', 'Department', 'Semester', 'Timestamp'];

async function resolveSheetTab() {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  const allSheets = meta.data.sheets || [];
  if (allSheets.length === 0) throw new Error('No sheets found in this Google Spreadsheet.');

  // Prefer tab named "Students", otherwise use the first sheet tab (e.g. "Sheet1")
  const preferred = allSheets.find(s => s.properties?.title?.toLowerCase() === 'students');
  const target = preferred || allSheets[0];
  const title = target.properties?.title || 'Sheet1';
  const tabId = target.properties?.sheetId || 0;
  return { title, tabId, range: `${title}!A:F` };
}

// ── MCP Server ────────────────────────────────────────────────────────────────
const server = new McpServer({ name: 'google-sheets', version: '1.0.0' });
const output = value => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });

// read_student_sheet
server.tool(
  'read_student_sheet',
  'Read all rows from the configured Google Sheet. Returns the rows as an array of objects.',
  {},
  async () => {
    try {
      const { range } = await resolveSheetTab();
      const resp = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range });
      const rows = resp.data.values || [];
      if (rows.length === 0) return output({ rows: [], count: 0 });
      const [header, ...dataRows] = rows;
      const records = dataRows.map(row => Object.fromEntries(header.map((h, i) => [h, row[i] ?? ''])));
      return output({ rows: records, count: records.length });
    } catch (err) {
      return output({ success: false, error: err.message });
    }
  }
);

// append_student_to_sheet
server.tool(
  'append_student_to_sheet',
  'Append a new student row to the configured Google Sheet. ' +
  'Checks for duplicate StudentId in the sheet before appending. ' +
  'NOTE: This only writes to Sheets; to also save to the database, use the create_student tool from the student-records MCP server.',
  {
    studentId:  z.string().min(1).max(30).describe('Student ID'),
    name:       z.string().min(1).max(100).describe('Full name'),
    email:      z.string().email().describe('Email address'),
    department: z.string().min(1).max(100).describe('Department'),
    semester:   z.number().int().min(1).max(12).describe('Semester (1–12)'),
  },
  async ({ studentId, name, email, department, semester }) => {
    try {
      const { title, range } = await resolveSheetTab();

      // Check existing rows
      const existing = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range });
      const rows = existing.data.values || [];
      if (rows.length > 1) {
        const [, ...dataRows] = rows;
        const dup = dataRows.find(r => String(r[0]).trim() === String(studentId).trim());
        if (dup) {
          return output({
            success: false,
            error: `Student ID "${studentId}" already exists in the sheet at row ${dataRows.indexOf(dup) + 2}.`,
          });
        }
      } else if (rows.length === 0) {
        // Sheet is completely empty — initialize header row
        await sheets.spreadsheets.values.update({
          spreadsheetId: sheetId,
          range: `${title}!A1`,
          valueInputOption: 'RAW',
          requestBody: { values: [HEADER] },
        });
      }

      // Append row
      const timestamp = new Date().toISOString();
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [[studentId, name, email, department, String(semester), timestamp]] },
      });

      return output({ success: true, message: `Student "${studentId}" appended to Google Sheet "${title}".`, studentId });
    } catch (err) {
      return output({ success: false, error: err.message });
    }
  }
);

// delete_student_from_sheet
server.tool(
  'delete_student_from_sheet',
  'Remove the row for a given student ID from the Google Sheet. ' +
  'NOTE: This does NOT delete the student from the database. Use the delete_student tool for that.',
  { studentId: z.string().min(1).describe('The student ID whose row should be removed from the sheet') },
  async ({ studentId }) => {
    try {
      const { tabId, range } = await resolveSheetTab();
      const existing = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range });
      const rows = existing.data.values || [];
      if (rows.length < 2) return output({ success: false, error: 'Sheet has no student records to delete.' });

      const [, ...dataRows] = rows;
      const rowIndex = dataRows.findIndex(r => String(r[0]).trim() === String(studentId).trim());
      if (rowIndex === -1) {
        return output({ success: false, error: `Student ID "${studentId}" not found in sheet.` });
      }

      const startIndex = rowIndex + 1; // +1 for header row

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: {
          requests: [{
            deleteDimension: {
              range: { sheetId: tabId, dimension: 'ROWS', startIndex, endIndex: startIndex + 1 },
            },
          }],
        },
      });

      return output({ success: true, message: `Row for student "${studentId}" removed from Google Sheet.` });
    } catch (err) {
      return output({ success: false, error: err.message });
    }
  }
);

// ── Start ─────────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
server.connect(transport).then(() => {
  console.error('[mcp-sheets] MCP server running via stdio');
}).catch(err => {
  console.error('[mcp-sheets] Fatal error:', err.message);
  process.exit(1);
});
