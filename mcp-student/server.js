require('dotenv').config();
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');

// ── Config ────────────────────────────────────────────────────────────────────
const API = (process.env.STUDENT_API_URL || '').replace(/\/$/, '');
if (!API) {
  console.error('FATAL: Set STUDENT_API_URL in mcp-student/.env (e.g. https://your-backend.onrender.com)');
  process.exit(1);
}

// ── API helper ────────────────────────────────────────────────────────────────
async function callApi(path, options = {}) {
  const res = await fetch(API + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || `Student API returned HTTP ${res.status}`);
  return body;
}

const output = value => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });

// ── Shared Zod schema for student fields ──────────────────────────────────────
const studentInput = {
  studentId:  z.string().min(1).max(30).describe('Unique student identifier, e.g. STU001'),
  name:       z.string().min(1).max(100).describe('Full name of the student'),
  email:      z.string().email().describe('Student email address'),
  department: z.string().min(1).max(100).describe('Department name, e.g. Computer Science'),
  semester:   z.number().int().min(1).max(12).describe('Current semester (1–12)'),
};

// ── MCP Server ────────────────────────────────────────────────────────────────
const server = new McpServer({ name: 'student-records', version: '1.0.0' });

// list_students
server.tool(
  'list_students',
  'List all student records. Pass an optional search query to filter by ID, name, email, or department.',
  { query: z.string().optional().describe('Optional search term') },
  async ({ query }) => {
    const path = '/api/students' + (query ? `?q=${encodeURIComponent(query)}` : '');
    const data = await callApi(path);
    return output(data);
  }
);

// get_student
server.tool(
  'get_student',
  'Get a single student record by their student ID.',
  { studentId: z.string().min(1).describe('The student ID to look up') },
  async ({ studentId }) => {
    const data = await callApi(`/api/students/${encodeURIComponent(studentId)}`);
    return output(data);
  }
);

// create_student
server.tool(
  'create_student',
  'Create a new student record. All fields are required. Returns an error if the student ID or email already exists.',
  studentInput,
  async (args) => {
    try {
      const data = await callApi('/api/students', { method: 'POST', body: JSON.stringify(args) });
      return output({ success: true, ...data });
    } catch (err) {
      return output({ success: false, error: err.message });
    }
  }
);

// update_student
server.tool(
  'update_student',
  'Update an existing student record by studentId. studentId cannot be changed.',
  {
    studentId:  z.string().min(1).describe('The student ID of the record to update'),
    name:       studentInput.name,
    email:      studentInput.email,
    department: studentInput.department,
    semester:   studentInput.semester,
  },
  async ({ studentId, ...rest }) => {
    try {
      const data = await callApi(`/api/students/${encodeURIComponent(studentId)}`, {
        method: 'PUT',
        body: JSON.stringify(rest),
      });
      return output({ success: true, ...data });
    } catch (err) {
      return output({ success: false, error: err.message });
    }
  }
);

// delete_student
server.tool(
  'delete_student',
  'Delete a student record permanently by student ID. This cannot be undone.',
  { studentId: z.string().min(1).describe('The student ID to delete') },
  async ({ studentId }) => {
    try {
      const data = await callApi(`/api/students/${encodeURIComponent(studentId)}`, { method: 'DELETE' });
      return output({ success: true, ...data });
    } catch (err) {
      return output({ success: false, error: err.message });
    }
  }
);

// ── Start ─────────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
server.connect(transport).then(() => {
  console.error('[mcp-student] MCP server running via stdio');
}).catch(err => {
  console.error('[mcp-student] Fatal error:', err.message);
  process.exit(1);
});
