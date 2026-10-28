import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
const API = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/$/, '');
const blank = { studentId: '', name: '', email: '', department: '', semester: 1 };
function App() {
  const [students, setStudents] = useState([]), [form, setForm] = useState(blank), [editing, setEditing] = useState(false);
  const [query, setQuery] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  async function request(path, options = {}) {
    const r = await fetch(API + path, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    const data = await r.json().catch(() => ({})); if (!r.ok) throw new Error(data.message || `Request failed (${r.status})`); return data;
  }
  async function load(q = query) { try { const d = await request('/api/students' + (q ? `?q=${encodeURIComponent(q)}` : '')); setStudents(d.students || []); } catch (e) { setMessage(e.message); } }
  useEffect(() => { load(''); }, []);
  useEffect(() => { const t = setTimeout(() => load(query), 250); return () => clearTimeout(t); }, [query]);
  function change(e) { setForm({ ...form, [e.target.name]: e.target.name === 'semester' ? Number(e.target.value) : e.target.value }); }
  async function submit(e) { e.preventDefault(); setBusy(true); setMessage(''); try {
    const url = editing ? `/api/students/${encodeURIComponent(form.studentId)}` : '/api/students';
    const d = await request(url, { method: editing ? 'PUT' : 'POST', body: JSON.stringify(form) });
    setMessage(d.message); setForm(blank); setEditing(false); await load(query);
  } catch (e) { setMessage(e.message); } finally { setBusy(false); } }
  function edit(s) { setForm({ studentId: s.studentId, name: s.name, email: s.email, department: s.department, semester: s.semester }); setEditing(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  async function remove(id) { if (!confirm(`Delete student ${id}? This cannot be undone.`)) return; try { const d = await request(`/api/students/${encodeURIComponent(id)}`, { method: 'DELETE' }); setMessage(d.message); await load(query); } catch (e) { setMessage(e.message); } }
  return <main><header><div><p className="eyebrow">CA2 · THREE-TIER CLOUD APPLICATION</p><h1>Student Management</h1><p className="sub">Vercel · Render · MongoDB Atlas</p></div><div className="count"><strong>{students.length}</strong><span>records shown</span></div></header>
    {message && <div className="notice" role="status">{message}<button className="close" onClick={() => setMessage('')}>×</button></div>}
    <section className="panel"><h2>{editing ? 'Update student' : 'Add a student'}</h2><form onSubmit={submit} className="form-grid">
      <label>Student ID<input name="studentId" value={form.studentId} onChange={change} required disabled={editing} placeholder="ST101" maxLength="30"/></label>
      <label>Full name<input name="name" value={form.name} onChange={change} required maxLength="100" placeholder="Rahul Sharma"/></label>
      <label>Email<input name="email" type="email" value={form.email} onChange={change} required placeholder="rahul@example.com"/></label>
      <label>Department<input name="department" value={form.department} onChange={change} required placeholder="Computer Science"/></label>
      <label>Semester<select name="semester" value={form.semester} onChange={change}>{Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{i+1}</option>)}</select></label>
      <div className="actions"><button disabled={busy} className="primary">{busy ? 'Saving…' : editing ? 'Save changes' : 'Add student'}</button>{editing && <button type="button" onClick={() => {setForm(blank);setEditing(false)}}>Cancel</button>}</div>
    </form></section>
    <section className="panel"><div className="list-head"><div><h2>Student records</h2><p className="sub">Search by ID, name, email or department.</p></div><input className="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search students…"/></div>
    <div className="table-wrap"><table><thead><tr><th>Student ID</th><th>Name</th><th>Email</th><th>Department</th><th>Sem.</th><th>Actions</th></tr></thead><tbody>{students.map(s=><tr key={s._id}><td><strong>{s.studentId}</strong></td><td>{s.name}</td><td>{s.email}</td><td>{s.department}</td><td>{s.semester}</td><td className="row-actions"><button onClick={()=>edit(s)}>Edit</button><button className="danger" onClick={()=>remove(s.studentId)}>Delete</button></td></tr>)}{!students.length && <tr><td colSpan="6" className="empty">No student records found.</td></tr>}</tbody></table></div></section>
    <footer>Student records are handled by the backend API. Never place database credentials in frontend code.</footer></main>
}

createRoot(document.getElementById('root')).render(<App />);
