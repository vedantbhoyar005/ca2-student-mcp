require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(express.json({ limit: '100kb' }));
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',').map(s => s.trim());
app.use(cors({ origin(origin, callback) {
  if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
  return callback(new Error('Origin not allowed by CORS'));
}}));

const studentSchema = new mongoose.Schema({
  studentId: { type: String, required: true, unique: true, trim: true, maxlength: 30 },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
  department: { type: String, required: true, trim: true, maxlength: 100 },
  semester: { type: Number, required: true, min: 1, max: 12 }
}, { timestamps: true });
const Student = mongoose.model('Student', studentSchema);

app.get('/health', (_req, res) => res.json({ ok: true, database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' }));
app.get('/api/students', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    const filter = q ? { $or: [
      { studentId: { $regex: escapeRegex(q), $options: 'i' } },
      { name: { $regex: escapeRegex(q), $options: 'i' } },
      { email: { $regex: escapeRegex(q), $options: 'i' } },
      { department: { $regex: escapeRegex(q), $options: 'i' } }
    ] } : {};
    const students = await Student.find(filter).sort({ createdAt: -1 }).limit(500).lean();
    res.json({ success: true, count: students.length, students });
  } catch (e) { next(e); }
});
app.get('/api/students/:studentId', async (req, res, next) => {
  try {
    const student = await Student.findOne({ studentId: req.params.studentId }).lean();
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
    res.json({ success: true, student });
  } catch (e) { next(e); }
});
app.post('/api/students', async (req, res, next) => {
  try {
    const student = await Student.create(validatePayload(req.body));
    res.status(201).json({ success: true, message: 'Student added successfully', student });
  } catch (e) { next(e); }
});
app.put('/api/students/:studentId', async (req, res, next) => {
  try {
    const payload = validatePayload(req.body);
    const student = await Student.findOneAndUpdate({ studentId: req.params.studentId }, payload, { new: true, runValidators: true });
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
    res.json({ success: true, message: 'Student updated successfully', student });
  } catch (e) { next(e); }
});
app.delete('/api/students/:studentId', async (req, res, next) => {
  try {
    const student = await Student.findOneAndDelete({ studentId: req.params.studentId });
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
    res.json({ success: true, message: 'Student deleted successfully', studentId: student.studentId });
  } catch (e) { next(e); }
});
function validatePayload(body) {
  const studentId = String(body.studentId || '').trim();
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const department = String(body.department || '').trim();
  const semester = Number(body.semester);
  if (!studentId || !name || !department || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !Number.isInteger(semester) || semester < 1 || semester > 12) {
    const err = new Error('Provide studentId, name, valid email, department, and semester (1–12)'); err.status = 400; throw err;
  }
  return { studentId, name, email, department, semester };
}
function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
app.use((err, _req, res, _next) => {
  console.error(err.name, err.message);
  if (err.code === 11000) return res.status(409).json({ success: false, message: 'Student ID already exists' });
  const status = err.status || (err.name === 'ValidationError' ? 400 : 500);
  res.status(status).json({ success: false, message: status === 500 ? 'Internal server error' : err.message });
});
const port = process.env.PORT || 5000;
async function start() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI environment variable is required');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  app.listen(port, () => console.log(`Student API listening on ${port}`));
}
start().catch(err => { console.error('Startup failed:', err.message); process.exit(1); });
