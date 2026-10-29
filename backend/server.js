require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

// ── Environment ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('FATAL: MONGODB_URI environment variable is not set.');
  process.exit(1);
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── App setup ────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '100kb' }));

// CORS: allow Vercel frontend, preview domains, and local dev
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    // Allow non-browser requests (e.g. mobile apps, curl, MCP servers)
    if (!origin) return callback(null, true);
    
    const originLower = origin.toLowerCase().trim();
    if (
      allowedOrigins.includes(originLower) ||
      allowedOrigins.includes('*') ||
      originLower.includes('.vercel.app') ||
      originLower.startsWith('http://localhost:') ||
      originLower.startsWith('http://127.0.0.1:') ||
      originLower === 'http://localhost' ||
      originLower === 'http://127.0.0.1'
    ) {
      return callback(null, true);
    }
    
    // Non-allowed origins don't throw an unhandled 500; they get rejected cleanly
    return callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Pre-flight handler
app.options('*', cors());

// ── Mongoose Schema ──────────────────────────────────────────────────────────
const studentSchema = new mongoose.Schema({
  studentId:  { type: String, required: true, unique: true, trim: true, maxlength: 30 },
  name:       { type: String, required: true, trim: true, maxlength: 100 },
  email:      { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
  department: { type: String, required: true, trim: true, maxlength: 100 },
  semester:   { type: Number, required: true, min: 1, max: 12 },
}, { timestamps: true });

const Student = mongoose.model('Student', studentSchema);

// ── Health endpoint ──────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  const dbState = mongoose.connection.readyState;
  const states = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
  res.json({ ok: dbState === 1, database: states[dbState] || 'unknown', uptime: process.uptime() });
});

// ── CRUD Routes ──────────────────────────────────────────────────────────────

// GET /api/students — list all or search with ?q=
app.get('/api/students', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    const filter = q
      ? {
          $or: [
            { studentId:  { $regex: escapeRegex(q), $options: 'i' } },
            { name:       { $regex: escapeRegex(q), $options: 'i' } },
            { email:      { $regex: escapeRegex(q), $options: 'i' } },
            { department: { $regex: escapeRegex(q), $options: 'i' } },
          ],
        }
      : {};
    const students = await Student.find(filter).sort({ createdAt: -1 }).limit(500).lean();
    res.json({ success: true, count: students.length, students });
  } catch (err) {
    next(err);
  }
});

// GET /api/students/:id — get one student
app.get('/api/students/:id', async (req, res, next) => {
  try {
    const student = await Student.findOne({ studentId: req.params.id }).lean();
    if (!student) return res.status(404).json({ success: false, message: `Student '${req.params.id}' not found` });
    res.json({ success: true, student });
  } catch (err) {
    next(err);
  }
});

// POST /api/students — create student
app.post('/api/students', async (req, res, next) => {
  try {
    const studentId = String(req.body.studentId || '').trim();
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const department = String(req.body.department || '').trim();
    const semester = Number(req.body.semester);

    if (!studentId || !name || !email || !department || !Number.isInteger(semester) || semester < 1 || semester > 12) {
      return res.status(400).json({
        success: false,
        message: 'Provide studentId, name, valid email, department, and semester (1-12).'
      });
    }

    const existing = await Student.findOne({ studentId });
    if (existing) {
      return res.status(409).json({ success: false, message: `Student with ID '${studentId}' already exists.` });
    }

    const student = await Student.create({ studentId, name, email, department, semester });
    res.status(201).json({ success: true, message: 'Student added successfully', student });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'Student ID or email already exists.' });
    }
    next(err);
  }
});

// PUT /api/students/:id — update student
app.put('/api/students/:id', async (req, res, next) => {
  try {
    const studentId = req.params.id;
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const department = String(req.body.department || '').trim();
    const semester = Number(req.body.semester);

    if (!name || !email || !department || !Number.isInteger(semester) || semester < 1 || semester > 12) {
      return res.status(400).json({
        success: false,
        message: 'Provide name, valid email, department, and semester (1-12).'
      });
    }

    const student = await Student.findOneAndUpdate(
      { studentId },
      { $set: { name, email, department, semester } },
      { new: true, runValidators: true }
    ).lean();

    if (!student) return res.status(404).json({ success: false, message: `Student '${studentId}' not found` });
    res.json({ success: true, message: 'Student updated successfully', student });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'Email is already in use by another student.' });
    }
    next(err);
  }
});

// DELETE /api/students/:id — delete student
app.delete('/api/students/:id', async (req, res, next) => {
  try {
    const student = await Student.findOneAndDelete({ studentId: req.params.id }).lean();
    if (!student) return res.status(404).json({ success: false, message: `Student '${req.params.id}' not found` });
    res.json({ success: true, message: 'Student deleted successfully', studentId: req.params.id });
  } catch (err) {
    next(err);
  }
});

// ── Global error handler ─────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err.message);
  if (err.name === 'ValidationError') {
    const msgs = Object.values(err.errors).map(e => e.message).join(', ');
    return res.status(400).json({ success: false, message: `Validation error: ${msgs}` });
  }
  res.status(500).json({ success: false, message: 'Internal server error.' });
});

// ── DB → Server startup ──────────────────────────────────────────────────────
mongoose
  .connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 15000,
    socketTimeoutMS: 45000,
  })
  .then(() => {
    console.log('MongoDB connected.');
    app.listen(PORT, () => console.log(`Student API listening on ${PORT}`));
  })
  .catch(err => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });
