import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'

type User = { id: number; name: string; email: string; role: string }
type Provider = { id: number; name: string; specialization?: string; description?: string }
type Slot = { start_datetime: string; end_datetime: string }
type Appointment = { id: number; provider_id: number; start_datetime: string; end_datetime: string; status: string }
type Schedule = { id: number; provider_id: number; day_of_week: number; start_time: string; end_time: string; active: boolean }
type BlockedPeriod = { id: number; provider_id: number; start_datetime: string; end_datetime: string; reason?: string }
type AdminSummary = { users: number; providers: number; appointments: number; confirmed: number; cancelled: number }
type AuditItem = { id: number; action: string; user_id: number | null; timestamp: string; details: string | null }
type Confirmation = { message: string; action: () => Promise<void> }

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
  const [adminSummary, setAdminSummary] = useState<AdminSummary | null>(null)
  const [auditItems, setAuditItems] = useState<AuditItem[]>([])
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [myProvider, setMyProvider] = useState<Provider | null>(null)
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [, setBlockedPeriods] = useState<BlockedPeriod[]>([])
  const [scheduleDay, setScheduleDay] = useState('0')
  const [scheduleStart, setScheduleStart] = useState('09:00')
  const [scheduleEnd, setScheduleEnd] = useState('17:00')

  useEffect(() => {
    const saved = sessionStorage.getItem('appointment_user')
    if (saved) setUser(JSON.parse(saved))
    request<Provider[]>('/providers').then(setProviders).catch(() => setMessage('Start FastAPI on port 8000 to load providers.'))
  }, [])
  useEffect(() => { if (user) request<Appointment[]>('/appointments').then(setAppointments).catch(() => undefined) }, [user])
  useEffect(() => {
    if (user?.role === 'PROVIDER') {
      request<Provider>('/providers/me').then(async (profile) => {
        setMyProvider(profile)
        setSchedules(await request<Schedule[]>(`/providers/${profile.id}/schedules`))
        setBlockedPeriods(await request<BlockedPeriod[]>(`/providers/${profile.id}/blocked-periods`))
      }).catch((error) => setMessage(error instanceof Error ? error.message : 'Provider profile unavailable'))
    }
  }, [user])
  useEffect(() => {
    if (user?.role === 'ADMIN') {
      request<AdminSummary>('/admin/summary').then(setAdminSummary).catch((error) => setMessage(error instanceof Error ? error.message : 'Admin summary unavailable'))
      request<AuditItem[]>('/admin/audit').then(setAuditItems).catch(() => undefined)
    }
  }, [user])

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
    setConfirmation({ message: `Book ${formatSlot(slot.start_datetime)} with ${selectedProvider.name}?`, action: async () => { try { await request('/appointments', { method: 'POST', body: JSON.stringify({ provider_id: selectedProvider.id, start_datetime: slot.start_datetime, end_datetime: slot.end_datetime }) }); setMessage('Appointment confirmed.'); setSlots(slots.filter((item) => item.start_datetime !== slot.start_datetime)); setAppointments(await request<Appointment[]>('/appointments')) } catch (error) { setMessage(error instanceof Error ? error.message : 'Booking failed') } } })
  }
  async function cancel(id: number) {
    setConfirmation({ message: 'Cancel this appointment?', action: async () => { try { await request(`/appointments/${id}/cancel`, { method: 'POST' }); setAppointments(await request<Appointment[]>('/appointments')); setMessage('Appointment cancelled.') } catch (error) { setMessage(error instanceof Error ? error.message : 'Cancellation failed') } } })
  }
  async function confirmAction() { if (!confirmation) return; setConfirming(true); await confirmation.action(); setConfirming(false); setConfirmation(null) }
  function logout() { sessionStorage.clear(); setUser(null); setAppointments([]) }

  async function addSchedule(event: FormEvent) {
    event.preventDefault(); if (!myProvider) return
    try {
      const schedule = await request<Schedule>(`/providers/${myProvider.id}/schedules`, { method: 'POST', body: JSON.stringify({ day_of_week: Number(scheduleDay), start_time: `${scheduleStart}:00`, end_time: `${scheduleEnd}:00`, active: true }) })
      setSchedules([...schedules, schedule]); setMessage('Schedule added.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Schedule update failed') }
  }
  async function removeSchedule(id: number) {
    try { await request(`/providers/schedules/${id}`, { method: 'DELETE' }); setSchedules(schedules.filter((schedule) => schedule.id !== id)); setMessage('Schedule removed.') }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Schedule removal failed') }
  }

  if (user?.role === 'PROVIDER' && myProvider) return <div className="app-shell"><aside className="sidebar"><div className="brand-mark">A<span>/</span>S</div><div className="side-title">Your practice,<br /><strong>in balance.</strong></div><nav><a className="active" href="#provider-overview">Overview</a><a href="#provider-schedule">Schedule</a><a href="#provider-appointments">Appointments</a></nav><div className="side-foot"><div className="avatar">{user.name[0]}</div><div><strong>{user.name}</strong><small>provider</small></div><button onClick={logout} title="Sign out">↗</button></div></aside><main className="dashboard" id="provider-overview"><header><div><p className="eyebrow">Provider workspace</p><h1>Good morning, {myProvider.name.split(' ')[1] || myProvider.name}.</h1></div><div className="status"><i /> Provider mode</div></header>{message && <div className="notice inline">{message}</div>}<section className="metric-row"><div><span>Appointments</span><strong>{appointments.filter((a) => a.status === 'CONFIRMED').length.toString().padStart(2, '0')}</strong></div><div><span>Working rules</span><strong>{schedules.length.toString().padStart(2, '0')}</strong></div><div><span>Specialization</span><strong className="metric-text">{myProvider.specialization || 'General'}</strong></div></section><section className="provider-workspace"><div className="booking-panel" id="provider-schedule"><div className="section-heading"><div><p className="eyebrow">Availability</p><h2>Working schedule</h2></div></div><form className="schedule-form" onSubmit={addSchedule}><select value={scheduleDay} onChange={(e) => setScheduleDay(e.target.value)}><option value="0">Monday</option><option value="1">Tuesday</option><option value="2">Wednesday</option><option value="3">Thursday</option><option value="4">Friday</option><option value="5">Saturday</option><option value="6">Sunday</option></select><input type="time" value={scheduleStart} onChange={(e) => setScheduleStart(e.target.value)} /><input type="time" value={scheduleEnd} onChange={(e) => setScheduleEnd(e.target.value)} /><button className="primary" type="submit">Add rule</button></form><div className="schedule-list">{schedules.map((schedule) => <article key={schedule.id}><span>{['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][schedule.day_of_week]}</span><strong>{schedule.start_time.slice(0, 5)} – {schedule.end_time.slice(0, 5)}</strong><button onClick={() => removeSchedule(schedule.id)} title="Remove schedule">×</button></article>)}</div></div><div className="appointments-panel" id="provider-appointments"><div className="section-heading"><div><p className="eyebrow">Your day</p><h2>Appointments</h2></div><span className="count">{appointments.length}</span></div>{appointments.length ? <div className="appointment-list">{appointments.map((appointment) => <article key={appointment.id}><div className="appointment-date"><strong>{new Date(appointment.start_datetime).getDate()}</strong><small>{new Intl.DateTimeFormat('en', { month: 'short' }).format(new Date(appointment.start_datetime))}</small></div><div className="appointment-info"><strong>Customer appointment</strong><span>{formatSlot(appointment.start_datetime)} · {appointment.status.toLowerCase()}</span></div></article>)}</div> : <div className="empty large">No appointments yet.</div>}</div></section></main></div>

  if (user?.role === 'ADMIN' && adminSummary) return <div className="app-shell"><aside className="sidebar"><div className="brand-mark">A<span>/</span>S</div><div className="side-title">System view,<br /><strong>in focus.</strong></div><nav><a className="active" href="#admin-overview">Overview</a><a href="#admin-audit">Audit activity</a></nav><div className="side-foot"><div className="avatar">{user.name[0]}</div><div><strong>{user.name}</strong><small>administrator</small></div><button onClick={logout} title="Sign out">↗</button></div></aside><main className="dashboard" id="admin-overview"><header><div><p className="eyebrow">Operations console</p><h1>System at a glance.</h1></div><div className="status"><i /> API operational</div></header>{message && <div className="notice inline">{message}</div>}<section className="metric-row"><div><span>Users</span><strong>{adminSummary.users.toString().padStart(2, '0')}</strong></div><div><span>Providers</span><strong>{adminSummary.providers.toString().padStart(2, '0')}</strong></div><div><span>Appointments</span><strong>{adminSummary.appointments.toString().padStart(2, '0')}</strong></div></section><section className="provider-workspace"><div className="booking-panel"><div className="section-heading"><div><p className="eyebrow">Business health</p><h2>Appointment status</h2></div></div><div className="admin-bars"><div><span>Confirmed</span><strong>{adminSummary.confirmed}</strong></div><div><span>Cancelled</span><strong>{adminSummary.cancelled}</strong></div></div></div><div className="appointments-panel" id="admin-audit"><div className="section-heading"><div><p className="eyebrow">Traceability</p><h2>Recent audit</h2></div><span className="count">{auditItems.length}</span></div><div className="audit-list">{auditItems.map((item) => <article key={item.id}><strong>{item.action.replaceAll('_', ' ')}</strong><span>{new Date(item.timestamp).toLocaleString()}</span></article>)}</div></div></section></main></div>

  if (!user) return <main className="auth-shell"><div className="auth-panel"><div className="brand-mark">A<span>/</span>S</div><p className="eyebrow">Appointment Scheduling</p><h1>Make time for what matters.</h1><p className="lede">A calmer way to find the right provider, choose a time, and keep your day moving.</p><form onSubmit={authenticate} className="auth-form"><h2>{isRegistering ? 'Create your account' : 'Welcome back'}</h2>{isRegistering && <label>Name<input value={name} onChange={(e) => setName(e.target.value)} required /></label>}<label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label><label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required /></label><button className="primary" disabled={loading}>{loading ? 'Please wait...' : isRegistering ? 'Create account' : 'Sign in'}</button></form><button className="text-button" onClick={() => setIsRegistering(!isRegistering)}>{isRegistering ? 'Already have an account? Sign in' : 'New here? Create an account'}</button>{message && <p className="notice">{message}</p>}</div><div className="auth-art"><div className="art-note">01 <span>Find your rhythm</span></div><div className="art-sun" /><div className="art-copy">Thoughtful scheduling<br /><em>for real life.</em></div></div></main>

  return <div className="app-shell"><aside className="sidebar"><div className="brand-mark">A<span>/</span>S</div><div className="side-title">Your day,<br /><strong>in balance.</strong></div><nav><a className="active" href="#overview">Overview</a><a href="#appointments">Appointments</a><a href="#providers">Providers</a></nav><div className="side-foot"><div className="avatar">{user.name[0]}</div><div><strong>{user.name}</strong><small>{user.role.toLowerCase()}</small></div><button onClick={logout} title="Sign out">↗</button></div></aside><main className="dashboard" id="overview"><header><div><p className="eyebrow">Thursday, September 24</p><h1>Good morning, {user.name.split(' ')[0]}.</h1></div><div className="status"><i /> System operational</div></header>{message && <div className="notice inline">{message}</div>}<section className="metric-row"><div><span>Upcoming</span><strong>{appointments.filter((a) => a.status === 'CONFIRMED').length.toString().padStart(2, '0')}</strong></div><div><span>Providers</span><strong>{providers.length.toString().padStart(2, '0')}</strong></div><div><span>Next focus</span><strong>{appointments[0] ? formatSlot(appointments[0].start_datetime) : '—'}</strong></div></section><section className="workspace"><div className="booking-panel" id="providers"><div className="section-heading"><div><p className="eyebrow">Find a time</p><h2>Book an appointment</h2></div><input className="date-input" type="date" value={date} onChange={(e) => { setDate(e.target.value); if (selectedProvider) loadAvailability(selectedProvider) }} /></div><div className="provider-grid">{providers.map((provider) => <button className={`provider-card ${selectedProvider?.id === provider.id ? 'selected' : ''}`} key={provider.id} onClick={() => loadAvailability(provider)}><span className="provider-icon">{provider.name[0]}</span><span><strong>{provider.name}</strong><small>{provider.specialization || 'General provider'}</small></span><b>→</b></button>)}</div>{selectedProvider && <div className="slots"><div className="slot-heading"><span>Available with {selectedProvider.name}</span><small>{date}</small></div>{slots.length ? <div className="slot-grid">{slots.map((slot) => <button key={slot.start_datetime} onClick={() => book(slot)}>{formatSlot(slot.start_datetime)}<small>30 min</small></button>)}</div> : <p className="empty">No open slots for this date. Try another day.</p>}</div>}</div><div className="appointments-panel" id="appointments"><div className="section-heading"><div><p className="eyebrow">Your schedule</p><h2>Appointments</h2></div><span className="count">{appointments.length}</span></div>{appointments.length ? <div className="appointment-list">{appointments.map((appointment) => <article key={appointment.id}><div className="appointment-date"><strong>{new Date(appointment.start_datetime).getDate()}</strong><small>{new Intl.DateTimeFormat('en', { month: 'short' }).format(new Date(appointment.start_datetime))}</small></div><div className="appointment-info"><strong>{providers.find((p) => p.id === appointment.provider_id)?.name || `Provider #${appointment.provider_id}`}</strong><span>{formatSlot(appointment.start_datetime)} · {appointment.status.toLowerCase()}</span></div>{appointment.status === 'CONFIRMED' && <button onClick={() => cancel(appointment.id)} title="Cancel appointment">×</button>}</article>)}</div> : <div className="empty large">Your calendar is clear.<br /><span>Choose a provider to make your first booking.</span></div>}</div></section></main>{confirmation && <div className="modal-backdrop" role="presentation"><section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title"><p className="eyebrow">Please confirm</p><h2 id="confirm-title">{confirmation.message}</h2><p className="modal-copy">This action will update your appointment record.</p><div className="modal-actions"><button className="secondary" onClick={() => setConfirmation(null)} disabled={confirming}>Keep it</button><button className="primary modal-confirm" onClick={confirmAction} disabled={confirming}>{confirming ? 'Working...' : 'Confirm'}</button></div></section></div>}</div>
}

export default App
