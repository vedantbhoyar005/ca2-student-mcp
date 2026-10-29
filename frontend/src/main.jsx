import React, { useEffect, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

// ── API base URL ──────────────────────────────────────────────────────────────
// Set VITE_API_URL in Vercel environment variables (no trailing slash).
// Falls back to localhost for development.
const API = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/$/, '');

const blank = { studentId: '', name: '', email: '', department: '', semester: 1 };

// ── HTTP helper ───────────────────────────────────────────────────────────────
async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(API + path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
  } catch (networkErr) {
    throw new Error(
      `Cannot reach the server at ${API}. ` +
      `Check that the backend is running and VITE_API_URL is set correctly. ` +
      `(${networkErr.message})`
    );
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Server returned ${res.status} ${res.statusText}`);
  return data;
}

// ── Main App ─────────────────────────────────────────────────────────────────
function App() {
  const [students, setStudents]   = useState([]);
  const [form, setForm]           = useState(blank);
  const [editing, setEditing]     = useState(false);
  const [query, setQuery]         = useState('');
  const [message, setMessage]     = useState({ text: '', type: 'info' });
  const [busy, setBusy]           = useState(false);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [dbStatus, setDbStatus]   = useState(null);

  // ── Flash message helper ────────────────────────────────────────────────────
  function flash(text, type = 'success') {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: '', type: 'info' }), 5000);
  }

  // ── Check backend health ────────────────────────────────────────────────────
  useEffect(() => {
    request('/health')
      .then(d => setDbStatus(d.database))
      .catch(() => setDbStatus('unreachable'));
  }, []);

  // ── Load / search students ──────────────────────────────────────────────────
  const load = useCallback(async (q = '') => {
    try {
      const d = await request('/api/students' + (q ? `?q=${encodeURIComponent(q)}` : ''));
      setStudents(d.students || []);
    } catch (e) {
      flash(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => { load(''); }, [load]);

  // Debounced search
  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => load(query), 300);
    return () => clearTimeout(t);
  }, [query, load]);

  // ── Form helpers ────────────────────────────────────────────────────────────
  function change(e) {
    setForm(f => ({
      ...f,
      [e.target.name]: e.target.name === 'semester' ? Number(e.target.value) : e.target.value,
    }));
  }

  function resetForm() {
    setForm(blank);
    setEditing(false);
    setShowForm(false);
  }

  // ── Submit (create or update) ───────────────────────────────────────────────
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const url    = editing ? `/api/students/${encodeURIComponent(form.studentId)}` : '/api/students';
      const method = editing ? 'PUT' : 'POST';
      const d = await request(url, { method, body: JSON.stringify(form) });
      flash(d.message, 'success');
      resetForm();
      await load(query);
    } catch (e) {
      flash(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  // ── Edit ────────────────────────────────────────────────────────────────────
  function edit(s) {
    setForm({ studentId: s.studentId, name: s.name, email: s.email, department: s.department, semester: s.semester });
    setEditing(true);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  async function remove(id) {
    if (!confirm(`Delete student "${id}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const d = await request(`/api/students/${encodeURIComponent(id)}`, { method: 'DELETE' });
      flash(d.message, 'success');
      await load(query);
    } catch (e) {
      flash(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="container">
      {/* Header */}
      <header className="app-header">
        <h1>🎓 Student Information System</h1>
        <div className="header-meta">
          <span className={`db-badge db-${dbStatus === 'connected' ? 'ok' : 'err'}`}>
            DB: {dbStatus ?? 'checking…'}
          </span>
          <button
            className="btn btn-primary"
            onClick={() => { resetForm(); setShowForm(v => !v); }}
          >
            {showForm && !editing ? '✕ Cancel' : '+ Add Student'}
          </button>
        </div>
      </header>

      {/* Flash message */}
      {message.text && (
        <div className={`flash flash-${message.type}`} role="alert">
          {message.text}
        </div>
      )}

      {/* Add / Edit Form */}
      {showForm && (
        <section className="card form-card">
          <h2>{editing ? `✏️ Edit Student — ${form.studentId}` : '➕ Add New Student'}</h2>
          <form onSubmit={submit} noValidate>
            <div className="form-grid">
              <label>
                Student ID *
                <input
                  name="studentId"
                  value={form.studentId}
                  onChange={change}
                  placeholder="e.g. STU001"
                  required
                  maxLength={30}
                  disabled={editing}
                  title={editing ? 'Student ID cannot be changed after creation' : ''}
                />
              </label>
              <label>
                Full Name *
                <input name="name" value={form.name} onChange={change} placeholder="Full name" required maxLength={100} />
              </label>
              <label>
                Email *
                <input name="email" type="email" value={form.email} onChange={change} placeholder="student@example.com" required maxLength={254} />
              </label>
              <label>
                Department *
                <input name="department" value={form.department} onChange={change} placeholder="e.g. Computer Science" required maxLength={100} />
              </label>
              <label>
                Semester * (1–12)
                <input name="semester" type="number" value={form.semester} onChange={change} min={1} max={12} required />
              </label>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-success" disabled={busy}>
                {busy ? 'Saving…' : editing ? '💾 Update Student' : '✅ Create Student'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={resetForm} disabled={busy}>
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Search */}
      <section className="search-section">
        <input
          className="search-input"
          type="search"
          placeholder="🔍 Search by ID, name, email, or department…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <span className="result-count">{students.length} student{students.length !== 1 ? 's' : ''}</span>
      </section>

      {/* Table */}
      <section className="table-section">
        {loading ? (
          <p className="loading">Loading…</p>
        ) : students.length === 0 ? (
          <p className="empty">
            {query ? `No students match "${query}".` : 'No students yet. Click "+ Add Student" to create one.'}
          </p>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Student ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Department</th>
                  <th>Sem</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {students.map(s => (
                  <tr key={s.studentId}>
                    <td><code>{s.studentId}</code></td>
                    <td>{s.name}</td>
                    <td>{s.email}</td>
                    <td>{s.department}</td>
                    <td>{s.semester}</td>
                    <td className="actions-cell">
                      <button className="btn btn-sm btn-edit" onClick={() => edit(s)} disabled={busy}>Edit</button>
                      <button className="btn btn-sm btn-delete" onClick={() => remove(s.studentId)} disabled={busy}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
