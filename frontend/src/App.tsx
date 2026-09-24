import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'

type User = { id: number; name: string; email: string; role: string }
type Provider = { id: number; name: string; specialization?: string; description?: string }
type Slot = { start_datetime: string; end_datetime: string }
type Appointment = { id: number; provider_id: number; start_datetime: string; end_datetime: string; status: string }

const jsonHeaders = { 'Content-Type': 'application/json' }

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = sessionStorage.getItem('appointment_token')
  const response = await fetch(url, {
    ...options,
    headers: { ...(options.body ? jsonHeaders : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
  })
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail ?? 'Request failed')
  return response.status === 204 ? (undefined as T) : response.json()
}

function formatSlot(value: string) {
  return new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [providers, setProviders] = useState<Provider[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null)
  const [slots, setSlots] = useState<Slot[]>([])
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [isRegistering, setIsRegistering] = useState(false)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const saved = sessionStorage.getItem('appointment_user')
    if (saved) setUser(JSON.parse(saved))
    request<Provider[]>('/providers').then(setProviders).catch(() => setMessage('Start FastAPI on port 8000 to load providers.'))
  }, [])
  useEffect(() => { if (user) request<Appointment[]>('/appointments').then(setAppointments).catch(() => undefined) }, [user])

  async function authenticate(event: FormEvent) {
    event.preventDefault(); setLoading(true); setMessage('')
    try {
      const endpoint = isRegistering ? '/auth/register' : '/auth/login'
      const body = isRegistering ? { name, email, password } : { email, password }
      const data = await request<{ access_token: string; user: User }>(endpoint, { method: 'POST', body: JSON.stringify(body) })
      sessionStorage.setItem('appointment_token', data.access_token); sessionStorage.setItem('appointment_user', JSON.stringify(data.user)); setUser(data.user)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Authentication failed') }
    finally { setLoading(false) }
  }
  async function loadAvailability(provider: Provider) {
    setSelectedProvider(provider); setMessage('')
    try { setSlots((await request<{ slots: Slot[] }>(`/providers/${provider.id}/availability?target_date=${date}`)).slots) }
    catch (error) { setSlots([]); setMessage(error instanceof Error ? error.message : 'Availability unavailable') }
  }
  async function book(slot: Slot) {
    if (!selectedProvider) return
    try { await request('/appointments', { method: 'POST', body: JSON.stringify({ provider_id: selectedProvider.id, start_datetime: slot.start_datetime, end_datetime: slot.end_datetime }) }); setMessage('Appointment confirmed.'); setSlots(slots.filter((item) => item.start_datetime !== slot.start_datetime)); setAppointments(await request<Appointment[]>('/appointments')) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Booking failed') }
  }
  async function cancel(id: number) {
    try { await request(`/appointments/${id}/cancel`, { method: 'POST' }); setAppointments(await request<Appointment[]>('/appointments')); setMessage('Appointment cancelled.') }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Cancellation failed') }
  }
  function logout() { sessionStorage.clear(); setUser(null); setAppointments([]) }

  if (!user) return <main className="auth-shell"><div className="auth-panel"><div className="brand-mark">A<span>/</span>S</div><p className="eyebrow">Appointment Scheduling</p><h1>Make time for what matters.</h1><p className="lede">A calmer way to find the right provider, choose a time, and keep your day moving.</p><form onSubmit={authenticate} className="auth-form"><h2>{isRegistering ? 'Create your account' : 'Welcome back'}</h2>{isRegistering && <label>Name<input value={name} onChange={(e) => setName(e.target.value)} required /></label>}<label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label><label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required /></label><button className="primary" disabled={loading}>{loading ? 'Please wait...' : isRegistering ? 'Create account' : 'Sign in'}</button></form><button className="text-button" onClick={() => setIsRegistering(!isRegistering)}>{isRegistering ? 'Already have an account? Sign in' : 'New here? Create an account'}</button>{message && <p className="notice">{message}</p>}</div><div className="auth-art"><div className="art-note">01 <span>Find your rhythm</span></div><div className="art-sun" /><div className="art-copy">Thoughtful scheduling<br /><em>for real life.</em></div></div></main>

  return <div className="app-shell"><aside className="sidebar"><div className="brand-mark">A<span>/</span>S</div><div className="side-title">Your day,<br /><strong>in balance.</strong></div><nav><a className="active" href="#overview">Overview</a><a href="#appointments">Appointments</a><a href="#providers">Providers</a></nav><div className="side-foot"><div className="avatar">{user.name[0]}</div><div><strong>{user.name}</strong><small>{user.role.toLowerCase()}</small></div><button onClick={logout} title="Sign out">↗</button></div></aside><main className="dashboard" id="overview"><header><div><p className="eyebrow">Thursday, September 24</p><h1>Good morning, {user.name.split(' ')[0]}.</h1></div><div className="status"><i /> System operational</div></header>{message && <div className="notice inline">{message}</div>}<section className="metric-row"><div><span>Upcoming</span><strong>{appointments.filter((a) => a.status === 'CONFIRMED').length.toString().padStart(2, '0')}</strong></div><div><span>Providers</span><strong>{providers.length.toString().padStart(2, '0')}</strong></div><div><span>Next focus</span><strong>{appointments[0] ? formatSlot(appointments[0].start_datetime) : '—'}</strong></div></section><section className="workspace"><div className="booking-panel" id="providers"><div className="section-heading"><div><p className="eyebrow">Find a time</p><h2>Book an appointment</h2></div><input className="date-input" type="date" value={date} onChange={(e) => { setDate(e.target.value); if (selectedProvider) loadAvailability(selectedProvider) }} /></div><div className="provider-grid">{providers.map((provider) => <button className={`provider-card ${selectedProvider?.id === provider.id ? 'selected' : ''}`} key={provider.id} onClick={() => loadAvailability(provider)}><span className="provider-icon">{provider.name[0]}</span><span><strong>{provider.name}</strong><small>{provider.specialization || 'General provider'}</small></span><b>→</b></button>)}</div>{selectedProvider && <div className="slots"><div className="slot-heading"><span>Available with {selectedProvider.name}</span><small>{date}</small></div>{slots.length ? <div className="slot-grid">{slots.map((slot) => <button key={slot.start_datetime} onClick={() => book(slot)}>{formatSlot(slot.start_datetime)}<small>30 min</small></button>)}</div> : <p className="empty">No open slots for this date. Try another day.</p>}</div>}</div><div className="appointments-panel" id="appointments"><div className="section-heading"><div><p className="eyebrow">Your schedule</p><h2>Appointments</h2></div><span className="count">{appointments.length}</span></div>{appointments.length ? <div className="appointment-list">{appointments.map((appointment) => <article key={appointment.id}><div className="appointment-date"><strong>{new Date(appointment.start_datetime).getDate()}</strong><small>{new Intl.DateTimeFormat('en', { month: 'short' }).format(new Date(appointment.start_datetime))}</small></div><div className="appointment-info"><strong>{providers.find((p) => p.id === appointment.provider_id)?.name || `Provider #${appointment.provider_id}`}</strong><span>{formatSlot(appointment.start_datetime)} · {appointment.status.toLowerCase()}</span></div>{appointment.status === 'CONFIRMED' && <button onClick={() => cancel(appointment.id)} title="Cancel appointment">×</button>}</article>)}</div> : <div className="empty large">Your calendar is clear.<br /><span>Choose a provider to make your first booking.</span></div>}</div></section></main></div>
}

export default App
