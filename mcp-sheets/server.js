require('dotenv').config();
const { google } = require('googleapis');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');

// ── Config ────────────────────────────────────────────────────────────────────
const sheetId = process.env.GOOGLE_SHEET_ID;
const range   = process.env.GOOGLE_SHEET_RANGE || 'Students!A:F';
const credFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!sheetId) {
  console.error('FATAL: Set GOOGLE_SHEET_ID in mcp-sheets/.env');
  process.exit(1);
}
if (!credFile) {
  console.error('FATAL: Set GOOGLE_APPLICATION_CREDENTIALS to the path of your service-account JSON key file');
  process.exit(1);
}

// ── Google Sheets auth ────────────────────────────────────────────────────────
const auth   = new google.auth.GoogleAuth({ keyFile: credFile, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const sheets = google.sheets({ version: 'v4', auth });

// ── MCP server ────────────────────────────────────────────────────────────────
const server = new McpServer({ name: 'google-sheets', version: '1.0.0' });
const output = value => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });

// Expected column order: StudentId | Name | Email | Department | Semester | Timestamp
const HEADER = ['StudentId', 'Name', 'Email', 'Department', 'Semester', 'Timestamp'];

// read_student_sheet
server.tool(
  'read_student_sheet',
  'Read all rows from the configured Google Sheet. Returns the rows as an array of objects.',
  {},
  async () => {
    try {
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
      // Duplicate check in the sheet
      const existing = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range });
      const rows = existing.data.values || [];
      if (rows.length > 1) {
        const [, ...dataRows] = rows;
        const dup = dataRows.find(r => r[0] === studentId);
        if (dup) {
          return output({
            success: false,
            error: `Student ID "${studentId}" already exists in the sheet at row ${dataRows.indexOf(dup) + 2}.`,
          });
        }
      } else if (rows.length === 0) {
        // Sheet is empty — write header first
        await sheets.spreadsheets.values.update({
          spreadsheetId: sheetId,
          range: range.split('!')[0] + '!A1',
          valueInputOption: 'RAW',
          requestBody: { values: [HEADER] },
        });
      }

      // Append the row
      const timestamp = new Date().toISOString();
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [[studentId, name, email, department, String(semester), timestamp]] },
      });

      return output({ success: true, message: `Student "${studentId}" appended to sheet.`, studentId });
    } catch (err) {
      return output({ success: false, error: err.message });
    }
  }
);

// delete_student_from_sheet
server.tool(
  'delete_student_from_sheet',
  'Remove the row for a given student ID from the Google Sheet by clearing the cell values. ' +
  'NOTE: This does NOT delete the student from the database. Use the delete_student tool for that.',
  { studentId: z.string().min(1).describe('The student ID whose row should be removed from the sheet') },
  async ({ studentId }) => {
    try {
      const existing = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range });
      const rows = existing.data.values || [];
      if (rows.length < 2) return output({ success: false, error: 'Sheet has no data rows.' });

      const [, ...dataRows] = rows;
      const rowIndex = dataRows.findIndex(r => r[0] === studentId);
      if (rowIndex === -1) {
        return output({ success: false, error: `Student ID "${studentId}" not found in sheet.` });
      }

      // Get the sheet's numeric ID to use batchUpdate for row deletion
      const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
      const sheetMeta = meta.data.sheets?.find(s => {
        const title = range.includes('!') ? range.split('!')[0] : 'Students';
        return s.properties?.title === title;
      });
      if (!sheetMeta) return output({ success: false, error: 'Could not find target sheet tab.' });

      const sheetTabId = sheetMeta.properties.sheetId;
      const startIndex = rowIndex + 1; // +1 for header row

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: {
          requests: [{
            deleteDimension: {
              range: { sheetId: sheetTabId, dimension: 'ROWS', startIndex, endIndex: startIndex + 1 },
            },
          }],
        },
      });

      return output({ success: true, message: `Row for student "${studentId}" deleted from sheet.` });
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
