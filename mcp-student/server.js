require('dotenv').config();
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const API = (process.env.STUDENT_API_URL || '').replace(/\/$/, '');
if (!API) throw new Error('Set STUDENT_API_URL in mcp-student/.env');
const server = new McpServer({ name: 'student-records', version: '1.0.0' });
async function callApi(path, options = {}) {
  const r = await fetch(API + path, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.message || `Student API returned HTTP ${r.status}`);
  return body;
}
const output = value => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
const studentInput = {
  studentId: z.string().min(1).max(30), name: z.string().min(1).max(100),
  email: z.string().email(), department: z.string().min(1).max(100), semester: z.number().int().min(1).max(12)
};
server.tool('list_students', 'List student records. Use a search term optionally.', { query: z.string().optional() }, async ({ query }) => output(await callApi('/api/students' + (query ? `?q=${encodeURIComponent(query)}` : ''))));
server.tool('search_student', 'Find one student by their student ID.', { studentId: z.string().min(1) }, async ({ studentId }) => output(await callApi(`/api/students/${encodeURIComponent(studentId)}`)));
server.tool('add_student', 'Create a student record in the MongoDB-backed student system.', studentInput, async student => output(await callApi('/api/students', { method: 'POST', body: JSON.stringify(student) })));
server.tool('update_student', 'Update an existing student. Provide all fields, including the original studentId.', { ...studentInput }, async student => output(await callApi(`/api/students/${encodeURIComponent(student.studentId)}`, { method: 'PUT', body: JSON.stringify(student) })));
server.tool('delete_student', 'Delete a student by student ID. Confirm with the user before calling this destructive tool.', { studentId: z.string().min(1) }, async ({ studentId }) => output(await callApi(`/api/students/${encodeURIComponent(studentId)}`, { method: 'DELETE' })));
server.tool('student_statistics', 'Return counts by department and semester for a quick report.', {}, async () => {
  const data = await callApi('/api/students'); const rows = data.students || [];
  const count = items => Object.fromEntries([...items.reduce((m, x) => m.set(x, (m.get(x) || 0) + 1), new Map())]);
  return output({ totalStudents: rows.length, byDepartment: count(rows.map(s => s.department)), bySemester: count(rows.map(s => String(s.semester))) });
});
(async () => { const transport = new StdioServerTransport(); await server.connect(transport); })().catch(err => { console.error(err); process.exit(1); });
