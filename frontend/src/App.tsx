// @ts-nocheck
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import "./App.css";

type User = { id: number; name: string; email: string; role: string };
type Provider = { id: number; name: string; specialization?: string };
type Appointment = {
  id: number;
  provider_id: number;
  start_datetime: string;
  end_datetime: string;
  status: string;
  concern?: string;
  payment_status?: string;
  payment_amount?: number;
};
type Slot = { start_datetime: string; end_datetime: string };
type Profile = {
  id: number;
  user_id: number;
  name: string;
  email: string;
  gender?: string;
  age?: number;
  weight_kg?: number;
  medical_notes?: string;
};
type Confirmation = { text: string; action: () => Promise<void> };
type PaymentRequest = {
  provider: Provider;
  slot: Slot;
  concern: string;
  action: () => Promise<void>;
};

async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = sessionStorage.getItem("appointment_token");
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (response.status === 401) {
    sessionStorage.clear();
    window.location.reload();
    throw new Error("Session expired. Please sign in again.");
  }
  if (!response.ok)
    throw new Error(
      (await response.json().catch(() => null))?.detail ?? "Request failed",
    );
  return response.status === 204 ? (undefined as T) : response.json();
}

const timeLabel = (value: string) =>
  new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(
    new Date(value),
  );

function ConfirmModal({
  item,
  close,
  confirm,
}: {
  item: Confirmation;
  close: () => void;
  confirm: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <section className="confirm-modal" role="dialog" aria-modal="true">
        <p className="eyebrow">Please confirm</p>
        <h2>{item.text}</h2>
        <p className="modal-copy">
          This action will update your appointment record.
        </p>
        <div className="modal-actions">
          <button
            className="secondary"
            style={{ color: "var(--rust)", borderColor: "var(--rust)" }}
            onClick={close}
          >
            Keep it
          </button>
          <button
            className="primary modal-confirm"
            style={{ background: "var(--green)", color: "#fff" }}
            onClick={confirm}
          >
            Confirm
          </button>
        </div>
      </section>
    </div>
  );
}

function PaymentModal({
  request,
  close,
  pay,
}: {
  request: PaymentRequest;
  close: () => void;
  pay: () => Promise<void>;
}) {
  const [method, setMethod] = useState("UPI");
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const value = (name: string) =>
      (form.elements.namedItem(name) as HTMLInputElement)?.value.trim();
    if (method === "UPI" && !value("upi"))
      return setError("Enter a valid UPI ID.");
    if (
      method === "Card" &&
      (!value("card") || !value("expiry") || !value("cvv"))
    )
      return setError("Enter card number, expiry, and CVV.");
    setError("");
    await pay();
  }
  return (
    <div className="modal-backdrop">
      <section className="payment-modal" role="dialog" aria-modal="true">
        <p className="eyebrow">Secure checkout</p>
        <h2>Pay ₹500 to book</h2>
        <p className="modal-copy">
          {request.provider.name} · {timeLabel(request.slot.start_datetime)}
        </p>
        <div className="payment-methods">
          <button
            type="button"
            className={method === "UPI" ? "active" : ""}
            onClick={() => setMethod("UPI")}
          >
            UPI
          </button>
          <button
            type="button"
            className={method === "Card" ? "active" : ""}
            onClick={() => setMethod("Card")}
          >
            Card
          </button>
        </div>
        <form onSubmit={submit} className="payment-form">
          {method === "UPI" ? (
            <label>
              UPI ID
              <input name="upi" placeholder="name@bank" autoComplete="off" />
            </label>
          ) : (
            <>
              <label>
                Card number
                <input
                  name="card"
                  inputMode="numeric"
                  placeholder="1234 5678 9012 3456"
                  autoComplete="off"
                />
              </label>
              <div className="payment-row">
                <label>
                  Expiry
                  <input name="expiry" placeholder="MM/YY" autoComplete="off" />
                </label>
                <label>
                  CVV
                  <input
                    name="cvv"
                    type="password"
                    inputMode="numeric"
                    placeholder="123"
                    autoComplete="off"
                  />
                </label>
              </div>
            </>
          )}
          {error && <p className="notice">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={close}>
              Cancel
            </button>
            <button type="submit" className="primary modal-confirm">
              Pay ₹500 &amp; book
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function App() {
  const [user, setUser] = useState<User | null>(() => {
    const saved = sessionStorage.getItem("appointment_user");
    return saved ? JSON.parse(saved) : null;
  });
  const [message, setMessage] = useState("");
  const [providers, setProviders] = useState<Provider[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [profile, setProfile] = useState<Profile | null>({
    id: 0,
    user_id: 0,
    name: "",
    email: "",
    gender: "",
    age: undefined,
    weight_kg: undefined,
    medical_notes: "",
  });
  const [view, setView] = useState(
    () => window.location.hash.slice(1) || "overview",
  );
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [paymentRequest, setPaymentRequest] = useState<PaymentRequest | null>(
    null,
  );

  useEffect(() => {
    window.addEventListener("hashchange", () =>
      setView(window.location.hash.slice(1) || "overview"),
    );
    return () => window.removeEventListener("hashchange", () => undefined);
  }, []);
  useEffect(() => {
    api<Provider[]>("/providers")
      .then(setProviders)
      .catch(() => setMessage("Start the backend on port 8000."));
  }, []);
  useEffect(() => {
    if (user)
      api<Appointment[]>("/appointments")
        .then(setAppointments)
        .catch(() => undefined);
  }, [user]);
  useEffect(() => {
    if (user?.role === "CUSTOMER")
      api<Profile>("/users/me/profile")
        .then(setProfile)
        .catch(() => undefined);
  }, [user]);

  async function login(event: FormEvent) {
    event.preventDefault();
    try {
      const result = await api<{ access_token: string; user: User }>(
        "/auth/login",
        {
          method: "POST",
          body: JSON.stringify({
            email: (event.currentTarget as HTMLFormElement).email.value,
            password: (event.currentTarget as HTMLFormElement).password.value,
          }),
        },
      );
      sessionStorage.setItem("appointment_token", result.access_token);
      sessionStorage.setItem("appointment_user", JSON.stringify(result.user));
      setUser(result.user);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Login failed");
    }
  }
  function logout() {
    sessionStorage.clear();
    setUser(null);
  }
  function cancel(appointment: Appointment) {
    setConfirmation({
      text: "Cancel this appointment?",
      action: async () => {
        await api(`/appointments/${appointment.id}/cancel`, { method: "POST" });
        setAppointments(await api<Appointment[]>("/appointments"));
        setMessage("Appointment cancelled.");
      },
    });
  }

  if (!user)
    return (
      <main className="auth-shell">
        <div className="auth-panel">
          <div className="brand-mark">A<span>/</span>S</div>
          <p className="eyebrow">Appointment Scheduling</p>
          <h1>Make time for what matters.</h1>
          <p className="lede">Find a provider, choose a time, and keep your day moving.</p>
          <form onSubmit={login} className="auth-form">
            <h2>Welcome back</h2>
            <label>Email<input name="email" type="email" required /></label>
            <label>Password<input name="password" type="password" required /></label>
            <button className="primary">Sign in</button>
          </form>
          {message && <p className="notice">{message}</p>}
        </div>
        <div className="auth-art"><div className="art-note">01 <span>Find your rhythm</span></div><div className="art-sun" /><div className="art-copy">Thoughtful scheduling<br /><em>for real life.</em></div></div>
      </main>
    );
  if (user.role !== "CUSTOMER")
    return <RoleView4 user={user} appointments={appointments} providers={providers} logout={logout} cancel={cancel} confirmation={confirmation} setConfirmation={setConfirmation} message={message} />;
  return <CustomerView user={user} providers={providers} appointments={appointments} profile={profile} setProfile={setProfile} setAppointments={setAppointments} message={message} setMessage={setMessage} view={view} setConfirmation={setConfirmation} confirmation={confirmation} paymentRequest={paymentRequest} setPaymentRequest={setPaymentRequest} logout={logout} />;
}
function CustomerView({
  user,
  providers,
  appointments,
  profile,
  setProfile,
  setAppointments,
  message,
  setMessage,
  view,
  setConfirmation,
  confirmation,
  paymentRequest,
  setPaymentRequest,
  logout,
}: any) {
  const navigate = (page: string) => {
    window.location.hash = page;
    setTimeout(
      () =>
        document.getElementById(page)?.scrollIntoView({ behavior: "smooth" }),
      0,
    );
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark">
          A<span>/</span>S
        </div>
        <div className="side-title">
          Your day,
          <br />
          <strong>in balance.</strong>
        </div>
        <nav>
          <a
            className={view === "overview" ? "active" : ""}
            onClick={() => navigate("overview")}
          >
            Overview
          </a>
          <a
            className={view === "appointments" ? "active" : ""}
            onClick={() => navigate("appointments")}
          >
            Appointments
          </a>
          <a
            className={view === "profile" ? "active" : ""}
            onClick={() => navigate("profile")}
          >
            Profile
          </a>
        </nav>
        <div className="side-foot">
          <div className="avatar">{user.name[0]}</div>
          <div>
            <strong>{user.name}</strong>
            <small>customer</small>
          </div>
          <button onClick={logout}>↗</button>
        </div>
      </aside>
      <main className="dashboard">
        <header>
          <div>
            <p className="eyebrow">Customer workspace</p>
            <h1>
              {view === "appointments"
                ? "Your appointments."
                : view === "profile"
                    ? "Your profile."
                    : `Good morning, ${user.name.split(" ")[0]}.`}
            </h1>
          </div>
          <div className="status">
            <i /> System operational
          </div>
        </header>
        {message && <div className="notice inline">{message}</div>}
        {view === "overview" && (
          <Overview appointments={appointments} providers={providers} />
        )}
        {view === "profile" && (
          <ProfilePage
            profile={profile}
            setProfile={setProfile}
            setMessage={setMessage}
          />
        )}
        {view === "appointments" && (
          <AppointmentsPage
            providers={providers}
            appointments={appointments}
            setAppointments={setAppointments}
            setMessage={setMessage}
            setConfirmation={setConfirmation}
            setPaymentRequest={setPaymentRequest}
          />
        )}
        {paymentRequest && (
          <PaymentModal
            request={paymentRequest}
            close={() => setPaymentRequest(null)}
            pay={async () => {
              await paymentRequest.action();
              setPaymentRequest(null);
            }}
          />
        )}
        {confirmation && (
          <ConfirmModal
            item={confirmation}
            close={() => setConfirmation(null)}
            confirm={async () => {
              await confirmation.action();
              setConfirmation(null);
            }}
          />
        )}
      </main>
    </div>
  );
}

function PaymentPage({
  appointments,
  providers,
}: {
  appointments: Appointment[];
  providers: Provider[];
}) {
  const [profiles, setProfiles] = useState<Record<number, Profile>>({});
  useEffect(() => {
    Promise.all(
      appointments.map(async (appointment) => {
        try {
          return [
            appointment.id,
            await api<Profile>(
              `/appointments/${appointment.id}/customer-profile`,
            ),
          ] as const;
        } catch {
          return null;
        }
      }),
    ).then((items) =>
      setProfiles(
        Object.fromEntries(items.filter(Boolean) as [number, Profile][]),
      ),
    );
  }, [appointments]);
  return (
    <section className="appointments-panel page-panel">
      <p className="eyebrow">Transaction history</p>
      <h2>Payment details</h2>
      <div className="payment-list">
        {appointments.map((appointment) => {
          const doctor =
            providers.find(
              (provider) => provider.id === appointment.provider_id,
            )?.name || "Doctor";
          return (
            <article key={appointment.id}>
              <div>
                <strong>
                  ₹{appointment.payment_amount ?? 500} ·{" "}
                  {appointment.payment_status || "PAID"}
                </strong>
                <span>
                  Paid by: {profiles[appointment.id]?.name || "Patient"}
                </span>
                <span>Paid to: {doctor}</span>
                <span>
                  {timeLabel(appointment.start_datetime)} · Appointment #
                  {appointment.id}
                </span>
              </div>
              <div className="payment-summary">
                <strong>₹{appointment.payment_amount ?? 500}</strong>
                <span className="payment-paid">
                  {appointment.payment_status || "PAID"}
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function AppointmentColumns({ appointments, render }: any) {
  const now = Date.now();
  const groups = [
    {
      key: "upcoming",
      title: "Upcoming appointments",
      items: appointments.filter((item: Appointment) => item.status === "CONFIRMED" && new Date(item.start_datetime).getTime() >= now),
    },
    {
      key: "past",
      title: "Past appointments",
      items: appointments.filter((item: Appointment) => item.status === "CONFIRMED" && new Date(item.start_datetime).getTime() < now),
    },
    {
      key: "cancelled",
      title: "Cancelled appointments",
      items: appointments.filter((item: Appointment) => item.status === "CANCELLED"),
    },
  ];
  return <div className="appointment-columns">{groups.map((group) => <section className={`appointment-column ${group.key}`} key={group.key}><div className="column-heading"><h3>{group.title}</h3><span>{group.items.length}</span></div><div className="appointment-list">{[...group.items].sort((a, b) => new Date(b.start_datetime).getTime() - new Date(a.start_datetime).getTime()).map(render)}{group.items.length === 0 && <p className="empty-column">No appointments</p>}</div></section>)}</div>;
}

function Overview({
  appointments,
  providers,
}: {
  appointments: Appointment[];
  providers: Provider[];
}) {
  const next = appointments.find(
    (appointment) => appointment.status === "CONFIRMED",
  );
  const doctor = next
    ? providers.find((provider) => provider.id === next.provider_id)?.name
    : null;
  return (
    <section className="overview-panel page-panel">
      <h2>Your day at a glance</h2>
      <div className="metric-row">
        <div>
          <span>Coming appointments</span>
          <strong>
            {appointments.filter((a) => a.status === "CONFIRMED").length}
          </strong>
        </div>
        <div>
          <span>Doctors available</span>
          <strong>{providers.length}</strong>
        </div>
        <div>
          <span>Next appointment</span>
          <strong>
            {next ? (
              <>
                <em>{doctor || "Doctor"}</em>
                {timeLabel(next.start_datetime)}
              </>
            ) : (
              "—"
            )}
          </strong>
        </div>
      </div>
      <h3 className="overview-subtitle">Coming appointments</h3>
      <div className="appointment-list overview-appointments">
        {appointments
          .filter((appointment) => appointment.status === "CONFIRMED")
          .map((appointment) => (
            <article key={appointment.id}>
              <div className="appointment-info">
                <strong>
                  {providers.find(
                    (provider) => provider.id === appointment.provider_id,
                  )?.name || "Doctor"}
                </strong>
                <span>{timeLabel(appointment.start_datetime)}</span>
                <small>{appointment.concern || "No concern provided"}</small>
              </div>
            </article>
          ))}
      </div>
    </section>
  );
}

function ProfilePage({ profile, setProfile, setMessage }: any) {
  async function save(event: FormEvent) {
    event.preventDefault();
    setProfile(
      await api<Profile>("/users/me/profile", {
        method: "PUT",
        body: JSON.stringify(profile),
      }),
    );
    setMessage("Profile saved.");
  }
  return (
    <section className="profile-panel page-panel">
      <p className="eyebrow">Personal information</p>
      <h2>Basic health details</h2>
      {profile && (
        <form className="profile-form" onSubmit={save}>
          <div className="profile-fields">
            <input
              placeholder="Gender"
              value={profile.gender || ""}
              onChange={(e) =>
                setProfile({ ...profile, gender: e.target.value })
              }
            />
            <input
              placeholder="Age"
              type="number"
              value={profile.age || ""}
              onChange={(e) =>
                setProfile({ ...profile, age: Number(e.target.value) })
              }
            />
            <input
              placeholder="Weight (kg)"
              type="number"
              value={profile.weight_kg || ""}
              onChange={(e) =>
                setProfile({ ...profile, weight_kg: Number(e.target.value) })
              }
            />
          </div>
          <textarea
            placeholder="Basic medical notes"
            value={profile.medical_notes || ""}
            onChange={(e) =>
              setProfile({ ...profile, medical_notes: e.target.value })
            }
          />
          <button className="secondary" type="submit">
            Save profile
          </button>
        </form>
      )}
    </section>
  );
}

function AppointmentsPage({
  providers,
  appointments,
  setAppointments,
  setMessage,
  setConfirmation,
  setPaymentRequest,
}: any) {
  const [doctor, setDoctor] = useState<Provider | null>(null);
  const [date, setDate] = useState("2026-09-28");
  const [concern, setConcern] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  async function selectDoctor(provider: Provider) {
    setDoctor(provider);
    setSlots(
      (
        await api<{ slots: Slot[] }>(
          `/providers/${provider.id}/availability?target_date=${date}`,
        )
      ).slots,
    );
  }
  function book(slot: Slot) {
    if (!concern.trim() || !doctor) {
      setMessage("Enter a concern before booking.");
      return;
    }
    setPaymentRequest({
      provider: doctor,
      slot,
      concern,
      action: async () => {
        await api("/appointments", {
          method: "POST",
          body: JSON.stringify({
            provider_id: doctor.id,
            start_datetime: slot.start_datetime,
            end_datetime: slot.end_datetime,
            concern,
          }),
        });
        setAppointments(await api<Appointment[]>("/appointments"));
        setMessage("Payment successful. Appointment confirmed.");
      },
    });
  }
  return (
    <section className="appointments-page page-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Doctors and times</p>
          <h2>Create or manage appointments</h2>
        </div>
        <input
          className="date-input"
          type="date"
          value={date}
          onChange={async (e) => {
            setDate(e.target.value);
            if (doctor)
              setSlots(
                (
                  await api<{ slots: Slot[] }>(
                    `/providers/${doctor.id}/availability?target_date=${e.target.value}`,
                  )
                ).slots,
              );
          }}
        />
      </div>
      <label className="concern-field">
        Concern for the doctor
        <textarea
          value={concern}
          onChange={(e) => setConcern(e.target.value)}
          placeholder="Briefly describe your concern"
        />
      </label>
      <div className="provider-grid">
        {providers.map((provider: Provider) => (
          <button
            className="provider-card"
            key={provider.id}
            onClick={() => selectDoctor(provider)}
          >
            <span className="provider-icon">{provider.name[0]}</span>
            <span>
              <strong>{provider.name}</strong>
              <small>{provider.specialization || "Doctor"}</small>
            </span>
            <b>→</b>
          </button>
        ))}
      </div>
      {doctor && (
        <div className="slots">
          <p>Available with {doctor.name}</p>
          <div className="slot-grid">
            {slots.map((slot) => (
              <button key={slot.start_datetime} onClick={() => book(slot)}>
                {timeLabel(slot.start_datetime)}
                <small>30 min</small>
              </button>
            ))}
          </div>
        </div>
      )}
      <h2 className="section-title">Your appointments</h2>
      <AppointmentColumns
        appointments={appointments}
        render={(appointment: Appointment) => (
          <article key={appointment.id}>
            <div className="appointment-info">
              <strong>{providers.find((p: Provider) => p.id === appointment.provider_id)?.name || "Doctor"}</strong>
              <span>{timeLabel(appointment.start_datetime)} · {appointment.status.toLowerCase()}</span>
              <small>{appointment.concern || "No concern provided"}</small>
            </div>
          </article>
        )}
      />
    </section>
  );
}

function RoleView({ user, appointments, providers, logout, cancel }: any) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark">
          A<span>/</span>S
        </div>
        <div className="side-title">
          {user.role === "ADMIN" ? "System view," : "Your practice,"}
          <br />
          <strong>in focus.</strong>
        </div>
        <nav>
          <a className="active">Overview</a>
          <a>Appointments</a>
        </nav>
        <div className="side-foot">
          <div className="avatar">{user.name[0]}</div>
          <div>
            <strong>{user.name}</strong>
            <small>{user.role.toLowerCase()}</small>
          </div>
          <button onClick={logout}>↗</button>
        </div>
      </aside>
      <main className="dashboard">
        <header>
          <div>
            <p className="eyebrow">
              {user.role === "ADMIN"
                ? "Operations console"
                : "Provider workspace"}
            </p>
            <h1>
              {user.role === "ADMIN"
                ? "System at a glance."
                : `Good morning, ${user.name}.`}
            </h1>
          </div>
        </header>
        <section className="appointments-panel page-panel">
          <h2>Appointments</h2>
          <div className="appointment-list">
            {appointments.map((appointment: Appointment) => (
              <article key={appointment.id}>
                <div className="appointment-info">
                  <strong>Appointment #{appointment.id}</strong>
                  <span>
                    {timeLabel(appointment.start_datetime)} ·{" "}
                    {appointment.status.toLowerCase()}
                  </span>
                  <small>{appointment.concern || "No concern provided"}</small>
                </div>
                {appointment.status === "CONFIRMED" && (
                  <button onClick={() => cancel(appointment)}>×</button>
                )}
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function RoleView2({
  user,
  appointments,
  providers,
  logout,
  cancel,
  confirmation,
  setConfirmation,
  message,
}: any) {
  const [patientProfiles, setPatientProfiles] = useState<
    Record<number, Profile>
  >({});
  useEffect(() => {
    Promise.all(
      appointments.map(async (appointment: Appointment) => {
        try {
          return [
            appointment.id,
            await api<Profile>(
              `/appointments/${appointment.id}/customer-profile`,
            ),
          ] as const;
        } catch {
          return null;
        }
      }),
    ).then((items) =>
      setPatientProfiles(
        Object.fromEntries(items.filter(Boolean) as [number, Profile][]),
      ),
    );
  }, [appointments]);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark">
          A<span>/</span>S
        </div>
        <div className="side-title">
          {user.role === "ADMIN" ? "System view," : "Your practice,"}
          <br />
          <strong>in focus.</strong>
        </div>
        <nav>
          <a className="active" href="#role-overview">
            Overview
          </a>
          <a href="#role-appointments">Appointments</a>
        </nav>
        <div className="side-foot">
          <div className="avatar">{user.name[0]}</div>
          <div>
            <strong>{user.name}</strong>
            <small>{user.role.toLowerCase()}</small>
          </div>
          <button onClick={logout}>↗</button>
        </div>
      </aside>
      <main className="dashboard" id="role-overview">
        <header>
          <div>
            <p className="eyebrow">
              {user.role === "ADMIN"
                ? "Operations console"
                : "Provider workspace"}
            </p>
            <h1>
              {user.role === "ADMIN"
                ? "System at a glance."
                : `Good morning, ${user.name}.`}
            </h1>
          </div>
        </header>
        {message && <div className="notice inline">{message}</div>}
        <section
          className="appointments-panel page-panel"
          id="role-appointments"
        >
          <h2>Appointments</h2>
          <div className="appointment-list">
            {appointments.map((appointment: Appointment) => {
              const patient = patientProfiles[appointment.id];
              return (
                <article key={appointment.id}>
                  <div className="appointment-info">
                    <strong>
                      {patient?.name || "Patient details loading..."}
                    </strong>
                    <span>
                      {timeLabel(appointment.start_datetime)} ·{" "}
                      {appointment.status.toLowerCase()}
                    </span>
                    <small>
                      Concern: {appointment.concern || "Not provided"}
                    </small>
                    {patient && (
                      <div className="patient-details">
                        <span>Age: {patient.age ?? "Not provided"}</span>
                        <span>Gender: {patient.gender || "Not provided"}</span>
                        <span>
                          Weight:{" "}
                          {patient.weight_kg
                            ? `${patient.weight_kg} kg`
                            : "Not provided"}
                        </span>
                        <span>Notes: {patient.medical_notes || "None"}</span>
                      </div>
                    )}
                  </div>
                  {appointment.status === "CONFIRMED" && (
                    <button
                      className="cancel-action"
                      onClick={() => cancel(appointment)}
                      title="Cancel appointment"
                    >
                      Cancel
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        </section>
        {confirmation && (
          <ConfirmModal
            item={confirmation}
            close={() => setConfirmation(null)}
            confirm={async () => {
              await confirmation.action();
              setConfirmation(null);
            }}
          />
        )}
      </main>
    </div>
  );
}

function RoleView4({
  user,
  appointments,
  providers,
  logout,
  cancel,
  confirmation,
  setConfirmation,
  message,
}: any) {
  const [patientProfiles, setPatientProfiles] = useState<
    Record<number, Profile>
  >({});
  const isAdmin = user.role === "ADMIN";
  const [page, setPage] = useState(() =>
    user.role === "ADMIN" && window.location.hash === "#role-payments"
      ? "payments"
      : "appointments",
  );
  useEffect(() => {
    Promise.all(
      appointments.map(async (appointment: Appointment) => {
        try {
          return [
            appointment.id,
            await api<Profile>(
              `/appointments/${appointment.id}/customer-profile`,
            ),
          ] as const;
        } catch {
          return null;
        }
      }),
    ).then((items) =>
      setPatientProfiles(
        Object.fromEntries(items.filter(Boolean) as [number, Profile][]),
      ),
    );
  }, [appointments]);
  function navigate(nextPage: string) {
    if (nextPage === "payments" && !isAdmin) {
      setPage("appointments");
      window.location.hash = "role-appointments";
      return;
    }
    setPage(nextPage);
    window.location.hash = `role-${nextPage}`;
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark">
          A<span>/</span>S
        </div>
        <div className="side-title">
          {user.role === "ADMIN" ? "System view," : "Your practice,"}
          <br />
          <strong>in focus.</strong>
        </div>
        <nav>
          <a
            className={page === "appointments" ? "active" : ""}
            onClick={() => navigate("appointments")}
          >
            Appointments
          </a>
          {isAdmin && (
            <a
              className={page === "payments" ? "active" : ""}
              onClick={() => navigate("payments")}
            >
              Payments
            </a>
          )}
        </nav>
        <div className="side-foot">
          <div className="avatar">{user.name[0]}</div>
          <div>
            <strong>{user.name}</strong>
            <small>{user.role.toLowerCase()}</small>
          </div>
          <button onClick={logout}>↗</button>
        </div>
      </aside>
      <main className="dashboard">
        <header>
          <div>
            <p className="eyebrow">
              {user.role === "ADMIN"
                ? "Operations console"
                : "Provider workspace"}
            </p>
            <h1>
              {page === "payments" ? "Payment details." : "Appointments."}
            </h1>
          </div>
        </header>
        {message && <div className="notice inline">{message}</div>}
        {page === "appointments" && (
          <section className="appointments-panel page-panel">
            <h2>Appointments</h2>
            <AppointmentColumns
              appointments={appointments}
              render={(appointment: Appointment) => {
                const patient = patientProfiles[appointment.id];
                const provider = providers.find(
                  (item: Provider) => item.id === appointment.provider_id,
                );
                return <article key={appointment.id}><div className="appointment-info"><strong>{patient?.name || "Patient details loading..."}</strong><span>Doctor: {provider?.name || "Doctor"} · {timeLabel(appointment.start_datetime)} · {appointment.status.toLowerCase()}</span><small>Concern: {appointment.concern || "Not provided"}</small>{patient && <div className="patient-details"><span>Age: {patient.age ?? "Not provided"}</span><span>Gender: {patient.gender || "Not provided"}</span><span>Weight: {patient.weight_kg ? `${patient.weight_kg} kg` : "Not provided"}</span><span>Notes: {patient.medical_notes || "None"}</span></div>}</div>{appointment.status === "CONFIRMED" && <button className="cancel-action" onClick={() => cancel(appointment)}>Cancel</button>}</article>;
              }}
            />
          </section>
        )}
        {isAdmin && page === "payments" && (
          <PaymentPage appointments={appointments} providers={providers} />
        )}
        {confirmation && (
          <ConfirmModal
            item={confirmation}
            close={() => setConfirmation(null)}
            confirm={async () => {
              await confirmation.action();
              setConfirmation(null);
            }}
          />
        )}
      </main>
    </div>
  );
}

export default App;
