/* Musicala Admin Hub
   - Login con Google (Firebase Auth)
   - Hub administrativo + panel de jornadas, puntualidad y estadísticas
   - Registro de jornada interno con lector QR + Firestore + marcación remota
   - Panel admin: estadísticas, horarios por miembro, excepciones y corrección de registros

   Estructura general:
   1. Config y constantes
   2. Utilidades (fechas Bogota, formato, DOM, toasts)
   3. Modelo de datos (roles, member settings, overrides, calculo de puntualidad)
   4. Service Worker / PWA / install
   5. Navegacion tipo panel (tabs)
   6. Vistas: Inicio, Marcar jornada, Registros, Estadísticas, Configuración, Equipo
   7. Modales: detalle de registro, edicion/corrección, excepciones, horario
   8. Auth + mount
*/

const BUILD = "2026-07-05.1";
const EMAIL_NOTIFICATION_ENDPOINT = "https://script.google.com/macros/s/AKfycbzcDr4JLUUTZkdvNsNzod3NnqCXDMr449g99cT2et7P-EOzK-lnFZ-9p5y8R5O8Zd6e/exec";

const firebaseConfig = {
  apiKey: "AIzaSyCsXw0N_GkdwYMkdfZ_H2XIBNeTpGFn_rg",
  authDomain: "musicala-admin-hub.firebaseapp.com",
  projectId: "musicala-admin-hub",
  storageBucket: "musicala-admin-hub.firebasestorage.app",
  messagingSenderId: "468927778540",
  appId: "1:468927778540:web:619daeb67ff0287d92dfc9"
};

/* Administradores: pueden ver estadísticas globales, configurar horarios y corregir registros. */
const ADMIN_EMAILS = [
  "alekcaballeromusic@gmail.com",
  "catalina.medina.leal@gmail.com"
];

const HUB = {
  name: "Musicala Admin Hub",
  subtitle: "Centro administrativo",
  GENERAL_LINKS: {
    nomina: "https://docs.google.com/forms/d/e/1FAIpQLSeMOhoY9d8JOf1Oq8DnD_aSEDkBmOXmzYJtlCCU-7CNVYjnLA/viewform",
    apertura: "https://musicala.github.io/protocolodeapertura/",
    reglamento: "https://drive.google.com/file/d/1Oda0c_FnHrsgME2GE8LCb7z5huH-YbBk/view"
  },
  USERS: {
    "alekcaballeromusic@gmail.com": {
      label: "Alek Caballero",
      links: { horario: "", documentos: "" }
    },
    "catalina.medina.leal@gmail.com": {
      label: "Catalina Medina",
      links: { horario: "", documentos: "" }
    },
    "angiecamilar4@gmail.com": {
      label: "Angie Camila Rodriguez",
      links: { horario: "", documentos: "" }
    },
    "licethrinconr@gmail.com": {
      label: "Liceth Rincon",
      links: {
        horario: "https://musicala.github.io/horario2026asistentecomercial/",
        documentos: "https://drive.google.com/drive/folders/1Xq_qn2gLNXQYuyVrxherSKvW7uNC8tnK?usp=sharing"
      }
    }
  },
  // Accesos rápidos (links externos) que se muestran en el Inicio.
  QUICK_LINKS: [
    { id: "nomina", icon: "💰", title: "Novedades nomina", subtitle: "General" },
    { id: "apertura", icon: "🔑", title: "Protocolo de apertura", subtitle: "General" },
    { id: "reglamento", icon: "📜", title: "Reglamento interno", subtitle: "General" },
    { id: "horario", icon: "🗓️", title: "Horario anual", subtitle: "Personal" },
    { id: "documentos", icon: "📁", title: "Documentos", subtitle: "Personal" }
  ]
};

const COLLECTIONS = {
  shiftRecords: "adminShiftRecords",
  memberSettings: "adminMemberSettings",
  scheduleOverrides: "adminScheduleOverrides"
};

const LEGACY_ANNUAL_SCHEDULE_SOURCES = {
  "licethrinconr@gmail.com": {
    year: 2026,
    url: "https://docs.google.com/spreadsheets/d/e/2PACX-1vR1CFXBvdEojaE0WJOyIZyJgjFhbidzASj4qzfFkNpFe76lJxFVRUEh5JbSDWKN4TWK_9zC97WD6SjV/pub?gid=0&single=true&output=tsv"
  }
};

const SHIFT = {
  timezone: "America/Bogota",
  role: "administrativo"
};

const REMOTE_WORK_ALLOWED_USERS = [
  "angiecamilar4@gmail.com",
  "Angie Camila Rodriguez"
];

const USER_RESOURCE_LINKS = {
  "angiecamilar4@gmail.com": {
    horario: "https://musicala.github.io/horario2026camilarodriguez/",
    documentos: "https://drive.google.com/drive/folders/1xkWt1c7A6fi9a7KPyXCNcbxMiH5QVIIC?usp=drive_link"
  },
  "angie camila rodriguez": {
    horario: "https://musicala.github.io/horario2026camilarodriguez/",
    documentos: "https://drive.google.com/drive/folders/1xkWt1c7A6fi9a7KPyXCNcbxMiH5QVIIC?usp=drive_link"
  }
};

/* Días de la semana (clave Firestore + etiqueta). Orden lun -> dom. */
const WEEK_DAYS = [
  { key: "monday", label: "Lunes", short: "Lun" },
  { key: "tuesday", label: "Martes", short: "Mar" },
  { key: "wednesday", label: "Miércoles", short: "Mié" },
  { key: "thursday", label: "Jueves", short: "Jue" },
  { key: "friday", label: "Viernes", short: "Vie" },
  { key: "saturday", label: "Sábado", short: "Sáb" },
  { key: "sunday", label: "Domingo", short: "Dom" }
];
// getUTCDay(): 0=domingo .. 6=sábado
const WEEKDAY_INDEX_TO_KEY = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

// Meta de horas efectivas semanales (Lun–Sáb) usada para avisar si una semana
// cumple la jornada legal. Configurable por miembro. 44h = jornada legal 2025.
const DEFAULT_WEEKLY_TARGET_HOURS = 44;

const DEFAULT_DAY = {
  enabled: false,
  start: "08:50",
  end: "16:00",
  modality: "sede",
  graceMinutes: 5,
  notes: ""
};

function defaultWeeklySchedule() {
  const out = {};
  for (const d of WEEK_DAYS) {
    const workday = d.key !== "saturday" && d.key !== "sunday";
    out[d.key] = { ...DEFAULT_DAY, enabled: workday };
  }
  return out;
}

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  signOut,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  arrayUnion,
  getFirestore,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

let AUTH = null;
let DB = null;
let ACTIVE_USER = null;
let ACTIVE_EMAIL = "";
let ACTIVE_PROFILE = null;
let ACTIVE_LINKS = {};
let toastTimer = null;
let __deferredInstallPrompt = null;
let qrReader = null;
let currentCameraId = "";
let submitLock = false;
let loginLock = false;
let lastQrSaveOkAt = 0;

let CURRENT_TAB = "inicio";
let MEMBER_SETTINGS = {};     // email -> settings doc (normalizado)
let SCHEDULE_OVERRIDES = {};  // `${email}__${date}` -> override doc
let DATA_LOADED = false;

/* ==========================================================================
   2. Utilidades
========================================================================== */
function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function toast(msg, opts = {}) {
  const el = ($("#toast-app") && !$("#toast-app").hidden) ? $("#toast-app") : ($("#toast") || $("#toast-app"));
  if (!el) return;
  const { actionText = "", onAction = null, sticky = false, ms = 2800, kind = "" } = opts;
  el.classList.remove("show");
  el.dataset.kind = kind || "";
  el.hidden = false;
  el.innerHTML = `<span class="toastMsg">${escapeHtml(msg)}</span>`;
  if (actionText) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "toastBtn";
    btn.textContent = actionText;
    btn.addEventListener("click", () => {
      try { onAction?.(); } finally { el.classList.remove("show"); }
    });
    el.appendChild(btn);
  }
  requestAnimationFrame(() => el.classList.add("show"));
  clearTimeout(toastTimer);
  if (!sticky) {
    toastTimer = setTimeout(() => {
      el.classList.remove("show");
      if (el.id === "toast-app") el.hidden = true;
    }, Math.max(1200, Number(ms) || 2800));
  }
}

function show(which) {
  const login = $("#view-login");
  const app = $("#view-app");
  if (!login || !app) return;
  login.hidden = which !== "login";
  app.hidden = which !== "app";
  if (which === "login" && $("#toast-app")) $("#toast-app").hidden = true;
}

function emailKey(user) {
  return String(user?.email || "").toLowerCase().trim();
}

function normalizeIdentity(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9@._+\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeEmailId(email) {
  return String(email || "").toLowerCase().replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "");
}

function prettyName(user, fallbackEmail = "") {
  return user?.displayName || fallbackEmail || "Sesión activa";
}

function getUserResourceLinks(email, profile) {
  const candidates = [
    email,
    normalizeIdentity(email),
    normalizeIdentity(profile?.label),
    normalizeIdentity(prettyName(ACTIVE_USER, email))
  ].filter(Boolean);
  for (const key of candidates) {
    const links = USER_RESOURCE_LINKS[key] || USER_RESOURCE_LINKS[normalizeIdentity(key)];
    if (links) return links;
  }
  return {};
}

function buildLinksForUser(email) {
  const base = { ...(HUB.GENERAL_LINKS || {}) };
  const profile = HUB.USERS?.[email] || null;
  return { ...base, ...(profile?.links || {}), ...getUserResourceLinks(email, profile) };
}

function getProfileName(email = ACTIVE_EMAIL) {
  if (email === ACTIVE_EMAIL) return ACTIVE_PROFILE?.label || prettyName(ACTIVE_USER, ACTIVE_EMAIL);
  return MEMBER_SETTINGS[email]?.name || HUB.USERS?.[email]?.label || email;
}

function isCurrentUserAdmin() {
  return ADMIN_EMAILS.map(normalizeIdentity).includes(normalizeIdentity(ACTIVE_EMAIL));
}

function isAdminEmail(email) {
  return ADMIN_EMAILS.map(normalizeIdentity).includes(normalizeIdentity(email));
}

function canCurrentUserMarkRemote() {
  if (MEMBER_SETTINGS[ACTIVE_EMAIL]?.canWorkRemote) return true;
  const current = [ACTIVE_EMAIL, getProfileName(), ACTIVE_USER?.displayName].map(normalizeIdentity).filter(Boolean);
  return REMOTE_WORK_ALLOWED_USERS.map(normalizeIdentity).some((allowed) => current.includes(allowed));
}

function remoteNotAllowedMessage() {
  return "La marcación desde casa no está habilitada para tu usuario. Por favor marca tu ingreso en la sede con el código QR.";
}

/* ---- Fechas / zona horaria America/Bogota ---- */
function getBogotaParts(date = new Date()) {
  const dateFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHIFT.timezone, year: "numeric", month: "2-digit", day: "2-digit"
  });
  const timeFmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: SHIFT.timezone, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
  });
  return { date: dateFmt.format(date), time: timeFmt.format(date).slice(0, 5) };
}

function todayBogota() {
  return getBogotaParts().date;
}

function parseLocalDateInput(dateStr) {
  const match = String(dateStr || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function formatLocalDateInput(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dateRangeList(startStr, endStr) {
  const start = parseLocalDateInput(startStr);
  const end = parseLocalDateInput(endStr || startStr);
  if (!start || !end || end < start) return [];
  const dates = [];
  const cursor = new Date(start);
  while (cursor <= end && dates.length < 370) {
    dates.push(formatLocalDateInput(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function weekdayKeyForDate(dateStr) {
  // dateStr: YYYY-MM-DD. Independiente de la zona del dispositivo.
  const idx = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  return WEEKDAY_INDEX_TO_KEY[idx];
}

function formatLongDate(dateStr) {
  try {
    return new Intl.DateTimeFormat("es-CO", {
      timeZone: "UTC", weekday: "long", day: "numeric", month: "long"
    }).format(new Date(`${dateStr}T00:00:00Z`));
  } catch (_) { return dateStr; }
}

function formatDateTime(iso) {
  if (!iso) return "-";
  try {
    return new Intl.DateTimeFormat("es-CO", {
      timeZone: SHIFT.timezone, dateStyle: "medium", timeStyle: "short"
    }).format(new Date(iso));
  } catch (_) { return iso; }
}

function toMinutes(hhmm) {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function minutesToHhmm(min) {
  if (min == null || isNaN(min)) return "-";
  const sign = min < 0 ? "-" : "";
  const abs = Math.abs(Math.round(min));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}h ${String(m).padStart(2, "0")}m`;
}

function hhmmTo12h(hhmm) {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return hhmm || "";
  let [h, m] = hhmm.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
}

function addDaysStr(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function datesInRange(from, to) {
  const out = [];
  let cur = from;
  let guard = 0;
  while (cur <= to && guard < 800) { out.push(cur); cur = addDaysStr(cur, 1); guard++; }
  return out;
}

function formatShiftMode(mode, source) {
  if (mode === "presencial" && source === "qr") return "Presencial QR";
  if (mode === "remoto" && source === "manual_remote") return "Remoto manual";
  if (mode === "presencial") return "Presencial";
  if (mode === "remoto") return "Remoto";
  return "-";
}

function sourceLabel(source) {
  if (source === "qr") return "QR";
  if (source === "manual_remote") return "Remoto";
  if (source === "manual_admin") return "Manual admin";
  return source || "-";
}

/* ==========================================================================
   3. Modelo de datos: roles, horarios, excepciones y puntualidad
========================================================================== */

/* Carga member settings y overrides. Los miembros normales solo leen lo suyo;
   los admins cargan todo el equipo. */
async function loadAdminData({ force = false } = {}) {
  if (DATA_LOADED && !force) return;
  MEMBER_SETTINGS = {};
  SCHEDULE_OVERRIDES = {};
  try {
    if (isCurrentUserAdmin()) {
      const ms = await getDocs(collection(DB, COLLECTIONS.memberSettings));
      ms.forEach((d) => { const data = normalizeSettings(d.data()); if (data.email) MEMBER_SETTINGS[data.email] = data; });
      const ov = await getDocs(collection(DB, COLLECTIONS.scheduleOverrides));
      ov.forEach((d) => { const data = normalizeOverride(d.id, d.data()); if (data.email && data.date) SCHEDULE_OVERRIDES[`${data.email}__${data.date}`] = data; });
    } else if (ACTIVE_EMAIL) {
      const sref = doc(DB, COLLECTIONS.memberSettings, safeEmailId(ACTIVE_EMAIL));
      const ssnap = await getDoc(sref);
      if (ssnap.exists()) MEMBER_SETTINGS[ACTIVE_EMAIL] = normalizeSettings(ssnap.data());
      const oq = query(collection(DB, COLLECTIONS.scheduleOverrides), where("email", "==", ACTIVE_EMAIL));
      const osnap = await getDocs(oq);
      osnap.forEach((d) => { const data = normalizeOverride(d.id, d.data()); if (data.email && data.date) SCHEDULE_OVERRIDES[`${data.email}__${data.date}`] = data; });
    }
  } catch (error) {
    console.warn("No se pudieron cargar configuraciones de horario", error);
  }
  // Sembrar defaults en memoria para miembros del whitelist sin settings (no se escriben en Firestore).
  for (const email of Object.keys(HUB.USERS || {})) {
    if (!MEMBER_SETTINGS[email]) MEMBER_SETTINGS[email] = defaultSettingsFor(email, { seeded: true });
  }
  DATA_LOADED = true;
}

function normalizeOverride(id, data) {
  const enabled = data?.enabled === false ? false : true;
  return {
    id,
    email: String(data?.email || "").toLowerCase().trim(),
    date: data?.date || "",
    enabled,
    start: data?.start || DEFAULT_DAY.start,
    end: data?.end || DEFAULT_DAY.end,
    modality: data?.modality || "sede",
    graceMinutes: Number.isFinite(data?.graceMinutes) ? data.graceMinutes : 5,
    reason: data?.reason || "",
    createdBy: data?.createdBy || "",
    createdAtClient: data?.createdAtClient || null
  };
}

function defaultSettingsFor(email, extra = {}) {
  return {
    email,
    name: HUB.USERS?.[email]?.label || email,
    role: isAdminEmail(email) ? "admin" : "member",
    active: true,
    canWorkRemote: REMOTE_WORK_ALLOWED_USERS.map(normalizeIdentity).includes(normalizeIdentity(email)),
    defaultGraceMinutes: 5,
    weeklyTargetHours: DEFAULT_WEEKLY_TARGET_HOURS,
    weeklySchedule: defaultWeeklySchedule(),
    ...extra
  };
}

function normalizeSettings(data) {
  const weekly = {};
  const src = data?.weeklySchedule || {};
  for (const d of WEEK_DAYS) {
    const day = src[d.key] || {};
    weekly[d.key] = {
      enabled: Boolean(day.enabled),
      start: day.start || DEFAULT_DAY.start,
      end: day.end || DEFAULT_DAY.end,
      modality: day.modality || "sede",
      graceMinutes: Number.isFinite(day.graceMinutes) ? day.graceMinutes : (data?.defaultGraceMinutes ?? 5),
      notes: day.notes || ""
    };
  }
  return {
    email: String(data?.email || "").toLowerCase().trim(),
    name: data?.name || "",
    role: data?.role === "admin" ? "admin" : "member",
    active: data?.active !== false,
    canWorkRemote: Boolean(data?.canWorkRemote),
    defaultGraceMinutes: Number.isFinite(data?.defaultGraceMinutes) ? data.defaultGraceMinutes : 5,
    weeklyTargetHours: Number.isFinite(data?.weeklyTargetHours) && data.weeklyTargetHours > 0 ? data.weeklyTargetHours : DEFAULT_WEEKLY_TARGET_HOURS,
    weeklyTargets: normalizeWeeklyTargets(data?.weeklyTargets),
    weekTargetOverrides: normalizeWeekTargetOverrides(data?.weekTargetOverrides),
    weeklySchedule: weekly,
    updatedAtClient: data?.updatedAtClient || null,
    updatedBy: data?.updatedBy || ""
  };
}

/* Metas de horas semanales fechadas: [{ from: "YYYY-MM-DD", hours }].
   La entrada sin fecha (o la más antigua) aplica desde el inicio; cada cambio
   aplica desde su fecha en adelante. Permite p.ej. 44h y luego 42h desde una fecha. */
function normalizeWeeklyTargets(raw) {
  if (!Array.isArray(raw)) return [];
  const out = raw
    .map((e) => ({
      from: typeof e?.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.from) ? e.from : "",
      hours: Number(e?.hours) > 0 ? Number(e.hours) : null
    }))
    .filter((e) => e.hours != null);
  out.sort((a, b) => (a.from || "0000-00-00").localeCompare(b.from || "0000-00-00"));
  return out;
}

/* Metas manuales por semana concreta: { "YYYY-MM-DD"(lunes): horas }. Tienen
   prioridad absoluta sobre la meta fechada y sobre el descuento automático de
   festivos. Se usan cuando una semana con festivo se redistribuye a la mano. */
function normalizeWeekTargetOverrides(raw) {
  const out = {};
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(k) && Number(v) > 0) out[k] = Number(v);
    }
  }
  return out;
}

function weekTargetOverrideMinutes(email, monday) {
  const v = MEMBER_SETTINGS[email]?.weekTargetOverrides?.[monday];
  return Number(v) > 0 ? Math.round(Number(v) * 60) : null;
}

/* Meta de minutos semanales vigente para una fecha dada (se pasa el lunes de la semana). */
function weeklyTargetMinutesForDate(email, date) {
  const s = MEMBER_SETTINGS[email];
  const list = s?.weeklyTargets;
  let hours;
  if (Array.isArray(list) && list.length) {
    let pick = list[0];
    for (const e of list) { if (!e.from || e.from <= date) pick = e; else break; }
    hours = pick.hours;
  } else {
    hours = s?.weeklyTargetHours ?? DEFAULT_WEEKLY_TARGET_HOURS;
  }
  return Math.round((Number(hours) || 0) * 60);
}

function getActiveMemberSettings() {
  return MEMBER_SETTINGS[ACTIVE_EMAIL] || defaultSettingsFor(ACTIVE_EMAIL, { seeded: true });
}

function getScheduleOverride(email, date) {
  return SCHEDULE_OVERRIDES[`${email}__${date}`] || null;
}

/* Prioridad: excepción por fecha -> horario semanal -> sin horario (null). */
function getExpectedScheduleForDate(email, date) {
  const override = getScheduleOverride(email, date);
  if (override) {
    if (override.enabled === false) return null; // día libre por excepción
    return {
      source: "override",
      start: override.start, end: override.end,
      modality: override.modality || "sede",
      graceMinutes: Number.isFinite(override.graceMinutes) ? override.graceMinutes : 5,
      reason: override.reason || ""
    };
  }
  const settings = MEMBER_SETTINGS[email];
  if (!settings || settings.active === false) return null;
  const day = settings.weeklySchedule?.[weekdayKeyForDate(date)];
  if (!day || !day.enabled) return null;
  return {
    source: "weekly",
    start: day.start, end: day.end,
    modality: day.modality || "sede",
    graceMinutes: Number.isFinite(day.graceMinutes) ? day.graceMinutes : (settings.defaultGraceMinutes ?? 5),
    notes: day.notes || ""
  };
}

/* Calcula el estado del registro a partir del registro + horario esperado.
   Funcion centralizada: el estado nunca se guarda solo como texto visual. */
function calculateShiftStatus(record, schedule) {
  const ingreso = record?.ingresoTime || null;
  const salida = record?.salidaTime || null;
  const hasIngreso = Boolean(ingreso);
  const hasSalida = Boolean(salida);

  const out = {
    status: "sin-registro",
    label: "Sin registro",
    lateMinutes: 0,
    earlyLeaveMinutes: 0,
    workedMinutes: null,
    expectedMinutes: null,
    isLate: false,
    isOnTime: false,
    isIncomplete: false,
    leftEarly: false,
    isExtra: false,
    isAbsent: false,
    edited: Boolean(record?.manualCorrection),
    voided: Boolean(record?.voided),
    flags: []
  };

  if (out.voided) { out.status = "anulado"; out.label = "Anulado"; return out; }

  if (hasIngreso && hasSalida) {
    const wi = toMinutes(ingreso), ws = toMinutes(salida);
    if (wi != null && ws != null) out.workedMinutes = effectiveDurationMinutes(Math.max(0, ws - wi));
  }

  // Sin horario configurado para ese día
  if (!schedule) {
    if (hasIngreso) { out.status = "extra"; out.label = "Fuera de horario"; out.isExtra = true; }
    else { out.status = "sin-horario"; out.label = "Sin horario"; }
    if (!hasSalida && hasIngreso) { out.isIncomplete = true; out.flags.push("incompleto"); }
    return finalizeStatus(out, record);
  }

  const startMin = toMinutes(schedule.start);
  const endMin = toMinutes(schedule.end);
  const grace = Number.isFinite(schedule.graceMinutes) ? schedule.graceMinutes : 5;
  if (startMin != null && endMin != null) out.expectedMinutes = effectiveDurationMinutes(Math.max(0, endMin - startMin));

  if (!hasIngreso) {
    out.status = "ausente"; out.label = "Ausente"; out.isAbsent = true;
    return finalizeStatus(out, record);
  }

  const ingMin = toMinutes(ingreso);
  if (ingMin != null && startMin != null) {
    out.lateMinutes = Math.max(0, ingMin - startMin);
    out.isLate = (ingMin - startMin) > grace;
    out.isOnTime = !out.isLate;
  }
  out.status = out.isLate ? "tarde" : "puntual";
  out.label = out.isLate ? "Tarde" : "Puntual";

  if (!hasSalida) { out.isIncomplete = true; out.flags.push("incompleto"); }
  if (hasSalida && endMin != null) {
    const salMin = toMinutes(salida);
    if (salMin != null) {
      out.earlyLeaveMinutes = Math.max(0, endMin - salMin);
      if (out.earlyLeaveMinutes > grace) { out.leftEarly = true; out.flags.push("salida-temprana"); }
    }
  }
  return finalizeStatus(out, record);
}

function finalizeStatus(out, record) {
  if (record?.statusOverride) {
    if (record.statusOverride === "puntual") {
      out.status = "puntual";
      out.label = "Puntual (ajuste admin)";
      out.isLate = false;
      out.isOnTime = true;
      out.lateMinutes = 0;
      out.flags.push("ajuste-puntual");
    } else {
      out.status = "justificado";
      out.label = record.statusOverride === "justificado" ? "Justificado" : record.statusOverride;
      out.justified = true;
    }
  }
  if (out.edited) out.flags.push("editado");
  return out;
}

/* Agrega estadísticas para un rango de fechas. */
function calculateStats(records, range) {
  const { from, to, memberFilter = "all", modalityFilter = "all", statusFilter = "all" } = range;
  const days = datesInRange(from, to);
  const members = statsMemberList().filter((m) => memberFilter === "all" || m.email === memberFilter);

  // Index registros por email+fecha
  const byKey = {};
  for (const r of records) {
    if (r.date < from || r.date > to) continue;
    byKey[`${r.email}__${r.date}`] = r;
  }

  const global = {
    expectedDays: 0, registeredDays: 0, completeDays: 0, incompleteDays: 0,
    onTime: 0, late: 0, absent: 0, extra: 0, leftEarly: 0, justified: 0,
    totalLateMinutes: 0, totalEarlyLeaveMinutes: 0, totalWorkedMinutes: 0, totalExpectedMinutes: 0,
    totalDeficitMinutes: 0, totalExtraMinutes: 0, arrivalMinutesSum: 0, arrivalCount: 0
  };
  const perMember = {};
  const perDay = {};
  const lateDetails = [];
  const missingDetails = [];
  const perMonth = {};
  const monthCell = (date, m) => {
    const key = date.slice(0, 7);
    if (!perMonth[key]) perMonth[key] = {};
    if (!perMonth[key][m.email]) perMonth[key][m.email] = { month: key, email: m.email, name: m.name, worked: 0, expected: 0 };
    return perMonth[key][m.email];
  };

  for (const m of members) {
    perMember[m.email] = {
      email: m.email, name: m.name, expected: 0, registered: 0, onTime: 0, late: 0,
      absent: 0, incomplete: 0, lateMinutes: 0, earlyLeaveMinutes: 0, expectedMinutes: 0,
      workedMinutes: 0, deficitMinutes: 0, extraMinutes: 0, arrivalSum: 0, arrivalCount: 0, justified: 0
    };
  }

  for (const date of days) {
    perDay[date] = { date, expected: 0, onTime: 0, late: 0, absent: 0, incomplete: 0, registered: 0,
      expectedMinutes: 0, workedMinutes: 0, lateMinutes: 0, earlyLeaveMinutes: 0, deficitMinutes: 0, extraMinutes: 0 };
    for (const m of members) {
      const schedule = getExpectedScheduleForDate(m.email, date);
      const rec = byKey[`${m.email}__${date}`];
      const calc = calculateShiftStatus(rec || {}, schedule);

      // Filtros por modalidad / estado se aplican a registros existentes
      if (rec) {
        if (modalityFilter !== "all") {
          const mod = (rec.modalidad || "").toLowerCase();
          const isRemote = mod === "remoto" || rec.ingresoMode === "remoto";
          if (modalityFilter === "sede" && isRemote) continue;
          if (modalityFilter === "remoto" && !isRemote) continue;
        }
        if (statusFilter !== "all" && calc.status !== statusFilter && !calc.flags.includes(statusFilter)) {
          // permite filtrar por flags (editado, incompleto)
          if (!(statusFilter === "editado" && calc.edited)) continue;
        }
      } else if (statusFilter !== "all" && statusFilter !== "ausente") {
        continue;
      }

      const pm = perMember[m.email];
      if (schedule) {
        global.expectedDays++; pm.expected++; perDay[date].expected++;
        const expectedMinutes = calc.expectedMinutes || 0;
        global.totalExpectedMinutes += expectedMinutes;
        pm.expectedMinutes += expectedMinutes;
        perDay[date].expectedMinutes += expectedMinutes;
        monthCell(date, m).expected++;
      }
      if (rec && rec.ingresoTime) {
        global.registeredDays++; pm.registered++; perDay[date].registered++;
        monthCell(date, m).worked++;
        const ingMin = toMinutes(rec.ingresoTime);
        if (ingMin != null) { global.arrivalMinutesSum += ingMin; global.arrivalCount++; pm.arrivalSum += ingMin; pm.arrivalCount++; }
        if (calc.workedMinutes != null) {
          global.totalWorkedMinutes += calc.workedMinutes; pm.workedMinutes += calc.workedMinutes; perDay[date].workedMinutes += calc.workedMinutes;
          const balance = calc.workedMinutes - (calc.expectedMinutes || 0);
          if (balance < 0) {
            global.totalDeficitMinutes += Math.abs(balance); pm.deficitMinutes += Math.abs(balance); perDay[date].deficitMinutes += Math.abs(balance);
          } else {
            global.totalExtraMinutes += balance; pm.extraMinutes += balance; perDay[date].extraMinutes += balance;
          }
        }
        if (calc.isIncomplete) { global.incompleteDays++; pm.incomplete++; perDay[date].incomplete++; }
        else global.completeDays++;
        if (calc.justified) { global.justified++; pm.justified++; }
        else if (calc.isLate) {
          global.late++; pm.late++; perDay[date].late++;
          global.totalLateMinutes += calc.lateMinutes; pm.lateMinutes += calc.lateMinutes;
          perDay[date].lateMinutes += calc.lateMinutes;
          lateDetails.push({
            id: rec.id, date, email: m.email, name: m.name,
            expectedStart: schedule?.start || "-",
            arrival: rec.ingresoTime,
            lateMinutes: calc.lateMinutes
          });
        } else if (calc.isOnTime) { global.onTime++; pm.onTime++; perDay[date].onTime++; }
        if (calc.leftEarly) {
          global.leftEarly++;
          global.totalEarlyLeaveMinutes += calc.earlyLeaveMinutes;
          pm.earlyLeaveMinutes += calc.earlyLeaveMinutes;
          perDay[date].earlyLeaveMinutes += calc.earlyLeaveMinutes;
        }
        if (calc.isExtra) global.extra++;
      } else if (schedule) {
        global.absent++; pm.absent++; perDay[date].absent++;
        const missed = calc.expectedMinutes || 0;
        global.totalDeficitMinutes += missed; pm.deficitMinutes += missed; perDay[date].deficitMinutes += missed;
        missingDetails.push({
          date, email: m.email, name: m.name,
          expectedStart: schedule.start, expectedEnd: schedule.end,
          modality: schedule.modality || "sede"
        });
      }
    }
  }

  const evaluated = global.onTime + global.late;
  global.punctualityPct = evaluated ? Math.round((global.onTime / evaluated) * 100) : 0;
  global.avgLateMinutes = global.late ? Math.round(global.totalLateMinutes / global.late) : 0;
  global.avgArrival = global.arrivalCount ? minutesToHhmmClock(Math.round(global.arrivalMinutesSum / global.arrivalCount)) : "-";
  global.attendancePct = global.expectedDays ? Math.round((global.registeredDays / global.expectedDays) * 100) : 0;
  global.compliancePct = global.totalExpectedMinutes ? Math.round((global.totalWorkedMinutes / global.totalExpectedMinutes) * 100) : 0;
  global.netBalanceMinutes = global.totalWorkedMinutes - global.totalExpectedMinutes;
  global.totalImpactMinutes = global.totalLateMinutes + global.totalEarlyLeaveMinutes;

  const memberRows = Object.values(perMember).map((pm) => {
    const ev = pm.onTime + pm.late;
    return {
      ...pm,
      punctualityPct: ev ? Math.round((pm.onTime / ev) * 100) : 0,
      avgArrival: pm.arrivalCount ? minutesToHhmmClock(Math.round(pm.arrivalSum / pm.arrivalCount)) : "-",
      avgArrivalMin: pm.arrivalCount ? Math.round(pm.arrivalSum / pm.arrivalCount) : null,
      compliancePct: pm.expectedMinutes ? Math.round((pm.workedMinutes / pm.expectedMinutes) * 100) : 0,
      netBalanceMinutes: pm.workedMinutes - pm.expectedMinutes
    };
  });

  for (const day of Object.values(perDay)) {
    day.compliancePct = day.expectedMinutes ? Math.round((day.workedMinutes / day.expectedMinutes) * 100) : 0;
    day.netBalanceMinutes = day.workedMinutes - day.expectedMinutes;
    day.impactMinutes = day.lateMinutes + day.earlyLeaveMinutes;
  }

  lateDetails.sort((a, b) => (a.date === b.date ? b.lateMinutes - a.lateMinutes : (a.date < b.date ? 1 : -1)));

  const monthRows = Object.keys(perMonth).sort().flatMap((key) =>
    Object.values(perMonth[key])
      .filter((c) => c.worked || c.expected)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => ({ ...c, attendancePct: c.expected ? Math.round((c.worked / c.expected) * 100) : null }))
  );

  missingDetails.sort((a, b) => a.date < b.date ? 1 : -1);
  return { global, memberRows, dayRows: Object.values(perDay), days, lateDetails, missingDetails, monthRows };
}

function minutesToHhmmClock(min) {
  if (min == null || isNaN(min)) return "-";
  const h = Math.floor(min / 60), m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function signedMinutesToHhmm(min) {
  const value = Number(min) || 0;
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${minutesToHhmm(Math.abs(value))}`;
}

function adminMemberList() {
  const emails = new Set([...Object.keys(HUB.USERS || {}), ...Object.keys(MEMBER_SETTINGS)]);
  return Array.from(emails).map((email) => {
    const s = MEMBER_SETTINGS[email] || defaultSettingsFor(email, { seeded: true });
    return { email, name: s.name || HUB.USERS?.[email]?.label || email, settings: s, active: s.active !== false };
  }).filter((m) => m.active).sort((a, b) => a.name.localeCompare(b.name));
}

function statsMemberList() {
  return adminMemberList().filter((m) => !isAdminEmail(m.email));
}

/* ==========================================================================
   4. PWA / Service worker / install
========================================================================== */
function isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent || ""); }
function isStandalone() { return Boolean(window.navigator.standalone) || window.matchMedia?.("(display-mode: standalone)").matches; }
function setInstallUI(visible) {
  ["btn-install", "btn-install-2"].forEach((id) => { const btn = document.getElementById(id); if (btn) btn.hidden = !visible; });
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const promptUpdate = (reg) => { if (!reg?.waiting) return; reg.waiting.postMessage({ type: "SKIP_WAITING" }); };
  try {
    const swUrl = `./sw.js?v=${encodeURIComponent(BUILD)}`;
    const reg = await navigator.serviceWorker.register(swUrl, { scope: "./", updateViaCache: "none" });
    const requestUpdate = () => reg.update?.().catch(() => null);
    promptUpdate(reg);
    reg.addEventListener("updatefound", () => {
      const sw = reg.installing;
      sw?.addEventListener("statechange", () => {
        if (sw.state === "installed" && navigator.serviceWorker.controller) promptUpdate(reg);
      });
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") requestUpdate();
    });
    window.addEventListener("focus", requestUpdate);
    setInterval(requestUpdate, 60 * 1000);
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "SW_ACTIVATED") console.log("SW_ACTIVATED", event.data.version);
    });
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (window.__reloadingForSW) return;
      window.__reloadingForSW = true;
      window.location.reload();
    });
    requestUpdate();
  } catch (error) {
    console.warn("No se pudo preparar la app para uso sin conexión", error);
  }
}

async function clearLocalAppCacheAndReload() {
  try {
    toast("Actualizando app y limpiando cache...", { sticky: true });
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.allSettled(regs.map((reg) => reg.unregister()));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.allSettled(keys.map((key) => caches.delete(key)));
    }
    const url = new URL(window.location.href);
    url.searchParams.set("v", BUILD);
    url.searchParams.set("fresh", Date.now().toString());
    window.location.replace(url.toString());
  } catch (error) {
    console.error(error);
    window.location.reload();
  }
}

function setupInstallPrompt() {
  if (isStandalone()) { setInstallUI(false); return; }
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    __deferredInstallPrompt = event;
    setInstallUI(true);
  });
  window.addEventListener("appinstalled", () => {
    __deferredInstallPrompt = null;
    setInstallUI(false);
    toast("App instalada");
  });
  const onInstallClick = async () => {
    if (isIOS() && !__deferredInstallPrompt) { toast("En iPhone/iPad: Compartir > Agregar a pantalla de inicio"); return; }
    if (!__deferredInstallPrompt) { toast("Instalación no disponible todavía"); return; }
    __deferredInstallPrompt.prompt();
    await __deferredInstallPrompt.userChoice.catch(() => null);
    __deferredInstallPrompt = null;
  };
  $("#btn-install")?.addEventListener("click", onInstallClick);
  $("#btn-install-2")?.addEventListener("click", onInstallClick);
}

/* ==========================================================================
   5. Navegacion tipo panel
========================================================================== */
const TABS = [
  { id: "inicio", label: "Inicio", admin: false },
  { id: "jornada", label: "Marcar", admin: false, memberOnly: true },
  { id: "calendario", label: "Horario anual", admin: false },
  { id: "registros", label: "Registros", admin: false },
  { id: "stats", label: "Estadísticas", admin: true },
  { id: "config", label: "Configuración", admin: true },
  { id: "equipo", label: "Equipo", admin: true }
];

function renderNav() {
  const nav = $("#panel-nav");
  if (!nav) return;
  const admin = isCurrentUserAdmin();
  nav.innerHTML = TABS.filter((t) => (!t.admin || admin) && !(t.memberOnly && admin)).map((t) => `
    <button class="navItem${t.id === CURRENT_TAB ? " active" : ""}" type="button" data-tab="${t.id}">
      <span class="navLbl">${escapeHtml(t.label)}</span>
    </button>
  `).join("");
  if (!nav.__bound) {
    nav.__bound = true;
    nav.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-tab]");
      if (btn) goTab(btn.dataset.tab);
    });
  }
}

async function goTab(tab) {
  const def = TABS.find((t) => t.id === tab);
  if (def?.admin && !isCurrentUserAdmin()) { toast("No tienes permisos para esta sección.", { kind: "warn" }); return; }
  if (def?.memberOnly && isCurrentUserAdmin()) { tab = "inicio"; }
  CURRENT_TAB = tab;
  renderNav();
  await stopQrScanner();
  const host = $("#panel-content");
  if (host) host.scrollTop = 0;
  switch (tab) {
    case "inicio": return renderDashboard();
    case "jornada": return renderShiftTab();
    case "calendario": return renderAnnualCalendarTab();
    case "registros": return renderRecordsTab();
    case "stats": return renderAdminStats();
    case "config": return renderConfigTab();
    case "equipo": return renderTeamTab();
    default: return renderDashboard();
  }
}

function panel() { return $("#panel-content"); }
function setPanel(html) { const p = panel(); if (p) p.innerHTML = html; }

/* ==========================================================================
   6a. Vista: Inicio / Dashboard
========================================================================== */
async function renderDashboard() {
  const admin = isCurrentUserAdmin();
  setPanel(`<div class="loadingBlock">Cargando inicio…</div>`);
  await loadAdminData().catch(() => {});
  const date = todayBogota();
  let records = [];
  try { records = await getShiftRecords({ mineOnly: !admin, max: admin ? 200 : 30 }); } catch (_) {}

  if (admin) return renderAdminDashboard(records, date);
  return renderMemberDashboard(records, date);
}

function statusBadge(calc) {
  const map = {
    "puntual": ["ok", "Puntual"], "tarde": ["late", "Tarde"], "ausente": ["absent", "Ausente"],
    "incompleto": ["warn", "Incompleto"], "justificado": ["info", "Justificado"],
    "extra": ["info", "Fuera de horario"], "sin-horario": ["muted", "Sin horario"],
    "sin-registro": ["muted", "Pendiente"], "anulado": ["muted", "Anulado"]
  };
  let key = calc.status;
  if (calc.isIncomplete && (calc.status === "puntual" || calc.status === "tarde")) {
    // mostrar ambos
  }
  const [cls, lbl] = map[key] || ["muted", calc.label || key];
  const extra = [];
  if (calc.isIncomplete && key !== "incompleto") extra.push(`<span class="badgeChip warn">Incompleto</span>`);
  if (calc.leftEarly) extra.push(`<span class="badgeChip warn">Salida temprana</span>`);
  if (calc.edited) extra.push(`<span class="badgeChip info">Editado</span>`);
  return `<span class="badgeChip ${cls}">${escapeHtml(lbl)}</span>${extra.join("")}`;
}

function renderMemberDashboard(records, date) {
  const todayRec = records.find((r) => r.date === date);
  const schedule = getExpectedScheduleForDate(ACTIVE_EMAIL, date);
  const calc = calculateShiftStatus(todayRec || {}, schedule);
  const recent = records.filter((r) => r.date !== date).slice(0, 5);

  setPanel(`
    <section class="dashHead">
      <div>
        <p class="dashEyebrow">${escapeHtml(formatLongDate(date))}</p>
        <h2 class="dashTitle">Hola, ${escapeHtml(getProfileName().split(" ")[0])} 👋</h2>
        <p class="dashSub">Este es tu estado de jornada de hoy.</p>
      </div>
    </section>

    <section class="todayCard">
      <div class="todayState">
        <div class="todayStateTop">
          <span class="todayLabel">Mi jornada de hoy</span>
          ${statusBadge(calc)}
        </div>
        <div class="todayTimes">
          <div class="timeBox"><span>Ingreso</span><strong>${escapeHtml(todayRec?.ingresoTime || "—")}</strong></div>
          <div class="timeArrow">→</div>
          <div class="timeBox"><span>Salida</span><strong>${escapeHtml(todayRec?.salidaTime || "—")}</strong></div>
        </div>
        <div class="todayMeta">
          ${schedule
            ? `<span>Hora esperada de ingreso: <strong>${escapeHtml(schedule.start)}</strong> · ${escapeHtml(schedule.modality)}${schedule.source === "override" ? " · excepción" : ""}</span>`
            : `<span>Hoy no tienes un horario configurado.</span>`}
        </div>
        <div class="todayActions">
          <button class="btnPrimary" type="button" data-go="jornada">Marcar jornada</button>
          <button class="btnGhost" type="button" data-go="registros">Ver mis registros</button>
        </div>
      </div>
    </section>

    <section class="dashSection">
      <h3 class="sectionH">Ultimos registros</h3>
      ${recent.length ? `<div class="miniList">${recent.map((r) => {
        const c = calculateShiftStatus(r, getExpectedScheduleForDate(ACTIVE_EMAIL, r.date));
        return `<div class="miniRow"><span class="miniDate">${escapeHtml(r.date)}</span><span>${escapeHtml(r.ingresoTime || "—")} – ${escapeHtml(r.salidaTime || "—")}</span>${statusBadge(c)}</div>`;
      }).join("")}</div>` : `<div class="emptyState">Aún no tienes registros recientes.</div>`}
    </section>

    ${renderQuickLinksSection()}
  `);
  wireGoButtons();
}

function renderAdminDashboard(records, date) {
  const members = statsMemberList();
  const todayRecs = records.filter((r) => r.date === date);
  const byEmail = {}; todayRecs.forEach((r) => { byEmail[r.email] = r; });

  let marcaron = 0, faltan = 0, tarde = 0, incompletos = 0, puntuales = 0, esperados = 0;
  const pendientes = [], tardios = [];
  for (const m of members) {
    const schedule = getExpectedScheduleForDate(m.email, date);
    const rec = byEmail[m.email];
    const calc = calculateShiftStatus(rec || {}, schedule);
    if (schedule) esperados++;
    if (rec?.ingresoTime) {
      marcaron++;
      if (calc.isIncomplete) incompletos++;
      if (calc.isLate) { tarde++; tardios.push({ name: m.name, time: rec.ingresoTime, late: calc.lateMinutes }); }
      else if (calc.isOnTime) puntuales++;
    } else if (schedule) { faltan++; pendientes.push(m.name); }
  }
  const ev = puntuales + tarde;
  const pPct = ev ? Math.round((puntuales / ev) * 100) : 0;

  setPanel(`
    <section class="dashHead">
      <div>
        <p class="dashEyebrow">${escapeHtml(formatLongDate(date))}</p>
        <h2 class="dashTitle">Panel del equipo</h2>
        <p class="dashSub">Resumen de jornadas de hoy en tiempo real.</p>
      </div>
      <button class="btnGhost btnSmall" type="button" data-go="stats">Ver estadísticas →</button>
    </section>

    <section class="kpiGrid">
      ${kpiCard("Ya marcaron", marcaron, `de ${esperados} esperados`, "ok")}
      ${kpiCard("Faltan por marcar", faltan, "ingreso pendiente", faltan ? "warn" : "ok")}
      ${kpiCard("Llegadas tarde", tarde, "hoy", tarde ? "late" : "ok")}
      ${kpiCard("Puntualidad", pPct + "%", `${puntuales} puntuales`, pPct >= 80 ? "ok" : "warn")}
    </section>

    <div class="dashCols">
      <section class="dashSection card">
        <h3 class="sectionH">Falta por marcar (${pendientes.length})</h3>
        ${pendientes.length ? `<div class="chipWrap">${pendientes.map((n) => `<span class="badgeChip warn">${escapeHtml(n)}</span>`).join("")}</div>` : `<div class="emptyState">Todos los esperados ya marcaron. 🎉</div>`}
      </section>
      <section class="dashSection card">
        <h3 class="sectionH">Llegadas tarde (${tardios.length})</h3>
        ${tardios.length ? `<div class="miniList">${tardios.map((t) => `<div class="miniRow"><span>${escapeHtml(t.name)}</span><span>${escapeHtml(t.time)}</span><span class="badgeChip late">+${t.late} min</span></div>`).join("")}</div>` : `<div class="emptyState">Sin llegadas tarde hoy. 👌</div>`}
      </section>
    </div>

    <section class="dashSection">
      <h3 class="sectionH">Estado de hoy por miembro</h3>
      <div class="tableWrap">
        <table class="dataTable">
          <thead><tr><th>Miembro</th><th>Ingreso</th><th>Salida</th><th>Esperado</th><th>Estado</th></tr></thead>
          <tbody>
            ${members.map((m) => {
              const schedule = getExpectedScheduleForDate(m.email, date);
              const rec = byEmail[m.email];
              const calc = calculateShiftStatus(rec || {}, schedule);
              return `<tr>
                <td data-label="Miembro"><strong>${escapeHtml(m.name)}</strong></td>
                <td data-label="Ingreso">${escapeHtml(rec?.ingresoTime || "—")}</td>
                <td data-label="Salida">${escapeHtml(rec?.salidaTime || "—")}</td>
                <td data-label="Esperado">${schedule ? escapeHtml(schedule.start) : "—"}</td>
                <td data-label="Estado">${statusBadge(calc)}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    </section>

    <section class="quickRow">
      <button class="quickBtn" type="button" data-go="registros"><span>🗂️</span> Registros</button>
      <button class="quickBtn" type="button" data-go="config"><span>⚙️</span> Horarios</button>
      <button class="quickBtn" type="button" data-go="equipo"><span>👥</span> Equipo</button>
    </section>
  `);
  wireGoButtons();
}

function kpiCard(label, value, sub, tone = "") {
  return `<div class="kpiCard ${tone}">
    <div class="kpiValue">${escapeHtml(String(value))}</div>
    <div class="kpiLabel">${escapeHtml(label)}</div>
    <div class="kpiSub">${escapeHtml(sub || "")}</div>
  </div>`;
}

/* ==========================================================================
   6b. Vista: Horario anual
========================================================================== */
let CALENDAR_YEAR = Number(todayBogota().slice(0, 4)) || new Date().getFullYear();
let CALENDAR_MONTH = (Number(todayBogota().slice(5, 7)) - 1) || new Date().getMonth();
let CALENDAR_EMAIL = "";
const LEGACY_ANNUAL_CACHE = {};

function parseLegacyDmy(str) {
  const parts = String(str || "").trim().split("/");
  if (parts.length !== 3) return "";
  const [d, m, y] = parts.map(Number);
  if (!d || !m || !y) return "";
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseLegacyTime(str) {
  const raw = String(str || "").trim().toLowerCase();
  if (!raw || raw === "-") return "";
  const match = raw.match(/^(\d{1,2})(?::(\d{1,2}))?\s*(am|pm)?$/);
  if (!match) return "";
  let h = Number(match[1]);
  const m = Number(match[2] || 0);
  const meridiem = match[3] || "";
  if (meridiem === "pm" && h !== 12) h += 12;
  if (meridiem === "am" && h === 12) h = 0;
  if (h > 23 || m > 59) return "";
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function parseLegacyTsv(tsv) {
  const rows = String(tsv || "").replace(/\r/g, "").split("\n").map((line) => line.split("\t").map((v) => (v || "").trim()));
  const map = {};
  for (const r of rows) {
    const date = parseLegacyDmy(r[1]);
    if (!date) continue;
    const start = parseLegacyTime(r[2]);
    const end = parseLegacyTime(r[3]);
    const note = r[5] || r[4] || "";
    if (start && end) map[date] = { source: "legacy", start, end, modality: "sede", graceMinutes: 5, notes: note };
    else map[date] = { source: "legacy-free", label: note || "Sin jornada" };
  }
  return map;
}

async function loadLegacyAnnualSchedule(email, year) {
  const source = LEGACY_ANNUAL_SCHEDULE_SOURCES[email];
  if (!source || source.year !== year) return null;
  const key = `${email}__${year}`;
  if (LEGACY_ANNUAL_CACHE[key]) return LEGACY_ANNUAL_CACHE[key];
  try {
    const res = await fetch(`${source.url}&t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    LEGACY_ANNUAL_CACHE[key] = parseLegacyTsv(await res.text());
    return LEGACY_ANNUAL_CACHE[key];
  } catch (error) {
    console.warn("No se pudo cargar horario anual legado", error);
    LEGACY_ANNUAL_CACHE[key] = null;
    return null;
  }
}

function effectiveShiftMinutes(schedule) {
  if (!schedule) return 0;
  const start = toMinutes(schedule.start);
  const end = toMinutes(schedule.end);
  if (start == null || end == null || end <= start) return 0;
  return effectiveDurationMinutes(end - start);
}

function effectiveDurationMinutes(rawMinutes) {
  const raw = Math.max(0, Number(rawMinutes) || 0);
  return Math.max(0, raw - (raw > 360 ? 60 : 0));
}

function calendarMembers() {
  if (!isCurrentUserAdmin()) {
    const own = MEMBER_SETTINGS[ACTIVE_EMAIL] || defaultSettingsFor(ACTIVE_EMAIL, { seeded: true });
    return [{ email: ACTIVE_EMAIL, name: own.name || getProfileName(ACTIVE_EMAIL), settings: own, active: true }];
  }
  // Los admins solo consultan calendarios de las trabajadoras, no los propios
  return adminMemberList().filter((m) => !isAdminEmail(m.email));
}

function annualCalendarStats(email, year) {
  let workDays = 0;
  let freeDays = 0;
  let effectiveMinutes = 0;
  let lunchDays = 0;
  let overrideDays = 0;
  for (let month = 0; month < 12; month++) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const dayData = getCalendarDayForDate(email, date);
      const schedule = dayData.schedule;
      if (!schedule) { freeDays++; continue; }
      const raw = Math.max(0, (toMinutes(schedule.end) || 0) - (toMinutes(schedule.start) || 0));
      workDays++;
      effectiveMinutes += effectiveShiftMinutes(schedule);
      if (schedule.source === "override") overrideDays++;
      if (raw > 360) lunchDays++;
    }
  }
  // Semanas incompletas: recorre semanas Lun–Dom cuyo lunes cae en el año.
  // La meta se evalúa por semana, respetando cambios de jornada fechados.
  let incompleteWeeks = 0;
  let scheduledWeeks = 0;
  const jan1 = `${year}-01-01`;
  const jan1Dow = (parseLocalDateInput(jan1).getDay() + 6) % 7; // 0 = lunes
  let monday = addDaysStr(jan1, -jan1Dow);
  for (let guard = 0; guard < 60; guard++, monday = addDaysStr(monday, 7)) {
    if (monday.slice(0, 4) > String(year)) break;
    if (monday.slice(0, 4) !== String(year)) continue; // atribuir la semana al año de su lunes
    const fullTarget = weeklyTargetMinutesForDate(email, monday);
    if (fullTarget <= 0) continue;
    const wk = weekEffectiveStats(email, monday);
    if (wk.minutes <= 0) continue; // semana sin jornada trabajada: no se cuenta
    const override = weekTargetOverrideMinutes(email, monday);
    const adjTarget = override != null ? override : Math.max(0, fullTarget - wk.reduction); // manual > festivos
    scheduledWeeks++;
    if (wk.minutes < adjTarget) incompleteWeeks++;
  }
  // Meta vigente al cierre del año, solo para el texto del KPI.
  const targetMin = weeklyTargetMinutesForDate(email, `${year}-12-31`);
  return { workDays, freeDays, effectiveMinutes, lunchDays, overrideDays, incompleteWeeks, scheduledWeeks, targetMin };
}

/* Horas efectivas que el horario SEMANAL base asigna a un día (ignora excepciones
   y festivos). Sirve para saber cuánto se descuenta de la meta si ese día cae libre. */
function weeklyScheduleBaselineMinutes(email, date) {
  const settings = MEMBER_SETTINGS[email];
  if (!settings || settings.active === false) return 0;
  const day = settings.weeklySchedule?.[weekdayKeyForDate(date)];
  if (!day || !day.enabled) return 0;
  return effectiveShiftMinutes(day);
}

/* Horas efectivas de una semana real (Lun–Sáb) a partir del lunes que la inicia.
   Recorre las 6 fechas reales aunque caigan en otro mes: así una semana que
   pertenece a dos meses se calcula completa desde cualquiera de los dos.
   `reduction` = horas de días que normalmente se trabajan pero caen libres por
   festivo o excepción; se restan de la meta para no exigir horas que no aplican. */
function weekEffectiveStats(email, mondayDate) {
  let minutes = 0;
  let workedDays = 0;
  let reduction = 0;
  let restDays = 0;
  const months = new Set();
  for (let d = 0; d < 7; d++) {
    const date = addDaysStr(mondayDate, d);
    months.add(date.slice(0, 7));
    if (d === 6) continue; // domingo no cuenta para la jornada legal
    const schedule = getCalendarDayForDate(email, date).schedule;
    const eff = effectiveShiftMinutes(schedule);
    if (eff > 0) { minutes += eff; workedDays++; continue; }
    // Día libre: si normalmente se trabajaba (festivo/excepción), descuenta su meta.
    const baseline = weeklyScheduleBaselineMinutes(email, date);
    if (baseline > 0) { reduction += baseline; restDays++; }
  }
  return { minutes, workedDays, reduction, restDays, months: [...months] };
}

function renderWeekStatus(email, mondayDate, renderedMonthKey) {
  const fullTarget = weeklyTargetMinutesForDate(email, mondayDate);
  if (fullTarget <= 0) return "";
  const { minutes, months, reduction, restDays } = weekEffectiveStats(email, mondayDate);
  const override = weekTargetOverrideMinutes(email, mondayDate);
  if (minutes <= 0 && reduction <= 0 && override == null) return ""; // sin jornada ni festivos: sin barra
  const manual = override != null;
  const targetMin = manual ? override : Math.max(0, fullTarget - reduction); // manual > automático
  const diff = minutes - targetMin;
  const notes = [];
  if (manual) {
    notes.push(`<em class="weekStatusShared" title="Meta fijada a mano para esta semana. Clic para cambiarla.">meta manual</em>`);
  } else if (reduction > 0) {
    notes.push(`<em class="weekStatusShared" title="La meta baja por ${restDays} día(s) festivo o libre: no se exigen esas horas">meta ${minutesToHhmm(fullTarget)} − ${minutesToHhmm(reduction)} festivo/libre</em>`);
  }
  if (months.length > 1) {
    notes.push(`<em class="weekStatusShared" title="Esta semana pertenece a dos meses; las horas se cuentan completas">${months.map((m) => escapeHtml(MONTH_NAMES[Number(m.slice(5, 7)) - 1])).join(" · ")}</em>`);
  }
  let tone, label;
  if (diff >= 0) {
    tone = diff === 0 ? "ok" : "over";
    label = diff === 0 ? `Semana completa` : `Completa · +${minutesToHhmm(diff)}`;
  } else {
    tone = "warn";
    label = `Faltan ${minutesToHhmm(-diff)}`;
  }
  const admin = isCurrentUserAdmin();
  const tag = admin ? "button" : "div";
  const attrs = admin ? ` type="button" data-week-monday="${mondayDate}" title="Clic para fijar la meta manual de esta semana"` : "";
  return `<${tag} class="weekStatus ${tone}${manual ? " manual" : ""}${admin ? " editable" : ""}"${attrs}>
    <span class="weekStatusLabel">${label}</span>
    <span class="weekStatusHours">${minutesToHhmm(minutes)} / ${minutesToHhmm(targetMin)}</span>
    ${notes.join("")}
  </${tag}>`;
}

function renderCalendarMonth(email, year, month) {
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthFirstStr = `${monthKey}-01`;
  const rows = [];
  for (let w = 0; w < 6; w++) {
    const cells = [];
    let hasCurrentMonthDay = false;
    for (let c = 0; c < 7; c++) {
      const i = w * 7 + c;
      const day = i - offset + 1;
      if (day < 1 || day > daysInMonth) {
        cells.push(`<div class="annualDay muted" aria-hidden="true"></div>`);
        continue;
      }
      hasCurrentMonthDay = true;
      const date = `${monthKey}-${String(day).padStart(2, "0")}`;
      const dayData = getCalendarDayForDate(email, date);
      const schedule = dayData.schedule;
      if (!schedule) {
        cells.push(`<button class="annualDay free" type="button" data-date="${date}"><strong>${day}</strong><span>${escapeHtml(dayData.label || "Sin jornada")}</span></button>`);
        continue;
      }
      const raw = Math.max(0, (toMinutes(schedule.end) || 0) - (toMinutes(schedule.start) || 0));
      const isRemote = normalizeIdentity(schedule.modality) === "remoto";
      cells.push(`<button class="annualDay work${schedule.source === "override" ? " override" : ""}" type="button" data-date="${date}">
        <span class="annualDayHead"><strong>${day}</strong>${isRemote ? `<em class="remoteDayBadge" title="Esta jornada es remota">Remoto</em>` : ""}</span>
        <span class="annualDayHours"><span>${escapeHtml(hhmmTo12h(schedule.start))}</span><i aria-hidden="true">–</i><span>${escapeHtml(hhmmTo12h(schedule.end))}</span></span>
        ${raw > 360 ? `<small>Incluye almuerzo</small>` : ""}
      </button>`);
    }
    if (!hasCurrentMonthDay) continue; // fila totalmente fuera del mes: se omite
    const mondayDate = addDaysStr(monthFirstStr, w * 7 - offset);
    rows.push(`<div class="annualWeekRow">${cells.join("")}</div>${renderWeekStatus(email, mondayDate, monthKey)}`);
  }
  return `<section class="annualMonth card">
    <h3>${escapeHtml(MONTH_NAMES[month])}</h3>
    <div class="annualWeekdays">${WEEK_DAYS.map((d) => `<span>${escapeHtml(d.short)}</span>`).join("")}</div>
    <div class="annualGrid stacked">${rows.join("")}</div>
  </section>`;
}

function getCalendarDayForDate(email, date) {
  const override = getScheduleOverride(email, date);
  if (override) {
    if (override.enabled === false) return { schedule: null, label: override.reason || "Sin jornada" };
    return { schedule: getExpectedScheduleForDate(email, date), label: "" };
  }
  const legacy = LEGACY_ANNUAL_CACHE[`${email}__${date.slice(0, 4)}`]?.[date];
  if (legacy) {
    if (legacy.source === "legacy-free") return { schedule: null, label: legacy.label || "Sin jornada" };
    return { schedule: legacy, label: "" };
  }
  return { schedule: getExpectedScheduleForDate(email, date), label: "" };
}

async function renderAnnualCalendarTab() {
  setPanel(`<div class="loadingBlock">Cargando horario anual...</div>`);
  await loadAdminData({ force: isCurrentUserAdmin() }).catch(() => {});
  const members = calendarMembers();
  CALENDAR_EMAIL = CALENDAR_EMAIL && members.some((m) => m.email === CALENDAR_EMAIL) ? CALENDAR_EMAIL : (isCurrentUserAdmin() ? (members.find((m) => !isAdminEmail(m.email))?.email || members[0]?.email || ACTIVE_EMAIL) : ACTIVE_EMAIL);
  const activeMember = members.find((m) => m.email === CALENDAR_EMAIL) || members[0];
  if (!activeMember) { setPanel(`<div class="emptyState">No hay trabajadoras activas para mostrar.</div>`); return; }
  await loadLegacyAnnualSchedule(activeMember.email, CALENDAR_YEAR);
  const stats = annualCalendarStats(activeMember.email, CALENDAR_YEAR);
  setPanel(`
    <section class="dashHead">
      <div>
        <p class="dashEyebrow">Jornadas de trabajo</p>
        <h2 class="dashTitle">Horario anual de ${escapeHtml(activeMember.name)}</h2>
        <p class="dashSub">Horas efectivas (jornadas &gt;6h descuentan 1h de almuerzo). Cada semana Lun–Sáb indica si cumple la meta; los festivos y días libres reducen la meta de esa semana y las semanas en dos meses se cuentan completas.</p>
      </div>
      <div class="headActions">
        ${isCurrentUserAdmin() ? `<label class="field inlineField"><span class="fieldLabel">Trabajador</span><select id="cal-member" class="input">${members.map((m) => `<option value="${escapeHtml(m.email)}" ${m.email === activeMember.email ? "selected" : ""}>${escapeHtml(m.name)}${isAdminEmail(m.email) ? " (admin)" : ""}</option>`).join("")}</select></label>` : ""}
        <label class="field inlineField"><span class="fieldLabel">Año</span><input type="number" id="cal-year" class="input" min="2024" max="2035" value="${CALENDAR_YEAR}"></label>
      </div>
    </section>

    <section class="kpiGrid wide">
      ${kpiCard("Horas efectivas", minutesToHhmm(stats.effectiveMinutes), "almuerzo ya descontado", "info")}
      ${kpiCard("Días con jornada", stats.workDays, "en el año seleccionado", "ok")}
      ${kpiCard("Días sin jornada", stats.freeDays, "incluye descansos y festivos", "")}
      ${kpiCard("Semanas incompletas", stats.incompleteWeeks, `de ${stats.scheduledWeeks} con jornada · meta vigente ${minutesToHhmm(stats.targetMin)}/sem`, stats.incompleteWeeks ? "warn" : "ok")}
      ${kpiCard("Excepciones", stats.overrideDays, "cambios por fecha", stats.overrideDays ? "info" : "")}
    </section>

    <section class="annualLegend">
      <span class="legendChip work">Con jornada</span>
      <span class="legendChip remote">Remoto</span>
      <span class="legendChip free">Sin jornada</span>
      <span class="legendChip override">Excepción</span>
    </section>

    <section class="monthNav">
      <button class="monthNavBtn" id="cal-prev" type="button" aria-label="Mes anterior">&#8249;</button>
      <span class="monthNavLabel">${escapeHtml(MONTH_NAMES[CALENDAR_MONTH])} ${CALENDAR_YEAR}</span>
      <button class="monthNavBtn" id="cal-next" type="button" aria-label="Mes siguiente">&#8250;</button>
    </section>

    <section class="annualYearGrid single">
      ${renderCalendarMonth(activeMember.email, CALENDAR_YEAR, CALENDAR_MONTH)}
    </section>
  `);
  $("#cal-prev")?.addEventListener("click", () => {
    CALENDAR_MONTH -= 1;
    if (CALENDAR_MONTH < 0) { CALENDAR_MONTH = 11; CALENDAR_YEAR = Math.max(2024, CALENDAR_YEAR - 1); }
    renderAnnualCalendarTab();
  });
  $("#cal-next")?.addEventListener("click", () => {
    CALENDAR_MONTH += 1;
    if (CALENDAR_MONTH > 11) { CALENDAR_MONTH = 0; CALENDAR_YEAR = Math.min(2035, CALENDAR_YEAR + 1); }
    renderAnnualCalendarTab();
  });
  $("#cal-member")?.addEventListener("change", (e) => { CALENDAR_EMAIL = e.target.value; renderAnnualCalendarTab(); });
  $("#cal-year")?.addEventListener("change", (e) => {
    CALENDAR_YEAR = Math.max(2024, Math.min(2035, Number(e.target.value) || CALENDAR_YEAR));
    renderAnnualCalendarTab();
  });
  $$(".annualDay[data-date]", panel()).forEach((btn) => btn.addEventListener("click", () => openCalendarDayDetail(activeMember.email, btn.dataset.date)));
  $$(".weekStatus[data-week-monday]", panel()).forEach((btn) => btn.addEventListener("click", () => openWeekTargetModal(activeMember.email, btn.dataset.weekMonday)));
}

function openCalendarDayDetail(email, date) {
  const dayData = getCalendarDayForDate(email, date);
  const schedule = dayData.schedule;
  const name = getProfileName(email);
  if (!schedule) {
    openModal("Sin jornada", `${name} · ${date}`, "Horario anual", `<p class="modalNote">${escapeHtml(dayData.label || "Este día no tiene jornada configurada para este trabajador.")}</p>`);
    return;
  }
  const rawMinutes = Math.max(0, (toMinutes(schedule.end) || 0) - (toMinutes(schedule.start) || 0));
  openModal("Detalle de jornada", `${name} · ${date}`, "Horario anual", `
    <div class="detailGrid">
      ${detailItem("Ingreso", schedule.start)}
      ${detailItem("Salida", schedule.end)}
      ${detailItem("Horas efectivas", minutesToHhmm(effectiveShiftMinutes(schedule)))}
      ${detailItem("Modalidad", schedule.modality || "sede")}
      ${detailItem("Fuente", schedule.source === "override" ? "Excepción por fecha" : "Horario semanal")}
      ${detailItem("Almuerzo", rawMinutes > 360 ? "Descuenta 1h" : "No descuenta")}
    </div>
    ${(schedule.reason || schedule.notes) ? `<p class="noteBox">${escapeHtml(schedule.reason || schedule.notes)}</p>` : ""}
    ${isCurrentUserAdmin() ? `<div class="modalActions"><button class="btnPrimary" type="button" id="btn-edit-day-schedule">Editar este día</button></div>` : ""}
  `);
  $("#btn-edit-day-schedule")?.addEventListener("click", () => openOverrideModalV2(email, getScheduleOverride(email, date) || { date, ...schedule, enabled: true }));
}

function openWeekTargetModal(email, monday) {
  if (!isCurrentUserAdmin()) { toast("Sección solo para administradores.", { kind: "warn" }); return; }
  const sunday = addDaysStr(monday, 6);
  const name = getProfileName(email);
  const fullTarget = weeklyTargetMinutesForDate(email, monday);
  const { minutes, reduction } = weekEffectiveStats(email, monday);
  const autoTarget = Math.max(0, fullTarget - reduction);
  const current = weekTargetOverrideMinutes(email, monday);
  const currentHours = current != null ? String(current / 60) : "";
  openModal("Meta manual de la semana", name, `${monday} al ${sunday}`, `
    <p class="modalNote">Fija las horas exactas que debe cumplir esta semana. Úsalo cuando por un festivo la jornada se redistribuye (por ejemplo a 40h). Si lo dejas vacío, se usa la meta automática (${minutesToHhmm(autoTarget)}${reduction > 0 ? `, ya con ${minutesToHhmm(reduction)} de festivo/libre descontados` : ""}).</p>
    <div class="formGrid">
      <label class="field"><span class="fieldLabel">Horas de esta semana</span><input type="number" id="wt-hours" class="input" min="0" max="60" step="0.5" value="${escapeHtml(currentHours)}" placeholder="${autoTarget / 60}"></label>
    </div>
    <p class="modalNote">Horas ya programadas esta semana: <strong>${minutesToHhmm(minutes)}</strong>.</p>
    <div class="modalActions">
      ${current != null ? `<button class="btnGhost danger" type="button" id="wt-clear">Quitar meta manual</button>` : ""}
      <button class="btnGhost" type="button" id="wt-cancel">Cancelar</button>
      <button class="btnPrimary" type="button" id="wt-save">Guardar</button>
    </div>
  `);
  $("#wt-cancel").addEventListener("click", closeModal);
  $("#wt-clear")?.addEventListener("click", () => saveWeekTargetOverride(email, monday, null));
  $("#wt-save").addEventListener("click", () => {
    const raw = $("#wt-hours").value.trim();
    if (raw === "") { saveWeekTargetOverride(email, monday, null); return; }
    const h = Number(raw);
    if (!(h > 0)) { toast("Ingresa un número de horas válido o déjalo vacío para usar la meta automática.", { kind: "warn" }); return; }
    saveWeekTargetOverride(email, monday, h);
  });
}

async function saveWeekTargetOverride(email, monday, hours) {
  if (!isCurrentUserAdmin()) { toast("No tienes permisos.", { kind: "warn" }); return; }
  try {
    const ref = doc(DB, COLLECTIONS.memberSettings, safeEmailId(email));
    const current = MEMBER_SETTINGS[email] || defaultSettingsFor(email, { seeded: true });
    const map = { ...(current.weekTargetOverrides || {}) };
    if (hours == null) {
      delete map[monday];
      await updateDoc(ref, { [`weekTargetOverrides.${monday}`]: deleteField(), updatedAt: serverTimestamp(), updatedAtClient: Date.now(), updatedBy: ACTIVE_EMAIL });
    } else {
      map[monday] = hours;
      await setDoc(ref, { weekTargetOverrides: { [monday]: hours }, updatedAt: serverTimestamp(), updatedAtClient: Date.now(), updatedBy: ACTIVE_EMAIL }, { merge: true });
    }
    MEMBER_SETTINGS[email] = { ...current, weekTargetOverrides: map };
    toast(hours == null ? "Meta manual quitada" : "Meta manual guardada", { kind: "ok" });
    await closeModal();
    renderAnnualCalendarTab();
  } catch (error) {
    console.error(error);
    toast(error?.code === "permission-denied" ? "No tienes permisos para esta acción." : "No se pudo guardar la meta.", { kind: "warn" });
  }
}

function renderQuickLinksSection() {
  const items = HUB.QUICK_LINKS.filter((q) => q.id === "horario" || String(ACTIVE_LINKS[q.id] || "").trim());
  if (!items.length) return "";
  return `
    <section class="dashSection">
      <h3 class="sectionH">Accesos rápidos</h3>
      <div class="linkGrid">
        ${items.map((q) => `
          <button class="linkTile" type="button" data-link="${escapeHtml(q.id)}">
            <span class="linkIco">${escapeHtml(q.icon)}</span>
            <span class="linkText"><strong>${escapeHtml(q.title)}</strong><small>${escapeHtml(q.subtitle)}</small></span>
          </button>`).join("")}
      </div>
    </section>`;
}

function wireGoButtons() {
  $$("[data-go]", panel()).forEach((b) => b.addEventListener("click", () => goTab(b.dataset.go)));
  $$("[data-link]", panel()).forEach((b) => b.addEventListener("click", () => openExternalLink(b.dataset.link)));
}

function openExternalLink(id) {
  if (id === "horario") { goTab("calendario"); return; }
  const url = String(ACTIVE_LINKS[id] || "").trim();
  if (!url) { toast("Este acceso aún no tiene link configurado."); return; }
  const safeUrl = /^(https?:)?\/\//i.test(url) ? url : `https://${url}`;
  window.open(safeUrl, "_blank", "noopener,noreferrer");
}

/* ==========================================================================
   6b. Vista: Marcar jornada (QR + remoto) — conserva la lógica original
========================================================================== */
async function renderShiftTab() {
  await loadAdminData().catch(() => {});
  const remoteAllowed = canCurrentUserMarkRemote();
  setPanel(`
    <section class="dashHead">
      <div>
        <p class="dashEyebrow">Operacion diaria</p>
        <h2 class="dashTitle">Marcar jornada</h2>
        <p class="dashSub">${remoteAllowed ? "Escanea el QR en sede o marca manualmente si trabajas remoto." : "Para tu usuario la jornada se marca en sede con QR."}</p>
      </div>
    </section>
    <section class="shiftTool card">
      <div class="shiftPerson">
        <div class="shiftAvatar">${escapeHtml((getProfileName() || "A").slice(0, 1).toUpperCase())}</div>
        <div>
          <div class="shiftName">${escapeHtml(getProfileName())}</div>
          <div class="shiftMail">${escapeHtml(ACTIVE_EMAIL)}</div>
        </div>
      </div>
      <div class="shiftModeGrid${remoteAllowed ? "" : " single"}">
        <button id="btnOnSiteMode" class="shiftModeCard" type="button">
          <span class="modeKicker">Jornada presencial</span>
          <strong>Estoy en sede · Escanear QR</strong>
          <small>Escanear QR de ingreso o salida</small>
        </button>
        <button id="btnRemoteMode" class="shiftModeCard remote${remoteAllowed ? "" : " locked"}" type="button" aria-disabled="${remoteAllowed ? "false" : "true"}">
          <span class="modeKicker">Jornada remota</span>
          <strong>Estoy trabajando remoto</strong>
          <small>${remoteAllowed ? "Marcar inicio o cierre manualmente" : "Disponible solo para usuarios autorizados"}</small>
        </button>
      </div>
      <div id="shift-mode-view"></div>
      <div id="today-summary" class="summaryBox"></div>
    </section>
  `);
  wireShiftModeControls();
  renderTodaySummary();
}

function wireShiftModeControls() {
  $("#btnOnSiteMode")?.addEventListener("click", renderOnSiteShiftView);
  $("#btnRemoteMode")?.addEventListener("click", async () => {
    if (!canCurrentUserMarkRemote()) { toast(remoteNotAllowedMessage(), { ms: 4200, kind: "warn" }); renderOnSiteShiftView(); return; }
    await stopQrScanner();
    renderRemoteShiftView();
  });
}

function insecureContextMsg() {
  return !window.isSecureContext ? "La cámara necesita HTTPS o localhost. En GitHub Pages funciona con HTTPS." : "";
}

function renderOnSiteShiftView() {
  const host = $("#shift-mode-view");
  if (!host) return;
  host.innerHTML = `
    <section class="shiftModePanel">
      <div class="modePanelHead">
        <div>
          <div class="panelTitle">Estoy en sede</div>
          <p class="modePanelText">Escanea el QR fisico de ingreso o salida para registrar tu jornada presencial.</p>
        </div>
      </div>
      <div class="qrControls">
        <label class="field"><span class="fieldLabel">Cámara</span><select id="cameraSelect" class="input"></select></label>
        <button id="btnPerms" class="btnGhost" type="button">Permitir/Actualizar</button>
        <button id="btnFlip" class="btnGhost" type="button">Voltear</button>
      </div>
      <div class="qrActions">
        <button id="btnStart" class="btnPrimary" type="button">Iniciar cámara</button>
        <button id="btnStop" class="btnGhost" type="button" disabled>Detener</button>
      </div>
      <div id="reader" class="reader"></div>
      <div class="resultPanel">
        <div class="panelTitle">Último resultado</div>
        <div id="shift-result" class="result">Apunta la cámara al código QR de la sede.</div>
      </div>
    </section>
  `;
  wireShiftControls();
  populateCameras().catch(() => { $("#shift-result").textContent = insecureContextMsg() || "Error listando camaras."; });
}

function renderRemoteShiftView() {
  if (!canCurrentUserMarkRemote()) { toast(remoteNotAllowedMessage(), { ms: 4200, kind: "warn" }); renderOnSiteShiftView(); return; }
  const parts = getBogotaParts(new Date());
  const host = $("#shift-mode-view");
  if (!host) return;
  host.innerHTML = `
    <section class="shiftModePanel remotePanel">
      <div class="remoteInfoGrid">
        <div><span>Nombre</span><strong>${escapeHtml(getProfileName())}</strong></div>
        <div><span>Correo</span><strong>${escapeHtml(ACTIVE_EMAIL)}</strong></div>
        <div><span>Fecha Bogota</span><strong>${escapeHtml(parts.date)}</strong></div>
        <div><span>Hora Bogota</span><strong id="remote-current-time">${escapeHtml(parts.time)}</strong></div>
      </div>
      <div class="remoteActions">
        <button id="btnRemoteIngreso" class="btnPrimary" type="button">Marcar ingreso remoto</button>
        <button id="btnRemoteSalida" class="btnGhost" type="button">Marcar salida remota</button>
      </div>
      <p class="remoteResponsibility">Este registro se guarda bajo responsabilidad del trabajador.</p>
      <div id="remote-result" class="result">Listo para marcar jornada remota.</div>
    </section>
  `;
  $("#btnRemoteIngreso")?.addEventListener("click", () => markRemoteShift("ingreso"));
  $("#btnRemoteSalida")?.addEventListener("click", () => markRemoteShift("salida"));
}

function friendlySaveError(error) {
  if (error?.message === "cancelled") return "No se reemplazo el registro existente.";
  if (error?.message === "remote_not_allowed") return remoteNotAllowedMessage();
  if (error?.code === "permission-denied") return `No se pudo guardar por permisos de Firestore. Sesión actual: ${ACTIVE_EMAIL || "sin correo"}. Si el problema sigue, avisa este correo al admin.`;
  if (error?.code === "unavailable" || error?.code === "deadline-exceeded") return "No se pudo guardar por conexión inestable. Intenta de nuevo cuando el celular tenga buena señal.";
  return "No se pudo guardar tu marcación. Revisa tu conexión e intenta de nuevo.";
}

async function markRemoteShift(type) {
  if (submitLock) return;
  if (!canCurrentUserMarkRemote()) { toast(remoteNotAllowedMessage(), { ms: 4200, kind: "warn" }); return; }
  const actionText = type === "ingreso" ? "iniciando" : "cerrando";
  if (!confirm(`Confirmas que estas ${actionText} tu jornada remota en este momento?`)) return;
  submitLock = true;
  const result = $("#remote-result");
  try {
    const now = new Date();
    const parts = getBogotaParts(now);
    if (result) result.textContent = "Guardando tu marcación...";
    await saveShiftRecord({ type, raw: "REMOTE_MANUAL", mode: "remoto", source: "manual_remote", date: parts.date, time: parts.time, stamp: now.toISOString() });
    if (result) result.textContent = `${type === "ingreso" ? "Ingreso" : "Salida"} remoto registrado: ${parts.date} ${parts.time}`;
    toast("Jornada remota registrada", { kind: "ok" });
    renderRemoteShiftView();
    await renderTodaySummary();
  } catch (error) {
    if (error?.message !== "cancelled") console.error(error);
    if (result) result.textContent = friendlySaveError(error);
  } finally { submitLock = false; }
}

async function listVideoInputs() {
  if (window.Html5Qrcode?.getCameras) {
    const cams = await window.Html5Qrcode.getCameras();
    return cams.map((cam) => ({ id: cam.id || cam.deviceId, label: cam.label || "Cámara" }));
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === "videoinput").map((d) => ({ id: d.deviceId, label: d.label || "Cámara" }));
}
function pickBestCameraId(devices) {
  const rear = devices.find((d) => /back|trasera|rear|environment/i.test(d.label || ""));
  return (rear || devices[0] || {}).id || "";
}
async function populateCameras() {
  const select = $("#cameraSelect");
  const result = $("#shift-result");
  if (!select) return;
  const devices = await listVideoInputs();
  select.innerHTML = "";
  if (!devices.length) { if (result) result.textContent = insecureContextMsg() || "No se detectaron camaras. Revisa permisos."; return; }
  for (const [index, device] of devices.entries()) {
    const opt = document.createElement("option");
    opt.value = device.id; opt.textContent = device.label || `Cámara ${index + 1}`;
    select.appendChild(opt);
  }
  currentCameraId = currentCameraId && devices.some((d) => d.id === currentCameraId) ? currentCameraId : pickBestCameraId(devices);
  select.value = currentCameraId;
}
async function requestPermissionsAndRefresh() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    stream.getTracks().forEach((track) => track.stop());
  } catch (_) {
    const result = $("#shift-result");
    if (result) result.textContent = insecureContextMsg() || "Concede permiso a la cámara en el navegador.";
  } finally { await populateCameras(); }
}
function wireShiftControls() {
  $("#cameraSelect")?.addEventListener("change", (event) => { currentCameraId = event.target.value; });
  $("#btnPerms")?.addEventListener("click", requestPermissionsAndRefresh);
  $("#btnStart")?.addEventListener("click", startQrScanner);
  $("#btnStop")?.addEventListener("click", stopQrScanner);
  $("#btnFlip")?.addEventListener("click", async () => {
    const options = $$("#cameraSelect option").map((opt) => opt.value);
    if (options.length < 2) { $("#shift-result").textContent = "No encontramos otra cámara disponible en este dispositivo."; return; }
    const nextId = options[(options.indexOf(currentCameraId) + 1) % options.length];
    currentCameraId = nextId; $("#cameraSelect").value = nextId;
    if (qrReader?.isScanning) { await stopQrScanner(); await startQrScanner(); }
  });
}

function normalizeQrText(rawText) {
  return String(rawText || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}
function detectShiftType(rawText) {
  const raw = normalizeQrText(rawText);
  const compact = raw.replace(/\s+/g, "");
  if (raw.includes("SALIDA") || compact.includes("ADMSALIDA") || raw.includes("CHECK OUT") || compact.includes("CHECKOUT") || /(^|\W)OUT($|\W)/.test(raw)) return "salida";
  if (raw.includes("LLEGADA") || raw.includes("INGRESO") || raw.includes("ENTRADA") || compact.includes("ADMLLEGADA") || compact.includes("ADMINGRESO") || raw.includes("CHECK IN") || compact.includes("CHECKIN")) return "ingreso";
  return "";
}

async function startQrScanner() {
  const result = $("#shift-result");
  if (!window.Html5Qrcode) { result.textContent = "No se pudo abrir el lector de QR. Revisa tu conexión a internet e intenta de nuevo."; return; }
  try {
    if (!currentCameraId) await populateCameras();
    if (qrReader) await qrReader.stop().catch(() => null);
    qrReader = new window.Html5Qrcode("reader");
    const cfg = { fps: 10, qrbox: (vw, vh) => ({ width: Math.min(vw, vh) * 0.72, height: Math.min(vw, vh) * 0.72 }) };
    try { await qrReader.start({ deviceId: { exact: currentCameraId } }, cfg, onScanSuccess, () => {}); }
    catch (_) { await qrReader.start({ facingMode: "environment" }, cfg, onScanSuccess, () => {}); }
    $("#btnStart").disabled = true; $("#btnStop").disabled = false;
    result.textContent = "Cámara activa. Acerca el código QR al recuadro.";
  } catch (error) {
    console.error(error);
    result.textContent = insecureContextMsg() || "No pudimos abrir la cámara. Revisa el permiso de cámara o cierra otras apps que la esten usando.";
  }
}
async function stopQrScanner() {
  if (!qrReader) return;
  try { if (qrReader.isScanning) await qrReader.stop(); await qrReader.clear(); } catch (_) {}
  qrReader = null;
  if ($("#btnStart")) $("#btnStart").disabled = false;
  if ($("#btnStop")) $("#btnStop").disabled = true;
}
async function onScanSuccess(decodedText) {
  if (submitLock) return;
  submitLock = true;
  let savedOk = false;
  const result = $("#shift-result");
  try {
    navigator.vibrate?.(20);
    qrReader?.pause?.(true);
    const type = detectShiftType(decodedText);
    if (!type) { result.textContent = "Este código QR no corresponde a la marcación de jornada. Por favor usa el QR de entrada o salida de la sede."; return; }
    const now = new Date();
    const parts = getBogotaParts(now);
    if ((Date.now() - lastQrSaveOkAt) / 1000 < 8) { result.textContent = "Ya acabamos de guardar una marcación. Espera unos segundos antes de escanear otra vez."; return; }
    result.textContent = `Registrando ${type === "ingreso" ? "tu ingreso" : "tu salida"}...`;
    await saveShiftRecord({ type, raw: decodedText, mode: "presencial", source: "qr", date: parts.date, time: parts.time, stamp: now.toISOString() });
    savedOk = true; lastQrSaveOkAt = Date.now();
    result.textContent = `${type === "ingreso" ? "Ingreso" : "Salida"} registrado: ${parts.date} ${parts.time}. Cámara detenida para evitar registros duplicados.`;
    toast("Jornada registrada", { kind: "ok" });
    await stopQrScanner();
    await renderTodaySummary();
  } catch (error) {
    if (error?.message !== "cancelled") console.error(error);
    result.textContent = friendlySaveError(error);
  } finally {
    if (!savedOk) { setTimeout(() => { try { if (qrReader?.isScanning) qrReader.resume?.(); } catch (_) {} submitLock = false; }, 900); }
    else submitLock = false;
  }
}

async function saveShiftRecord(entry) {
  if (!DB || !ACTIVE_EMAIL) throw new Error("service_not_ready");
  if ((entry.mode === "remoto" || entry.source === "manual_remote") && !canCurrentUserMarkRemote()) throw new Error("remote_not_allowed");
  const docId = `${safeEmailId(ACTIVE_EMAIL)}_${entry.date}`;
  const ref = doc(DB, COLLECTIONS.shiftRecords, docId);
  let existingSnap = null;
  let existing = null;
  try {
    existingSnap = await getDoc(ref);
    existing = existingSnap.exists() ? existingSnap.data() : null;
  } catch (error) {
    if (error?.code !== "permission-denied") throw error;
    console.warn("No se pudo leer el registro previo; se intentara guardar directamente.", error);
  }
  const existingTime = existing?.[`${entry.type}Time`];
  const replacedExisting = Boolean(existingTime);
  if (existingTime) {
    if (!confirm(`Ya existe un ${entry.type} registrado hoy a las ${existingTime}. ¿Quieres reemplazarlo?`)) throw new Error("cancelled");
  }
  const mode = entry.mode || "presencial";
  const source = entry.source || "qr";
  const modalidad = mode === "presencial" ? "sede" : mode;
  const clientCreatedAt = new Date().toISOString();
  const base = {
    role: SHIFT.role, email: ACTIVE_EMAIL, name: getProfileName(), date: entry.date, modalidad,
    updatedAt: serverTimestamp(), updatedAtClient: Date.now(), appBuild: BUILD
  };
  const typed = {
    [`${entry.type}Time`]: entry.time, [`${entry.type}Stamp`]: entry.stamp, [`${entry.type}Raw`]: entry.raw,
    [`${entry.type}ByUid`]: ACTIVE_USER?.uid || "", [`${entry.type}Mode`]: mode, [`${entry.type}Source`]: source, [`${entry.type}Modalidad`]: modalidad
  };
  const event = {
    type: entry.type, mode, modalidad, source, time: entry.time, stamp: entry.stamp,
    uid: ACTIVE_USER?.uid || "", email: ACTIVE_EMAIL, name: getProfileName(), raw: entry.raw,
    appBuild: BUILD, clientCreatedAt, clientCreatedAtMs: Date.now()
  };
  const payload = { ...base, ...typed, events: arrayUnion(event) };
  if (existingSnap?.exists()) await updateDoc(ref, payload);
  else await setDoc(ref, { ...payload, createdAt: serverTimestamp(), createdAtClient: Date.now() }, { merge: true });
  await sendIngresoEmailNotification({ ...event, date: entry.date, docId, replacedExisting });
}

async function sendIngresoEmailNotification(event) {
  if (event?.type !== "ingreso") return;
  if (!EMAIL_NOTIFICATION_ENDPOINT || EMAIL_NOTIFICATION_ENDPOINT === "PEGAR_AQUI_URL_WEB_APP_APPS_SCRIPT") return;
  try {
    await fetch(EMAIL_NOTIFICATION_ENDPOINT, {
      method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(event), keepalive: true
    });
  } catch (error) { console.warn("No se pudo enviar la notificación de ingreso por correo", error); }
}

async function renderTodaySummary() {
  const host = $("#today-summary");
  if (!host) return;
  const { date } = getBogotaParts();
  let records = [];
  try { records = await getShiftRecords({ mineOnly: true, max: 10 }); } catch (error) { console.warn(error); }
  const today = records.find((record) => record.date === date);
  const ingresoMode = formatShiftMode(today?.ingresoMode, today?.ingresoSource);
  const salidaMode = formatShiftMode(today?.salidaMode, today?.salidaSource);
  host.innerHTML = `
    <div class="summaryTitle">Resumen de hoy</div>
    <div class="recordTable compact">
      <div class="recordRow head"><div>Fecha</div><div>Ingreso</div><div>Salida</div></div>
      <div class="recordRow"><div>${escapeHtml(date)}</div><div>${escapeHtml(today?.ingresoTime || "-")}<small>${escapeHtml(ingresoMode)}</small></div><div>${escapeHtml(today?.salidaTime || "-")}<small>${escapeHtml(salidaMode)}</small></div></div>
    </div>
  `;
}

/* ==========================================================================
   6c. Vista: Registros
========================================================================== */
async function getShiftRecords({ mineOnly = true, max = 60 } = {}) {
  if (!DB) return [];
  const clauses = [collection(DB, COLLECTIONS.shiftRecords), orderBy("date", "desc"), limit(max)];
  if (mineOnly && ACTIVE_EMAIL) clauses.splice(1, 0, where("email", "==", ACTIVE_EMAIL));
  const snap = await getDocs(query(...clauses));
  return snap.docs.map((item) => ({ id: item.id, ...item.data() }));
}

let RECORDS_CACHE = [];
const RECORDS_FILTER = { scope: "mine", member: "all", status: "all", from: "", to: "" };

async function renderRecordsTab() {
  const admin = isCurrentUserAdmin();
  await loadAdminData().catch(() => {});
  if (!admin) RECORDS_FILTER.scope = "mine";
  setPanel(`
    <section class="dashHead">
      <div>
        <p class="dashEyebrow">Consulta</p>
        <h2 class="dashTitle">Registros de jornada</h2>
        <p class="dashSub">Filtra, revisa el estado calculado y abre el detalle de cada marcación.</p>
      </div>
      <button class="btnGhost btnSmall" type="button" id="btn-export-csv">Exportar CSV</button>
    </section>
    <section class="filtersBar card">
      ${admin ? `
        <label class="field"><span class="fieldLabel">Alcance</span>
          <select id="f-scope" class="input">
            <option value="mine">Mis registros</option>
            <option value="all" selected>Todo el equipo</option>
          </select></label>
        <label class="field"><span class="fieldLabel">Miembro</span>
          <select id="f-member" class="input"><option value="all">Todos</option>
            ${adminMemberList().map((m) => `<option value="${escapeHtml(m.email)}">${escapeHtml(m.name)}</option>`).join("")}
          </select></label>` : ""}
      <label class="field"><span class="fieldLabel">Estado</span>
        <select id="f-status" class="input">
          <option value="all">Todos</option>
          <option value="puntual">Puntual</option>
          <option value="tarde">Tarde</option>
          <option value="ausente">Ausente</option>
          <option value="incompleto">Incompleto</option>
          <option value="justificado">Justificado</option>
          <option value="editado">Editado</option>
        </select></label>
      <label class="field"><span class="fieldLabel">Desde</span><input type="date" id="f-from" class="input"></label>
      <label class="field"><span class="fieldLabel">Hasta</span><input type="date" id="f-to" class="input"></label>
      <button class="btnGhost btnSmall" type="button" id="btn-clear-filters">Limpiar</button>
    </section>
    <div id="records-list" class="recordsList">Cargando…</div>
  `);
  if (admin) {
    $("#f-scope").value = RECORDS_FILTER.scope;
    $("#f-scope").addEventListener("change", (e) => { RECORDS_FILTER.scope = e.target.value; reloadRecords(); });
    $("#f-member").addEventListener("change", (e) => { RECORDS_FILTER.member = e.target.value; applyRecordsFilter(); });
  }
  $("#f-status").addEventListener("change", (e) => { RECORDS_FILTER.status = e.target.value; applyRecordsFilter(); });
  $("#f-from").addEventListener("change", (e) => { RECORDS_FILTER.from = e.target.value; applyRecordsFilter(); });
  $("#f-to").addEventListener("change", (e) => { RECORDS_FILTER.to = e.target.value; applyRecordsFilter(); });
  $("#btn-clear-filters").addEventListener("click", () => {
    RECORDS_FILTER.member = "all"; RECORDS_FILTER.status = "all"; RECORDS_FILTER.from = ""; RECORDS_FILTER.to = "";
    if ($("#f-member")) $("#f-member").value = "all";
    $("#f-status").value = "all"; $("#f-from").value = ""; $("#f-to").value = "";
    applyRecordsFilter();
  });
  $("#btn-export-csv").addEventListener("click", exportRecordsCsv);
  await reloadRecords();
}

async function reloadRecords() {
  const host = $("#records-list");
  if (host) host.textContent = "Cargando…";
  try {
    RECORDS_CACHE = await getShiftRecords({ mineOnly: RECORDS_FILTER.scope === "mine" || !isCurrentUserAdmin(), max: 300 });
  } catch (error) {
    console.error(error);
    if (host) host.innerHTML = `<div class="emptyState">No se pudieron cargar los registros. Revisa tu conexión e intenta de nuevo.</div>`;
    return;
  }
  applyRecordsFilter();
}

function filteredRecords() {
  return RECORDS_CACHE.filter((r) => {
    if (RECORDS_FILTER.member !== "all" && r.email !== RECORDS_FILTER.member) return false;
    if (RECORDS_FILTER.from && r.date < RECORDS_FILTER.from) return false;
    if (RECORDS_FILTER.to && r.date > RECORDS_FILTER.to) return false;
    if (RECORDS_FILTER.status !== "all") {
      const calc = calculateShiftStatus(r, getExpectedScheduleForDate(r.email, r.date));
      if (RECORDS_FILTER.status === "editado") return calc.edited;
      if (RECORDS_FILTER.status === "incompleto") return calc.isIncomplete;
      return calc.status === RECORDS_FILTER.status;
    }
    return true;
  });
}

function applyRecordsFilter() {
  const host = $("#records-list");
  if (!host) return;
  const admin = isCurrentUserAdmin();
  const records = filteredRecords();
  if (!records.length) { host.innerHTML = `<div class="emptyState">Aún no hay registros para este filtro.</div>`; return; }
  host.innerHTML = `
    <div class="tableWrap">
      <table class="dataTable">
        <thead><tr><th>Fecha</th><th>Miembro</th><th>Ingreso</th><th>Salida</th><th>Modalidad</th><th>Fuente</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          ${records.map((r) => {
            const calc = calculateShiftStatus(r, getExpectedScheduleForDate(r.email, r.date));
            return `<tr class="${r.voided ? "voidedRow" : ""}">
              <td data-label="Fecha">${escapeHtml(r.date || "-")}</td>
              <td data-label="Miembro"><strong>${escapeHtml(r.name || "-")}</strong><small class="cellSub">${escapeHtml(r.email || "")}</small></td>
              <td data-label="Ingreso">${escapeHtml(r.ingresoTime || "—")}</td>
              <td data-label="Salida">${escapeHtml(r.salidaTime || "—")}</td>
              <td data-label="Modalidad">${escapeHtml(r.modalidad || "—")}</td>
              <td data-label="Fuente">${escapeHtml(sourceLabel(r.ingresoSource || r.salidaSource))}</td>
              <td data-label="Estado">${statusBadge(calc)}</td>
              <td data-label="" class="cellActions">
                <button class="linkBtn" type="button" data-detail="${escapeHtml(r.id)}">Ver</button>
                ${admin ? `<button class="linkBtn" type="button" data-edit="${escapeHtml(r.id)}">Editar</button>` : ""}
              </td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
  $$("[data-detail]", host).forEach((b) => b.addEventListener("click", () => openRecordDetail(b.dataset.detail)));
  $$("[data-edit]", host).forEach((b) => b.addEventListener("click", () => openEditRecordModal(b.dataset.edit)));
}

function exportRecordsCsv() {
  const records = filteredRecords();
  if (!records.length) { toast("No hay registros para exportar."); return; }
  const headers = ["Fecha", "Nombre", "Correo", "Ingreso", "Salida", "Modalidad", "Fuente", "Estado", "MinutosTarde", "MinutosTrabajados", "Editado", "Justificado"];
  const rows = records.map((r) => {
    const calc = calculateShiftStatus(r, getExpectedScheduleForDate(r.email, r.date));
    return [r.date, r.name, r.email, r.ingresoTime || "", r.salidaTime || "", r.modalidad || "", sourceLabel(r.ingresoSource || r.salidaSource), calc.label, calc.lateMinutes, calc.workedMinutes ?? "", calc.edited ? "si" : "no", calc.justified ? "si" : "no"];
  });
  const csv = [headers, ...rows].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  downloadFile(`registros-musicala-${todayBogota()}.csv`, "﻿" + csv, "text/csv;charset=utf-8");
  toast("CSV exportado", { kind: "ok" });
}

function downloadFile(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

/* ==========================================================================
   7. Modales: detalle / edicion / excepciones / horario
========================================================================== */
function ensureModal() {
  let overlay = $("#modal-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "modal-overlay"; overlay.className = "drawerOverlay"; overlay.hidden = true;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", closeModal);
  }
  let modal = $("#modal-workspace");
  if (!modal) {
    modal = document.createElement("section");
    modal.id = "modal-workspace"; modal.className = "modal modalWide"; modal.hidden = true;
    modal.setAttribute("role", "dialog"); modal.setAttribute("aria-modal", "true");
    modal.innerHTML = `
      <div class="modalCard workspaceModalCard">
        <div class="modalHead workspaceHead">
          <div>
            <div class="modalEyebrow" id="workspace-eyebrow">Modulo interno</div>
            <div class="modalTitle" id="workspace-title">Registro</div>
            <p class="workspaceSub" id="workspace-subtitle"></p>
          </div>
          <button class="btnGhost" id="btn-workspace-close" type="button" aria-label="Cerrar">Cerrar</button>
        </div>
        <div class="modalBody workspaceBody"><div id="workspace-content"></div></div>
      </div>`;
    document.body.appendChild(modal);
    $("#btn-workspace-close", modal)?.addEventListener("click", closeModal);
  }
  return modal;
}
async function closeModal() {
  const modal = $("#modal-workspace");
  const overlay = $("#modal-overlay");
  if (modal) modal.hidden = true;
  if (overlay) overlay.hidden = true;
}
function openModal(title, subtitle, eyebrow, html) {
  ensureModal();
  $("#workspace-title").textContent = title;
  $("#workspace-subtitle").textContent = subtitle;
  $("#workspace-eyebrow").textContent = eyebrow;
  $("#workspace-content").innerHTML = html;
  $("#modal-overlay").hidden = false;
  $("#modal-workspace").hidden = false;
}

function findRecord(id) {
  return RECORDS_CACHE.find((r) => r.id === id) || STATS_RECORDS.find((r) => r.id === id);
}

async function openRecordDetail(id) {
  const r = findRecord(id);
  if (!r) { toast("No se encontró el registro."); return; }
  const schedule = getExpectedScheduleForDate(r.email, r.date);
  const calc = calculateShiftStatus(r, schedule);
  const history = Array.isArray(r.correctionHistory) ? r.correctionHistory : [];
  openModal("Detalle del registro", `${r.name} · ${r.date}`, "Consulta", `
    <div class="detailGrid">
      ${detailItem("Fecha", formatLongDate(r.date))}
      ${detailItem("Estado", calc.label)}
      ${detailItem("Ingreso", r.ingresoTime || "—")}
      ${detailItem("Salida", r.salidaTime || "—")}
      ${detailItem("Modalidad", r.modalidad || "—")}
      ${detailItem("Fuente ingreso", sourceLabel(r.ingresoSource))}
      ${detailItem("Hora esperada", schedule ? `${schedule.start} – ${schedule.end} (${schedule.modality})${schedule.source === "override" ? " · excepción" : ""}` : "Sin horario")}
      ${detailItem("Minutos tarde", calc.lateMinutes)}
      ${detailItem("Trabajado", minutesToHhmm(calc.workedMinutes))}
      ${detailItem("Esperado", minutesToHhmm(calc.expectedMinutes))}
    </div>
    ${r.adminNotes ? `<div class="noteBox"><strong>Nota administrativa:</strong> ${escapeHtml(r.adminNotes)}</div>` : ""}
    ${r.voided ? `<div class="noteBox warn"><strong>Registro anulado.</strong> ${escapeHtml(r.voidReason || "")} (${escapeHtml(r.voidedBy || "")})</div>` : ""}
    ${calc.edited ? `<div class="noteBox info"><strong>Registro corregido.</strong> ${escapeHtml(r.correctionReason || "")} — ${escapeHtml(r.correctedBy || "")}</div>` : ""}
    <h4 class="sectionH">Historial de correcciones (${history.length})</h4>
    ${history.length ? `<div class="historyList">${history.slice().reverse().map((h) => `
      <div class="historyItem">
        <div class="historyTop"><strong>${escapeHtml(h.correctedBy || "")}</strong><span>${escapeHtml(h.correctedAtClient ? formatDateTime(new Date(h.correctedAtClient).toISOString()) : "")}</span></div>
        <div class="historyReason">${escapeHtml(h.reason || "")}</div>
        <div class="historyDiff">Ingreso: ${escapeHtml(h.previousData?.ingresoTime || "—")} → ${escapeHtml(h.newData?.ingresoTime || "—")} · Salida: ${escapeHtml(h.previousData?.salidaTime || "—")} → ${escapeHtml(h.newData?.salidaTime || "—")}</div>
      </div>`).join("")}</div>` : `<div class="emptyState">Este registro no tiene correcciones.</div>`}
    ${isCurrentUserAdmin() ? `<div class="modalActions"><button class="btnPrimary" type="button" id="btn-go-edit">Editar / corregir</button></div>` : ""}
  `);
  $("#btn-go-edit")?.addEventListener("click", () => openEditRecordModal(id));
}

function detailItem(label, value) {
  return `<div class="detailItem"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
}

async function openEditRecordModal(id) {
  if (!isCurrentUserAdmin()) { toast("No tienes permisos para editar registros.", { kind: "warn" }); return; }
  const r = findRecord(id);
  if (!r) { toast("No se encontró el registro."); return; }
  openModal("Editar / corregir registro", `${r.name} · ${r.date}`, "Corrección admin", `
    <p class="modalNote">Editar este registro <strong>no cambia</strong> el horario semanal de la persona. Solo corrige esta marcación puntual.</p>
    <div class="formGrid">
      <label class="field"><span class="fieldLabel">Hora de ingreso (HH:mm)</span><input type="time" id="e-ingreso" class="input" value="${escapeHtml(r.ingresoTime || "")}"></label>
      <label class="field"><span class="fieldLabel">Hora de salida (HH:mm)</span><input type="time" id="e-salida" class="input" value="${escapeHtml(r.salidaTime || "")}"></label>
      <label class="field"><span class="fieldLabel">Modalidad del día</span>
        <select id="e-modalidad" class="input">
          ${["sede", "remoto", "flexible"].map((m) => `<option value="${m}" ${(r.modalidad || "sede") === m ? "selected" : ""}>${m}</option>`).join("")}
        </select></label>
      <label class="field"><span class="fieldLabel">Estado manual</span>
        <select id="e-status" class="input">
          <option value="">Automatico (calculado)</option>
          <option value="puntual" ${r.statusOverride === "puntual" ? "selected" : ""}>Contar como puntual (ajuste admin)</option>
          <option value="justificado" ${r.statusOverride === "justificado" ? "selected" : ""}>Justificado</option>
        </select></label>
    </div>
    <p class="modalNote"><strong>Contar como puntual</strong> conserva la hora que realmente quedó registrada, pero elimina la tardanza de las estadísticas. El motivo quedará en el historial.</p>
    <label class="field"><span class="fieldLabel">Nota administrativa</span><textarea id="e-notes" class="input" rows="2">${escapeHtml(r.adminNotes || "")}</textarea></label>
    <label class="field"><span class="fieldLabel">Motivo de la corrección (obligatorio)</span><textarea id="e-reason" class="input" rows="2" placeholder="Ej: ese día se autorizó ingreso diferente por reunión externa."></textarea></label>
    <div id="e-feedback" class="formFeedback" role="alert" aria-live="assertive" hidden></div>
    <div class="modalActions">
      ${r.voided ? "" : `<button class="btnDanger" type="button" id="btn-void">Anular registro</button>`}
      <button class="btnGhost" type="button" id="btn-cancel-edit">Cancelar</button>
      <button class="btnPrimary" type="button" id="btn-save-edit">Guardar corrección</button>
    </div>
  `);
  $("#btn-cancel-edit")?.addEventListener("click", closeModal);
  $("#btn-save-edit")?.addEventListener("click", async () => {
    const reason = $("#e-reason").value.trim();
    const feedback = $("#e-feedback");
    if (!reason) {
      feedback.textContent = "Escribe el motivo de la corrección para poder guardar.";
      feedback.dataset.kind = "warn";
      feedback.hidden = false;
      $("#e-reason").classList.add("inputError");
      $("#e-reason").focus();
      return;
    }
    $("#e-reason").classList.remove("inputError");
    feedback.hidden = true;
    const patch = {
      ingresoTime: $("#e-ingreso").value || "",
      salidaTime: $("#e-salida").value || "",
      modalidad: $("#e-modalidad").value,
      adminNotes: $("#e-notes").value.trim(),
      statusOverride: $("#e-status").value
    };
    if (!confirm("¿Confirmas guardar esta corrección del registro?")) return;
    const saveButton = $("#btn-save-edit");
    saveButton.disabled = true;
    saveButton.textContent = "Guardando…";
    feedback.textContent = "Guardando la corrección…";
    feedback.dataset.kind = "info";
    feedback.hidden = false;
    const result = await saveRecordCorrection(id, patch, reason);
    if (!result?.ok) {
      saveButton.disabled = false;
      saveButton.textContent = "Guardar corrección";
      feedback.textContent = result?.message || "No se pudo guardar la corrección.";
      feedback.dataset.kind = "warn";
      feedback.hidden = false;
    }
  });
  $("#btn-void")?.addEventListener("click", async () => {
    const reason = $("#e-reason").value.trim() || prompt("Motivo de anulacion:") || "";
    if (!reason) { toast("Indica el motivo de la anulacion.", { kind: "warn" }); return; }
    if (!confirm("¿Seguro que quieres anular este registro? No se borra, queda marcado como anulado.")) return;
    await voidRecord(id, reason);
  });
}

async function saveRecordCorrection(id, patch, reason) {
  const r = findRecord(id);
  if (!r) return { ok: false, message: "No se encontró el registro que intentas corregir." };
  try {
    const ref = doc(DB, COLLECTIONS.shiftRecords, id);
    const previousData = { ingresoTime: r.ingresoTime || "", salidaTime: r.salidaTime || "", modalidad: r.modalidad || "", statusOverride: r.statusOverride || "" };
    const newData = { ingresoTime: patch.ingresoTime, salidaTime: patch.salidaTime, modalidad: patch.modalidad, statusOverride: patch.statusOverride };
    await updateDoc(ref, {
      ...patch,
      manualCorrection: true,
      correctionReason: reason,
      correctedBy: ACTIVE_EMAIL,
      correctedAtClient: Date.now(),
      correctedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedAtClient: Date.now(),
      correctionHistory: arrayUnion({ correctedBy: ACTIVE_EMAIL, correctedAtClient: Date.now(), previousData, newData, reason })
    });
    Object.assign(r, patch, { manualCorrection: true, correctionReason: reason, correctedBy: ACTIVE_EMAIL });
    toast("Registro corregido", { kind: "ok" });
    await closeModal();
    if (STATS_RECORDS.some((item) => item.id === id)) renderStatsUI();
    else applyRecordsFilter();
    return { ok: true };
  } catch (error) {
    console.error(error);
    const message = error?.code === "permission-denied"
      ? "Firebase rechazó la corrección por permisos. Verifica que ingresaste con una cuenta administradora."
      : "No se pudo guardar la corrección. Revisa tu conexión e inténtalo de nuevo.";
    toast(message, { kind: "warn" });
    return { ok: false, message };
  }
}

function openCreateMissingRecordModal(email, date) {
  if (!isCurrentUserAdmin()) { toast("No tienes permisos para crear registros.", { kind: "warn" }); return; }
  const member = adminMemberList().find((item) => item.email === email);
  const schedule = getExpectedScheduleForDate(email, date);
  if (!member || !schedule) { toast("No se encontró el horario programado para ese día.", { kind: "warn" }); return; }
  openModal("Registrar jornada faltante", `${member.name} · ${date}`, "Corrección admin", `
    <p class="modalNote">Este registro será creado por un administrador porque la persona trabajó, pero su marcación no quedó guardada. La creación quedará identificada y auditada.</p>
    <div class="formGrid">
      <label class="field"><span class="fieldLabel">Hora de ingreso</span><input type="time" id="m-ingreso" class="input" value="${escapeHtml(schedule.start)}"></label>
      <label class="field"><span class="fieldLabel">Hora de salida</span><input type="time" id="m-salida" class="input" value="${escapeHtml(schedule.end)}"></label>
      <label class="field"><span class="fieldLabel">Modalidad del día</span>
        <select id="m-modalidad" class="input">
          ${["sede", "remoto", "flexible"].map((value) => `<option value="${value}" ${schedule.modality === value ? "selected" : ""}>${value}</option>`).join("")}
        </select>
      </label>
      <label class="field"><span class="fieldLabel">Estado</span>
        <select id="m-status" class="input">
          <option value="">Automático según la hora</option>
          <option value="puntual">Contar como puntual (ajuste admin)</option>
          <option value="justificado">Justificado</option>
        </select>
      </label>
    </div>
    <label class="field"><span class="fieldLabel">Nota administrativa</span><textarea id="m-notes" class="input" rows="2"></textarea></label>
    <label class="field"><span class="fieldLabel">Motivo de creación (obligatorio)</span><textarea id="m-reason" class="input" rows="2" placeholder="Ej: trabajó normalmente, pero la app no permitió registrar la jornada."></textarea></label>
    <div id="m-feedback" class="formFeedback" role="alert" aria-live="assertive" hidden></div>
    <div class="modalActions">
      <button class="btnGhost" type="button" id="btn-cancel-missing">Cancelar</button>
      <button class="btnPrimary" type="button" id="btn-save-missing">Crear jornada</button>
    </div>
  `);
  $("#btn-cancel-missing")?.addEventListener("click", closeModal);
  $("#btn-save-missing")?.addEventListener("click", async () => {
    const reason = $("#m-reason").value.trim();
    const ingresoTime = $("#m-ingreso").value;
    const salidaTime = $("#m-salida").value;
    const feedback = $("#m-feedback");
    if (!ingresoTime || !salidaTime || !reason) {
      feedback.textContent = "Completa ingreso, salida y motivo para crear la jornada.";
      feedback.dataset.kind = "warn"; feedback.hidden = false;
      (!reason ? $("#m-reason") : (!ingresoTime ? $("#m-ingreso") : $("#m-salida"))).focus();
      return;
    }
    if (toMinutes(salidaTime) <= toMinutes(ingresoTime)) {
      feedback.textContent = "La hora de salida debe ser posterior a la hora de ingreso.";
      feedback.dataset.kind = "warn"; feedback.hidden = false; $("#m-salida").focus(); return;
    }
    if (!confirm(`¿Crear la jornada faltante de ${member.name} para el ${date}?`)) return;
    const button = $("#btn-save-missing");
    button.disabled = true; button.textContent = "Creando…";
    feedback.textContent = "Creando la jornada…"; feedback.dataset.kind = "info"; feedback.hidden = false;
    const result = await createMissingRecord({
      email, name: member.name, date, ingresoTime, salidaTime,
      modalidad: $("#m-modalidad").value, statusOverride: $("#m-status").value,
      adminNotes: $("#m-notes").value.trim(), reason
    });
    if (!result.ok) {
      button.disabled = false; button.textContent = "Crear jornada";
      feedback.textContent = result.message; feedback.dataset.kind = "warn"; feedback.hidden = false;
    }
  });
}

async function createMissingRecord(data) {
  const id = `${safeEmailId(data.email)}_${data.date}`;
  try {
    const ref = doc(DB, COLLECTIONS.shiftRecords, id);
    const existing = await getDoc(ref);
    if (existing.exists()) return { ok: false, message: "Ya existe un registro para esa persona y fecha. Recarga la vista y edítalo." };
    const now = Date.now();
    await setDoc(ref, {
      role: SHIFT.role, email: data.email, name: data.name, date: data.date,
      ingresoTime: data.ingresoTime, salidaTime: data.salidaTime, modalidad: data.modalidad,
      ingresoMode: "manual_admin", salidaMode: "manual_admin",
      ingresoSource: "manual_admin", salidaSource: "manual_admin",
      ingresoStamp: `${data.date}T${data.ingresoTime}:00-05:00`,
      salidaStamp: `${data.date}T${data.salidaTime}:00-05:00`,
      statusOverride: data.statusOverride, adminNotes: data.adminNotes,
      manualCorrection: true, correctionReason: data.reason,
      correctedBy: ACTIVE_EMAIL, correctedAt: serverTimestamp(), correctedAtClient: now,
      createdByAdmin: true, createdAt: serverTimestamp(), createdAtClient: now,
      updatedAt: serverTimestamp(), updatedAtClient: now, appBuild: BUILD,
      correctionHistory: [{
        correctedBy: ACTIVE_EMAIL, correctedAtClient: now, reason: `CREACIÓN ADMIN: ${data.reason}`,
        previousData: {}, newData: { ingresoTime: data.ingresoTime, salidaTime: data.salidaTime, modalidad: data.modalidad, statusOverride: data.statusOverride }
      }]
    });
    toast("Jornada faltante creada", { kind: "ok" });
    await closeModal();
    await renderAdminStats();
    return { ok: true };
  } catch (error) {
    console.error(error);
    return {
      ok: false,
      message: error?.code === "permission-denied"
        ? "Firebase rechazó la creación. Verifica que ingresaste con una cuenta administradora."
        : "No se pudo crear la jornada. Revisa tu conexión e inténtalo de nuevo."
    };
  }
}

async function voidRecord(id, reason) {
  const r = findRecord(id);
  if (!r) return;
  try {
    await updateDoc(doc(DB, COLLECTIONS.shiftRecords, id), {
      voided: true, voidReason: reason, voidedBy: ACTIVE_EMAIL, voidedAt: serverTimestamp(),
      updatedAt: serverTimestamp(), updatedAtClient: Date.now(),
      correctionHistory: arrayUnion({ correctedBy: ACTIVE_EMAIL, correctedAtClient: Date.now(), reason: `ANULACION: ${reason}`, previousData: {}, newData: { voided: true } })
    });
    Object.assign(r, { voided: true, voidReason: reason, voidedBy: ACTIVE_EMAIL });
    toast("Registro anulado", { kind: "ok" });
    await closeModal();
    applyRecordsFilter();
  } catch (error) {
    console.error(error);
    toast("No se pudo anular el registro.", { kind: "warn" });
  }
}

/* ==========================================================================
   6d. Vista: Estadísticas (admin)
========================================================================== */
const STATS_FILTER = { preset: "month", from: "", to: "", member: "all", modality: "all", status: "all" };

function presetRange(preset) {
  const today = todayBogota();
  if (preset === "today") return { from: today, to: today };
  if (preset === "week") {
    const idx = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // lunes=0
    return { from: addDaysStr(today, -idx), to: today };
  }
  if (preset === "month") return { from: today.slice(0, 8) + "01", to: today };
  return { from: STATS_FILTER.from || today, to: STATS_FILTER.to || today };
}

async function renderAdminStats() {
  if (!isCurrentUserAdmin()) { toast("Sección solo para administradores.", { kind: "warn" }); return goTab("inicio"); }
  setPanel(`<div class="loadingBlock">Cargando estadísticas…</div>`);
  await loadAdminData({ force: true }).catch(() => {});
  let records = [];
  try { records = await getShiftRecords({ mineOnly: false, max: 1000 }); } catch (_) {}
  STATS_RECORDS = records;
  renderStatsUI();
}

let STATS_RECORDS = [];

function renderStatsUI() {
  if (STATS_FILTER.member !== "all" && isAdminEmail(STATS_FILTER.member)) STATS_FILTER.member = "all";
  const r = presetRange(STATS_FILTER.preset);
  STATS_FILTER.from = r.from; STATS_FILTER.to = r.to;
  const statMembers = statsMemberList();
  const stats = calculateStats(STATS_RECORDS, { from: r.from, to: r.to, memberFilter: STATS_FILTER.member, modalityFilter: STATS_FILTER.modality, statusFilter: STATS_FILTER.status });
  const g = stats.global;
  const bestMembers = stats.memberRows.filter((m) => m.onTime + m.late > 0).sort((a, b) => b.punctualityPct - a.punctualityPct);
  const worstByLate = stats.memberRows.slice().sort((a, b) => b.late - a.late).filter((m) => m.late > 0);
  const worstDays = stats.dayRows.slice().sort((a, b) => (b.late + b.absent) - (a.late + a.absent)).filter((d) => d.late + d.absent > 0).slice(0, 5);

  setPanel(`
    <section class="dashHead">
      <div>
        <p class="dashEyebrow">Panel admin</p>
        <h2 class="dashTitle">Estadísticas de puntualidad</h2>
        <p class="dashSub">${escapeHtml(formatLongDate(r.from))} → ${escapeHtml(formatLongDate(r.to))}</p>
      </div>
      <div class="headActions">
        <button class="btnGhost btnSmall" type="button" id="btn-copy-summary">Copiar resumen</button>
        <button class="btnGhost btnSmall" type="button" id="btn-copy-report">Copiar reporte</button>
      </div>
    </section>

    <section class="filtersBar card">
      <div class="segMenu" id="seg-preset">
        ${[["today", "Hoy"], ["week", "Semana"], ["month", "Mes"], ["custom", "Personalizado"]].map(([v, l]) => `<button class="segBtn${STATS_FILTER.preset === v ? " active" : ""}" data-preset="${v}" type="button">${l}</button>`).join("")}
      </div>
      <label class="field"><span class="fieldLabel">Desde</span><input type="date" id="s-from" class="input" value="${escapeHtml(r.from)}" ${STATS_FILTER.preset !== "custom" ? "disabled" : ""}></label>
      <label class="field"><span class="fieldLabel">Hasta</span><input type="date" id="s-to" class="input" value="${escapeHtml(r.to)}" ${STATS_FILTER.preset !== "custom" ? "disabled" : ""}></label>
      <label class="field"><span class="fieldLabel">Miembro</span>
        <select id="s-member" class="input"><option value="all">Todos</option>
          ${statMembers.map((m) => `<option value="${escapeHtml(m.email)}" ${STATS_FILTER.member === m.email ? "selected" : ""}>${escapeHtml(m.name)}</option>`).join("")}
        </select></label>
      <label class="field"><span class="fieldLabel">Modalidad</span>
        <select id="s-modality" class="input">
          ${[["all", "Todas"], ["sede", "Sede"], ["remoto", "Remoto"]].map(([v, l]) => `<option value="${v}" ${STATS_FILTER.modality === v ? "selected" : ""}>${l}</option>`).join("")}
        </select></label>
    </section>

    <section class="kpiGrid wide">
      ${kpiCard("Puntualidad global", g.punctualityPct + "%", `${g.onTime} puntuales / ${g.late} tarde`, g.punctualityPct >= 80 ? "ok" : "warn")}
      ${kpiCard("Jornadas esperadas", g.expectedDays, `${g.registeredDays} registradas (${g.attendancePct}%)`, "")}
      ${kpiCard("Llegadas tarde", g.late, `prom. ${g.avgLateMinutes} min`, g.late ? "late" : "ok")}
      ${kpiCard("Ausencias", g.absent, "según horario", g.absent ? "absent" : "ok")}
      ${kpiCard("Jornadas incompletas", g.incompleteDays, "sin salida", g.incompleteDays ? "warn" : "ok")}
      ${kpiCard("Horas trabajadas", minutesToHhmm(g.totalWorkedMinutes), "efectivas · almuerzo descontado", "")}
      ${kpiCard("Horas programadas", minutesToHhmm(g.totalExpectedMinutes), `${g.expectedDays} jornadas · efectivas`, "info")}
      ${kpiCard("Cumplimiento horario", g.compliancePct + "%", "trabajadas / programadas", g.compliancePct >= 95 ? "ok" : "warn")}
      ${kpiCard("Balance de horas", signedMinutesToHhmm(g.netBalanceMinutes), g.netBalanceMinutes < 0 ? "déficit del periodo" : "excedente del periodo", g.netBalanceMinutes < 0 ? "late" : "ok")}
      ${kpiCard("Minutos tarde", g.totalLateMinutes, "acumulados", "")}
      ${kpiCard("Impacto de puntualidad", minutesToHhmm(g.totalImpactMinutes), "tardanzas + salidas tempranas", g.totalImpactMinutes ? "warn" : "ok")}
      ${kpiCard("Hora prom. llegada", g.avgArrival, "promedio del equipo", "")}
      ${kpiCard("Salidas tempranas", g.leftEarly, "antes de lo esperado", g.leftEarly ? "warn" : "ok")}
      ${kpiCard("Justificados", g.justified, "registros", "info")}
    </section>

    <div class="dashCols">
      <section class="dashSection card">
        <h3 class="sectionH">🏆 Mejor puntualidad</h3>
        ${bestMembers.length ? `<div class="rankList">${bestMembers.slice(0, 5).map((m, i) => rankRow(i + 1, m.name, m.punctualityPct + "%", barHtml(m.punctualityPct, "ok"))).join("")}</div>` : `<div class="emptyState">Sin datos suficientes.</div>`}
      </section>
      <section class="dashSection card">
        <h3 class="sectionH">⏰ Más llegadas tarde</h3>
        ${worstByLate.length ? `<div class="rankList">${worstByLate.slice(0, 5).map((m, i) => rankRow(i + 1, m.name, m.late + " tarde", barHtml(maxPct(m.late, worstByLate[0].late), "late"))).join("")}</div>` : `<div class="emptyState">Sin llegadas tarde en el periodo. 👌</div>`}
      </section>
    </div>

    <section class="dashSection">
      <h3 class="sectionH">🕓 Detalle de tardanzas</h3>
      <p class="sectionSub">Cada llegada tarde del periodo: a qué hora debía llegar y a qué hora marcó.</p>
      ${stats.lateDetails.length ? `<div class="tableWrap"><table class="dataTable">
        <thead><tr><th>Fecha</th><th>Miembro</th><th>Debía llegar</th><th>Marcó</th><th>Retraso</th><th>Ajustar</th></tr></thead>
        <tbody>${stats.lateDetails.map((d) => `<tr>
          <td data-label="Fecha"><strong>${escapeHtml(d.date)}</strong></td>
          <td data-label="Miembro">${escapeHtml(d.name)}</td>
          <td data-label="Debía llegar">${escapeHtml(d.expectedStart)}</td>
          <td data-label="Marcó"><span class="badgeChip late">${escapeHtml(d.arrival)}</span></td>
          <td data-label="Retraso">${d.lateMinutes} min</td>
          <td data-label="Ajustar"><button class="btnGhost btnCompact" type="button" data-fix-late="${escapeHtml(d.id)}">Corregir</button></td>
        </tr>`).join("")}</tbody></table></div>` : `<div class="emptyState">Sin llegadas tarde en el periodo. 🎉</div>`}
    </section>

    <section class="dashSection">
      <h3 class="sectionH">📝 Jornadas programadas sin registro</h3>
      <p class="sectionSub">Si la persona sí trabajó, un administrador puede crear la jornada faltante con sus horas reales y un motivo auditable.</p>
      ${stats.missingDetails.length ? `<div class="tableWrap"><table class="dataTable">
        <thead><tr><th>Fecha</th><th>Miembro</th><th>Horario programado</th><th>Modalidad</th><th>Acción</th></tr></thead>
        <tbody>${stats.missingDetails.map((d) => `<tr>
          <td data-label="Fecha"><strong>${escapeHtml(d.date)}</strong></td>
          <td data-label="Miembro">${escapeHtml(d.name)}</td>
          <td data-label="Horario programado">${escapeHtml(d.expectedStart)} – ${escapeHtml(d.expectedEnd)}</td>
          <td data-label="Modalidad">${escapeHtml(d.modality)}</td>
          <td data-label="Acción"><button class="btnGhost btnCompact" type="button" data-create-missing="${escapeHtml(d.email)}" data-date="${escapeHtml(d.date)}">Registrar jornada</button></td>
        </tr>`).join("")}</tbody></table></div>` : `<div class="emptyState">No hay jornadas programadas pendientes de registro en este periodo.</div>`}
    </section>

    <section class="dashSection">
      <h3 class="sectionH">📆 Días trabajados por mes</h3>
      <p class="sectionSub">Días con jornada registrada frente a los días programados de cada mes.</p>
      ${stats.monthRows.length ? `<div class="tableWrap"><table class="dataTable">
        <thead><tr><th>Mes</th><th>Miembro</th><th>Días trabajados</th><th>Días programados</th><th>Asistencia</th></tr></thead>
        <tbody>${stats.monthRows.map((row) => `<tr>
          <td data-label="Mes"><strong>${escapeHtml(monthKeyLabel(row.month))}</strong></td>
          <td data-label="Miembro">${escapeHtml(row.name)}</td>
          <td data-label="Días trabajados">${row.worked}</td>
          <td data-label="Días programados">${row.expected}</td>
          <td data-label="Asistencia">${row.attendancePct == null ? "-" : `<span class="badgeChip ${row.attendancePct >= 90 ? "ok" : (row.attendancePct >= 70 ? "warn" : "late")}">${row.attendancePct}%</span>`}</td>
        </tr>`).join("")}</tbody></table></div>` : `<div class="emptyState">Sin datos en el periodo.</div>`}
    </section>

    <section class="dashSection">
      <h3 class="sectionH">Resumen por miembro</h3>
      <div class="tableWrap">
        <table class="dataTable">
          <thead><tr><th>Miembro</th><th>Esper.</th><th>Reg.</th><th>Punt.</th><th>Tarde</th><th>Ausen.</th><th>Incompl.</th><th>Impacto</th><th>% Punt.</th><th>Horas trab.</th><th>Horas prog.</th><th>Cumpl.</th><th>Balance</th></tr></thead>
          <tbody>
            ${stats.memberRows.map((m) => `<tr>
              <td data-label="Miembro"><strong>${escapeHtml(m.name)}</strong></td>
              <td data-label="Esper.">${m.expected}</td>
              <td data-label="Reg.">${m.registered}</td>
              <td data-label="Punt.">${m.onTime}</td>
              <td data-label="Tarde">${m.late}</td>
              <td data-label="Ausen.">${m.absent}</td>
              <td data-label="Incompl.">${m.incomplete}</td>
              <td data-label="Impacto">${minutesToHhmm(m.lateMinutes + m.earlyLeaveMinutes)}</td>
              <td data-label="% Punt."><span class="badgeChip ${m.punctualityPct >= 80 ? "ok" : (m.punctualityPct >= 60 ? "warn" : "late")}">${m.punctualityPct}%</span></td>
              <td data-label="Horas trab.">${minutesToHhmm(m.workedMinutes)}</td>
              <td data-label="Horas prog.">${minutesToHhmm(m.expectedMinutes)}</td>
              <td data-label="Cumpl."><span class="badgeChip ${m.compliancePct >= 95 ? "ok" : (m.compliancePct >= 85 ? "warn" : "late")}">${m.compliancePct}%</span></td>
              <td data-label="Balance">${signedMinutesToHhmm(m.netBalanceMinutes)}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </section>

    <section class="dashSection">
      <h3 class="sectionH">⏱️ Impacto diario sobre la jornada</h3>
      <p class="sectionSub">Compara horas efectivas programadas y registradas. En jornadas mayores a 6h se descuenta 1h de almuerzo.</p>
      <div class="tableWrap"><table class="dataTable">
        <thead><tr><th>Fecha</th><th>Programado</th><th>Trabajado</th><th>Cumplimiento</th><th>Tardanzas</th><th>Salidas temp.</th><th>Impacto</th><th>Balance</th></tr></thead>
        <tbody>${stats.dayRows.slice().reverse().map((d) => `<tr>
          <td data-label="Fecha"><strong>${escapeHtml(d.date)}</strong></td>
          <td data-label="Programado">${minutesToHhmm(d.expectedMinutes)}</td>
          <td data-label="Trabajado">${minutesToHhmm(d.workedMinutes)}</td>
          <td data-label="Cumplimiento"><span class="badgeChip ${d.compliancePct >= 95 ? "ok" : (d.compliancePct >= 85 ? "warn" : "late")}">${d.compliancePct}%</span></td>
          <td data-label="Tardanzas">${minutesToHhmm(d.lateMinutes)}</td>
          <td data-label="Salidas temp.">${minutesToHhmm(d.earlyLeaveMinutes)}</td>
          <td data-label="Impacto">${minutesToHhmm(d.impactMinutes)}</td>
          <td data-label="Balance">${signedMinutesToHhmm(d.netBalanceMinutes)}</td>
        </tr>`).join("")}</tbody>
      </table></div>
    </section>

    <section class="dashSection">
      <h3 class="sectionH">📅 Días con más problemas de puntualidad</h3>
      ${worstDays.length ? `<div class="tableWrap"><table class="dataTable">
        <thead><tr><th>Fecha</th><th>Esperados</th><th>Puntuales</th><th>Tarde</th><th>Ausentes</th><th>Incompletos</th></tr></thead>
        <tbody>${worstDays.map((d) => `<tr>
          <td data-label="Fecha">${escapeHtml(d.date)}</td><td data-label="Esperados">${d.expected}</td>
          <td data-label="Puntuales">${d.onTime}</td><td data-label="Tarde"><span class="badgeChip ${d.late ? "late" : "ok"}">${d.late}</span></td>
          <td data-label="Ausentes"><span class="badgeChip ${d.absent ? "absent" : "ok"}">${d.absent}</span></td><td data-label="Incompletos">${d.incomplete}</td>
        </tr>`).join("")}</tbody></table></div>` : `<div class="emptyState">No hay días con problemas en el periodo. 🎉</div>`}
    </section>
  `);
  $$("[data-fix-late]").forEach((button) => button.addEventListener("click", () => openEditRecordModal(button.dataset.fixLate)));
  $$("[data-create-missing]").forEach((button) => button.addEventListener("click", () => openCreateMissingRecordModal(button.dataset.createMissing, button.dataset.date)));
  wireStatsControls();
  $("#btn-copy-summary").addEventListener("click", () => copyStatsSummary(stats, r));
  $("#btn-copy-report").addEventListener("click", () => copyStatsReport(stats, r, bestMembers));
}

function monthKeyLabel(key) {
  const [y, mo] = key.split("-");
  const name = MONTH_NAMES[Number(mo) - 1] || key;
  return `${name} ${y}`;
}
function maxPct(v, max) { return max ? Math.round((v / max) * 100) : 0; }
function barHtml(pct, tone) { return `<div class="bar"><div class="barFill ${tone}" style="width:${Math.max(3, Math.min(100, pct))}%"></div></div>`; }
function rankRow(pos, name, value, bar) {
  return `<div class="rankRow"><span class="rankPos">${pos}</span><div class="rankBody"><div class="rankTop"><span>${escapeHtml(name)}</span><strong>${escapeHtml(value)}</strong></div>${bar}</div></div>`;
}

function wireStatsControls() {
  $("#seg-preset")?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-preset]");
    if (!b) return;
    STATS_FILTER.preset = b.dataset.preset;
    renderStatsUI();
  });
  $("#s-from")?.addEventListener("change", (e) => { STATS_FILTER.from = e.target.value; STATS_FILTER.preset = "custom"; renderStatsUI(); });
  $("#s-to")?.addEventListener("change", (e) => { STATS_FILTER.to = e.target.value; STATS_FILTER.preset = "custom"; renderStatsUI(); });
  $("#s-member")?.addEventListener("change", (e) => { STATS_FILTER.member = e.target.value; renderStatsUI(); });
  $("#s-modality")?.addEventListener("change", (e) => { STATS_FILTER.modality = e.target.value; renderStatsUI(); });
}

async function copyText(text, okMsg) {
  try { await navigator.clipboard.writeText(text); toast(okMsg || "Copiado", { kind: "ok" }); }
  catch (_) { toast("No se pudo copiar automáticamente."); }
}
function copyStatsSummary(stats, r) {
  const g = stats.global;
  const lines = [
    `Resumen Musicala (${r.from} a ${r.to})`,
    `Jornadas esperadas: ${g.expectedDays} · registradas: ${g.registeredDays} (${g.attendancePct}%)`,
    `Puntualidad global: ${g.punctualityPct}% · Puntuales: ${g.onTime} · Tarde: ${g.late}`,
    `Ausencias: ${g.absent} · Incompletas: ${g.incompleteDays} · Salidas tempranas: ${g.leftEarly}`,
    `Horas programadas: ${minutesToHhmm(g.totalExpectedMinutes)} · trabajadas: ${minutesToHhmm(g.totalWorkedMinutes)} · cumplimiento: ${g.compliancePct}% · balance: ${signedMinutesToHhmm(g.netBalanceMinutes)}`,
    `Impacto de puntualidad: ${minutesToHhmm(g.totalImpactMinutes)} (${g.totalLateMinutes} min tarde + ${g.totalEarlyLeaveMinutes} min por salidas tempranas)`,
    `Hora promedio de llegada: ${g.avgArrival}`
  ];
  copyText(lines.join("\n"), "Resumen copiado");
}
function copyStatsReport(stats, r, best) {
  const g = stats.global;
  const top = best.slice(0, 3).map((m) => `${m.name} (${m.punctualityPct}%)`).join(", ") || "sin datos";
  const report = `Durante el periodo del ${r.from} al ${r.to} se esperaban ${g.expectedDays} jornadas. Se registraron ${g.registeredDays} (${g.attendancePct}% de asistencia), de las cuales ${g.completeDays} fueron jornadas completas. La puntualidad global fue del ${g.punctualityPct}%, con ${g.late} llegadas tarde (promedio de ${g.avgLateMinutes} minutos) y ${g.absent} ausencias. Se programaron ${minutesToHhmm(g.totalExpectedMinutes)} y se registraron ${minutesToHhmm(g.totalWorkedMinutes)}, para un cumplimiento horario del ${g.compliancePct}% y un balance de ${signedMinutesToHhmm(g.netBalanceMinutes)}. Tardanzas y salidas tempranas afectaron ${minutesToHhmm(g.totalImpactMinutes)}. Los miembros con mayor puntualidad fueron: ${top}.`;
  copyText(report, "Reporte copiado");
}

/* ==========================================================================
   6e. Vista: Configuración (horarios por miembro) — admin
========================================================================== */
async function renderConfigTab() {
  if (!isCurrentUserAdmin()) { toast("Sección solo para administradores.", { kind: "warn" }); return goTab("inicio"); }
  setPanel(`<div class="loadingBlock">Cargando configuración…</div>`);
  await loadAdminData({ force: true }).catch(() => {});
  const members = statsMemberList();
  CONFIG_EMAIL = CONFIG_EMAIL && members.some((m) => m.email === CONFIG_EMAIL) ? CONFIG_EMAIL : (members[0]?.email || "");
  setPanel(`
    <section class="dashHead">
      <div>
        <p class="dashEyebrow">Panel admin</p>
        <h2 class="dashTitle">Configuración de horarios</h2>
        <p class="dashSub">Define el horario semanal de cada miembro y las excepciones por fecha.</p>
      </div>
    </section>
    <section class="filtersBar card">
      <label class="field"><span class="fieldLabel">Miembro</span>
        <select id="cfg-member" class="input">
          ${members.map((m) => `<option value="${escapeHtml(m.email)}" ${m.email === CONFIG_EMAIL ? "selected" : ""}>${escapeHtml(m.name)}</option>`).join("")}
        </select></label>
      <button class="btnGhost btnSmall" type="button" id="cfg-add-override">+ Excepción / cambio de horario</button>
    </section>
    <div id="cfg-body"></div>
  `);
  $("#cfg-member").addEventListener("change", (e) => { CONFIG_EMAIL = e.target.value; renderMemberSettings(); });
  $("#cfg-add-override").addEventListener("click", () => openOverrideModalV2(CONFIG_EMAIL));
  renderMemberSettings();
}

let CONFIG_EMAIL = "";
let OVERRIDES_FILTER = "upcoming";

function targetRowHtml(t) {
  const from = t?.from || "";
  const hours = Number.isFinite(t?.hours) ? t.hours : DEFAULT_WEEKLY_TARGET_HOURS;
  return `<div class="targetRow" data-target-row>
    <label class="field mini"><span class="fieldLabel">Desde (opcional)</span><input type="date" class="input tgt-from" value="${escapeHtml(from)}"></label>
    <label class="field mini"><span class="fieldLabel">Horas/semana</span><input type="number" class="input tgt-hours" min="0" max="60" step="0.5" value="${hours}"></label>
    <button class="btnGhost btnSmall danger tgt-remove" type="button" title="Quitar">✕</button>
  </div>`;
}

function renderMemberSettings() {
  const host = $("#cfg-body");
  if (!host) return;
  const s = MEMBER_SETTINGS[CONFIG_EMAIL] || defaultSettingsFor(CONFIG_EMAIL, { seeded: true });
  const allOverrides = Object.values(SCHEDULE_OVERRIDES).filter((o) => o.email === CONFIG_EMAIL);
  const today = todayBogota();
  const dow = ((parseLocalDateInput(today)?.getDay() ?? 1) + 6) % 7; // 0 = lunes
  const weekStart = addDaysStr(today, -dow);
  const weekEnd = addDaysStr(today, 6 - dow);
  const counts = {
    week: allOverrides.filter((o) => o.date >= weekStart && o.date <= weekEnd).length,
    upcoming: allOverrides.filter((o) => o.date >= today).length,
    past: allOverrides.filter((o) => o.date < today).length,
    all: allOverrides.length,
  };
  let overrides;
  if (OVERRIDES_FILTER === "week") {
    overrides = allOverrides.filter((o) => o.date >= weekStart && o.date <= weekEnd).sort((a, b) => a.date.localeCompare(b.date));
  } else if (OVERRIDES_FILTER === "past") {
    overrides = allOverrides.filter((o) => o.date < today).sort((a, b) => b.date.localeCompare(a.date));
  } else if (OVERRIDES_FILTER === "all") {
    const future = allOverrides.filter((o) => o.date >= today).sort((a, b) => a.date.localeCompare(b.date));
    const past = allOverrides.filter((o) => o.date < today).sort((a, b) => b.date.localeCompare(a.date));
    overrides = [...future, ...past];
  } else {
    overrides = allOverrides.filter((o) => o.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  }
  host.innerHTML = `
    <section class="card cfgCard">
      <div class="cfgHead">
        <div class="formGrid">
          <label class="field"><span class="fieldLabel">Nombre</span><input type="text" id="m-name" class="input" value="${escapeHtml(s.name || "")}"></label>
          <label class="field"><span class="fieldLabel">Correo</span><input type="text" class="input" value="${escapeHtml(s.email)}" disabled></label>
          <label class="field"><span class="fieldLabel">Rol</span>
            <select id="m-role" class="input"><option value="member" ${s.role !== "admin" ? "selected" : ""}>Miembro</option><option value="admin" ${s.role === "admin" ? "selected" : ""}>Admin</option></select></label>
          <label class="field"><span class="fieldLabel">Gracia por defecto (min)</span><input type="number" id="m-grace" class="input" min="0" max="120" value="${s.defaultGraceMinutes}"></label>
        </div>
        <div class="cfgToggles">
          <label class="field checkField"><input type="checkbox" id="m-active" ${s.active ? "checked" : ""}> <span>Miembro activo</span></label>
          <label class="field checkField"><input type="checkbox" id="m-remote" ${s.canWorkRemote ? "checked" : ""}> <span>Puede marcar remoto</span></label>
        </div>
      </div>

      <h3 class="sectionH">Horas semanales (jornada legal)</h3>
      <p class="modalNote">La fila sin fecha aplica desde el inicio. Cada cambio aplica desde su fecha en adelante y se toma el lunes de cada semana como referencia. Ej.: 44h sin fecha y 42h desde el 2025-07-15.</p>
      <div class="targetRows" id="m-targets">
        ${((s.weeklyTargets && s.weeklyTargets.length) ? s.weeklyTargets : [{ from: "", hours: s.weeklyTargetHours }]).map(targetRowHtml).join("")}
      </div>
      <div class="modalActions" style="justify-content:flex-start;margin-top:8px">
        <button class="btnGhost btnSmall" type="button" id="btn-add-target">+ Agregar cambio de jornada</button>
      </div>

      <h3 class="sectionH">Horario semanal</h3>
      <div class="weekGrid">
        ${WEEK_DAYS.map((d) => {
          const day = s.weeklySchedule[d.key];
          return `<div class="dayCard ${day.enabled ? "on" : "off"}" data-day="${d.key}">
            <div class="dayHead">
              <strong>${escapeHtml(d.label)}</strong>
              <label class="switch"><input type="checkbox" class="day-enabled" ${day.enabled ? "checked" : ""}><span></span></label>
            </div>
            <div class="dayFields">
              <label class="field mini"><span class="fieldLabel">Ingreso</span><input type="time" class="input day-start" value="${escapeHtml(day.start)}"></label>
              <label class="field mini"><span class="fieldLabel">Salida</span><input type="time" class="input day-end" value="${escapeHtml(day.end)}"></label>
              <label class="field mini"><span class="fieldLabel">Modalidad</span>
                <select class="input day-modality">${["sede", "remoto", "flexible"].map((m) => `<option value="${m}" ${day.modality === m ? "selected" : ""}>${m}</option>`).join("")}</select></label>
              <label class="field mini"><span class="fieldLabel">Gracia</span><input type="number" class="input day-grace" min="0" max="120" value="${day.graceMinutes}"></label>
            </div>
            <input type="text" class="input day-notes" placeholder="Notas (opcional)" value="${escapeHtml(day.notes || "")}">
          </div>`;
        }).join("")}
      </div>
      <div class="modalActions">
        <button class="btnPrimary" type="button" id="btn-save-settings">Guardar horario</button>
      </div>
    </section>

    <section class="card cfgCard">
      <h3 class="sectionH">Excepciones de horario (${counts.all})</h3>
      <p class="modalNote">Las excepciones aplican a una o varias fechas concretas y tienen prioridad sobre el horario semanal.</p>
      <div class="segGroup ovFilter">
        ${[["week", "Esta semana", counts.week], ["upcoming", "Próximas", counts.upcoming], ["past", "Pasadas", counts.past], ["all", "Todas", counts.all]]
          .map(([v, l, c]) => `<button class="segBtn${OVERRIDES_FILTER === v ? " active" : ""}" type="button" data-ov-filter="${v}">${l} (${c})</button>`).join("")}
      </div>
      ${overrides.length ? `<div class="tableWrap"><table class="dataTable">
        <thead><tr><th>Fecha</th><th>Estado</th><th>Horario</th><th>Modalidad</th><th>Motivo</th><th>Acciones</th></tr></thead>
        <tbody>${overrides.map((o) => `<tr class="${o.date === today ? "rowToday" : (o.date >= weekStart && o.date <= weekEnd ? "rowWeek" : "")}">
          <td data-label="Fecha">${escapeHtml(o.date)}${o.date === today ? ` <span class="badgeChip info">Hoy</span>` : ""}</td>
          <td data-label="Estado">${o.enabled === false ? `<span class="badgeChip muted">Día libre</span>` : `<span class="badgeChip info">Activa</span>`}</td>
          <td data-label="Horario">${o.enabled === false ? "—" : `${escapeHtml(o.start || "")} – ${escapeHtml(o.end || "")}`}</td>
          <td data-label="Modalidad">${escapeHtml(o.modality || "—")}</td>
          <td data-label="Motivo">${escapeHtml(o.reason || "")}</td>
          <td data-label="Acciones"><div class="tableActions">
            <button class="btnGhost btnSmall" type="button" data-edit-override="${escapeHtml(o.id || `${safeEmailId(o.email)}_${o.date}`)}">Editar</button>
            <button class="btnGhost btnSmall danger" type="button" data-delete-override="${escapeHtml(o.id || `${safeEmailId(o.email)}_${o.date}`)}">Eliminar</button>
          </div></td>
        </tr>`).join("")}</tbody></table></div>` : `<div class="emptyState">${counts.all ? "No hay excepciones en este filtro." : "No hay excepciones para este miembro."}</div>`}
    </section>
  `;
  $("#btn-save-settings").addEventListener("click", saveMemberSettings);
  $("#btn-add-target")?.addEventListener("click", () => {
    $("#m-targets")?.insertAdjacentHTML("beforeend", targetRowHtml({ from: "", hours: 42 }));
  });
  $("#m-targets")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".tgt-remove");
    if (!btn) return;
    const rows = $$("[data-target-row]", $("#m-targets"));
    if (rows.length <= 1) { toast("Debe quedar al menos una meta de horas.", { kind: "warn" }); return; }
    btn.closest("[data-target-row]").remove();
  });
  $$("[data-ov-filter]", host).forEach((btn) => btn.addEventListener("click", () => {
    OVERRIDES_FILTER = btn.dataset.ovFilter;
    renderMemberSettings();
  }));
  $$(".day-enabled", host).forEach((chk) => chk.addEventListener("change", (e) => {
    e.target.closest(".dayCard").classList.toggle("on", e.target.checked);
    e.target.closest(".dayCard").classList.toggle("off", !e.target.checked);
  }));
  $$("[data-edit-override]", host).forEach((btn) => btn.addEventListener("click", () => {
    const override = Object.values(SCHEDULE_OVERRIDES).find((o) => o.id === btn.dataset.editOverride);
    if (override) openOverrideModalV2(CONFIG_EMAIL, override);
  }));
  $$("[data-delete-override]", host).forEach((btn) => btn.addEventListener("click", () => deleteScheduleOverride(btn.dataset.deleteOverride)));
}

async function saveMemberSettings() {
  if (!isCurrentUserAdmin()) { toast("No tienes permisos.", { kind: "warn" }); return; }
  const host = $("#cfg-body");
  const weekly = {};
  $$(".dayCard", host).forEach((card) => {
    const key = card.dataset.day;
    weekly[key] = {
      enabled: $(".day-enabled", card).checked,
      start: $(".day-start", card).value || DEFAULT_DAY.start,
      end: $(".day-end", card).value || DEFAULT_DAY.end,
      modality: $(".day-modality", card).value,
      graceMinutes: Number($(".day-grace", card).value) || 0,
      notes: $(".day-notes", card).value.trim()
    };
  });
  const weeklyTargets = [];
  $$("[data-target-row]", host).forEach((row) => {
    const from = $(".tgt-from", row).value;
    const hours = Number($(".tgt-hours", row).value);
    if (hours > 0) weeklyTargets.push({ from: from || "", hours });
  });
  weeklyTargets.sort((a, b) => (a.from || "0000-00-00").localeCompare(b.from || "0000-00-00"));
  const baselineTarget = (weeklyTargets.find((t) => !t.from) || weeklyTargets[0])?.hours || DEFAULT_WEEKLY_TARGET_HOURS;
  const payload = {
    email: CONFIG_EMAIL,
    name: $("#m-name").value.trim(),
    role: $("#m-role").value,
    active: $("#m-active").checked,
    canWorkRemote: $("#m-remote").checked,
    defaultGraceMinutes: Number($("#m-grace").value) || 0,
    weeklyTargetHours: baselineTarget,
    weeklyTargets,
    weekTargetOverrides: MEMBER_SETTINGS[CONFIG_EMAIL]?.weekTargetOverrides || {},
    weeklySchedule: weekly,
    updatedAt: serverTimestamp(),
    updatedAtClient: Date.now(),
    updatedBy: ACTIVE_EMAIL
  };
  if (!confirm("¿Guardar el horario de este miembro?")) return;
  try {
    await setDoc(doc(DB, COLLECTIONS.memberSettings, safeEmailId(CONFIG_EMAIL)), { ...payload, createdAt: serverTimestamp() }, { merge: true });
    MEMBER_SETTINGS[CONFIG_EMAIL] = normalizeSettings(payload);
    toast("Configuración guardada", { kind: "ok" });
    renderMemberSettings();
  } catch (error) {
    console.error(error);
    toast(error?.code === "permission-denied" ? "No tienes permisos para esta acción." : "No se pudo guardar la configuración.", { kind: "warn" });
  }
}

function openOverrideModalV2(email, existingOverride = null) {
  const name = getProfileName(email);
  const editing = Boolean(existingOverride?.date);
  const initialDate = existingOverride?.date || todayBogota();
  const initialEnabled = existingOverride?.enabled !== false;
  const initialWeekday = weekdayKeyForDate(initialDate);
  openModal(editing ? "Editar excepción de horario" : "Nueva excepción de horario", `${name}`, editing ? `Excepción del ${initialDate}` : "Excepción o cambio permanente", `
    <p class="modalNote">Usa excepción para fechas puntuales. Si el horario cambia de ahora en adelante, activa el cambio permanente para actualizar también el horario semanal.</p>
    ${editing ? "" : `<div class="modeToggle" role="tablist" aria-label="Modo de selección de fechas">
      <label class="modeOption"><input type="radio" name="o-mode" value="range" checked> <span>Por rango de fechas</span></label>
      <label class="modeOption"><input type="radio" name="o-mode" value="specific"> <span>Fechas específicas</span></label>
    </div>`}
    <div id="o-range-wrap">
    <div class="formGrid">
      <label class="field"><span class="fieldLabel">Desde</span><input type="date" id="o-date-start" class="input" value="${escapeHtml(initialDate)}" ${editing ? "disabled" : ""}></label>
      <label class="field"><span class="fieldLabel">Hasta</span><input type="date" id="o-date-end" class="input" value="${escapeHtml(initialDate)}" ${editing ? "disabled" : ""}></label>
    </div>
    <div class="weekdayPick" aria-label="Días de la excepción">
      ${WEEK_DAYS.map((d) => `<label class="dayCheck"><input type="checkbox" class="o-weekday" value="${d.key}" ${(editing ? d.key === initialWeekday : true) ? "checked" : ""} ${editing ? "disabled" : ""}><span>${escapeHtml(d.short)}</span></label>`).join("")}
    </div>
    </div>
    ${editing ? "" : `<div id="o-specific-wrap" hidden>
      <div class="specificAdd">
        <input type="date" id="o-specific-date" class="input" value="${escapeHtml(initialDate)}">
        <button class="btnGhost btnSmall" type="button" id="o-specific-add">+ Agregar fecha</button>
      </div>
      <p class="modalNote">Agrega los días sueltos que quieras (ej: este martes, o 3 martes del mes).</p>
      <div class="specificList" id="o-specific-list"></div>
    </div>`}
    <div class="formGrid">
      <label class="field checkField"><input type="checkbox" id="o-enabled" ${initialEnabled ? "checked" : ""}> <span>Trabaja esos días</span></label>
      <label class="field"><span class="fieldLabel">Ingreso</span><input type="time" id="o-start" class="input" value="${escapeHtml(existingOverride?.start || "10:00")}"></label>
      <label class="field"><span class="fieldLabel">Salida</span><input type="time" id="o-end" class="input" value="${escapeHtml(existingOverride?.end || "16:00")}"></label>
      <label class="field"><span class="fieldLabel">Modalidad</span>
        <select id="o-modality" class="input">${["sede", "remoto", "flexible"].map((m) => `<option value="${m}" ${(existingOverride?.modality || "sede") === m ? "selected" : ""}>${m}</option>`).join("")}</select></label>
      <label class="field"><span class="fieldLabel">Gracia (min)</span><input type="number" id="o-grace" class="input" min="0" max="120" value="${Number.isFinite(existingOverride?.graceMinutes) ? existingOverride.graceMinutes : 5}"></label>
    </div>
    <label class="field checkField permanentCheck"><input type="checkbox" id="o-permanent" ${editing ? "disabled" : ""}> <span>Este es el nuevo horario permanente desde ahora</span></label>
    <label class="field"><span class="fieldLabel">Motivo</span><input type="text" id="o-reason" class="input" placeholder="Ej: reunión externa autorizada" value="${escapeHtml(existingOverride?.reason || "")}"></label>
    <div class="modalActions"><button class="btnGhost" type="button" id="o-cancel">Cancelar</button><button class="btnPrimary" type="button" id="o-save">${editing ? "Guardar edicion" : "Guardar cambio"}</button></div>
  `);
  $("#o-cancel").addEventListener("click", closeModal);

  // Modo de selección: rango (por defecto) o fechas específicas
  const specificDates = new Set();
  const getMode = () => (document.querySelector('input[name="o-mode"]:checked')?.value || "range");
  const renderSpecificList = () => {
    const list = $("#o-specific-list");
    if (!list) return;
    const arr = Array.from(specificDates).sort();
    list.innerHTML = arr.length
      ? arr.map((d) => `<span class="dateChip" data-date="${d}">${escapeHtml(formatLongDate(d) || d)} <button type="button" class="dateChipX" data-date="${d}" aria-label="Quitar">×</button></span>`).join("")
      : `<span class="modalNote">Aún no agregaste fechas.</span>`;
    $$(".dateChipX", list).forEach((btn) => btn.addEventListener("click", () => { specificDates.delete(btn.dataset.date); renderSpecificList(); }));
  };
  const syncMode = () => {
    const specific = getMode() === "specific";
    const rangeWrap = $("#o-range-wrap");
    const specWrap = $("#o-specific-wrap");
    if (rangeWrap) rangeWrap.hidden = specific;
    if (specWrap) specWrap.hidden = !specific;
  };
  $$('input[name="o-mode"]').forEach((r) => r.addEventListener("change", syncMode));
  if ($("#o-specific-add")) {
    $("#o-specific-add").addEventListener("click", () => {
      const v = $("#o-specific-date").value;
      if (!v) { toast("Elige una fecha para agregar.", { kind: "warn" }); return; }
      specificDates.add(v);
      renderSpecificList();
    });
    renderSpecificList();
  }
  syncMode();

  const syncEnabledFields = () => {
    const enabled = $("#o-enabled").checked;
    ["#o-start", "#o-end", "#o-modality", "#o-grace"].forEach((sel) => {
      const el = $(sel);
      if (el) el.disabled = !enabled;
    });
    $("#o-permanent").disabled = !enabled;
    if (!enabled) $("#o-permanent").checked = false;
  };
  $("#o-enabled").addEventListener("change", syncEnabledFields);
  syncEnabledFields();
  $("#o-save").addEventListener("click", async () => {
    const mode = editing ? "range" : getMode();
    let startDate, endDate, dates, allowedDays;
    if (mode === "specific") {
      dates = Array.from(specificDates).sort();
      if (!dates.length) { toast("Agrega al menos una fecha.", { kind: "warn" }); return; }
      startDate = dates[0];
      endDate = dates[dates.length - 1];
      allowedDays = new Set(dates.map(weekdayKeyForDate));
    } else {
      startDate = editing ? initialDate : $("#o-date-start").value;
      endDate = editing ? initialDate : ($("#o-date-end").value || startDate);
      allowedDays = new Set($$(".o-weekday:checked").map((el) => el.value));
      dates = dateRangeList(startDate, endDate).filter((date) => allowedDays.has(weekdayKeyForDate(date)));
      if (!startDate || !endDate) { toast("Indica fecha inicial y final.", { kind: "warn" }); return; }
      if (!dates.length) { toast("No hay fechas seleccionadas para guardar.", { kind: "warn" }); return; }
    }
    const enabled = $("#o-enabled").checked;
    const start = $("#o-start").value || DEFAULT_DAY.start;
    const end = $("#o-end").value || DEFAULT_DAY.end;
    const modality = $("#o-modality").value;
    const graceMinutes = Number($("#o-grace").value) || 0;
    const reason = $("#o-reason").value.trim();
    const permanent = enabled && $("#o-permanent").checked;
    const permanentDays = Array.from(new Set(dates.map(weekdayKeyForDate)));
    if (!confirm(editing ? `Guardar cambios en la excepción del ${initialDate}?` : `Guardar este cambio para ${dates.length} fecha${dates.length === 1 ? "" : "s"}${permanent ? " y actualizar el horario semanal" : ""}?`)) return;
    try {
      for (const date of dates) {
        const payload = {
          email, date, enabled, start, end, modality, graceMinutes, reason,
          rangeStart: startDate, rangeEnd: endDate, weekdays: Array.from(allowedDays),
          createdBy: ACTIVE_EMAIL, createdAt: serverTimestamp(), createdAtClient: Date.now()
        };
        const id = `${safeEmailId(email)}_${date}`;
        await setDoc(doc(DB, COLLECTIONS.scheduleOverrides, id), payload, { merge: true });
        SCHEDULE_OVERRIDES[`${email}__${date}`] = normalizeOverride(id, payload);
      }
      if (permanent) {
        const current = MEMBER_SETTINGS[email] || defaultSettingsFor(email, { seeded: true });
        const weeklySchedule = JSON.parse(JSON.stringify(current.weeklySchedule || defaultWeeklySchedule()));
        permanentDays.forEach((dayKey) => {
          weeklySchedule[dayKey] = { ...(weeklySchedule[dayKey] || DEFAULT_DAY), enabled: true, start, end, modality, graceMinutes, notes: reason };
        });
        const settingsPayload = {
          ...current,
          weeklySchedule,
          updatedAt: serverTimestamp(),
          updatedAtClient: Date.now(),
          updatedBy: ACTIVE_EMAIL
        };
        await setDoc(doc(DB, COLLECTIONS.memberSettings, safeEmailId(email)), { ...settingsPayload, createdAt: serverTimestamp() }, { merge: true });
        MEMBER_SETTINGS[email] = normalizeSettings(settingsPayload);
      }
      toast(permanent ? "Horario permanente y excepciones guardados" : "Excepción guardada", { kind: "ok" });
      await closeModal();
      renderMemberSettings();
    } catch (error) {
      console.error(error);
      toast(error?.code === "permission-denied" ? "No tienes permisos para esta acción." : "No se pudo guardar el cambio.", { kind: "warn" });
    }
  });
}

async function deleteScheduleOverride(id) {
  if (!isCurrentUserAdmin()) { toast("No tienes permisos.", { kind: "warn" }); return; }
  const override = Object.values(SCHEDULE_OVERRIDES).find((o) => o.id === id);
  if (!override) { toast("No se encontró la excepción.", { kind: "warn" }); return; }
  if (!confirm(`Eliminar la excepción del ${override.date}?`)) return;
  try {
    await deleteDoc(doc(DB, COLLECTIONS.scheduleOverrides, id));
    delete SCHEDULE_OVERRIDES[`${override.email}__${override.date}`];
    toast("Excepción eliminada", { kind: "ok" });
    renderMemberSettings();
  } catch (error) {
    console.error(error);
    toast(error?.code === "permission-denied" ? "No tienes permisos para eliminar esta excepción." : "No se pudo eliminar la excepción.", { kind: "warn" });
  }
}

function openOverrideModal(email) {
  const name = getProfileName(email);
  openModal("Nueva excepción de horario", `${name}`, "Excepción por fecha", `
    <p class="modalNote">Define un horario distinto para una fecha concreta. No cambia el horario semanal.</p>
    <div class="formGrid">
      <label class="field"><span class="fieldLabel">Fecha</span><input type="date" id="o-date" class="input" value="${todayBogota()}"></label>
      <label class="field checkField"><input type="checkbox" id="o-enabled" checked> <span>Trabaja ese día</span></label>
      <label class="field"><span class="fieldLabel">Ingreso</span><input type="time" id="o-start" class="input" value="10:00"></label>
      <label class="field"><span class="fieldLabel">Salida</span><input type="time" id="o-end" class="input" value="16:00"></label>
      <label class="field"><span class="fieldLabel">Modalidad</span>
        <select id="o-modality" class="input">${["sede", "remoto", "flexible"].map((m) => `<option value="${m}">${m}</option>`).join("")}</select></label>
      <label class="field"><span class="fieldLabel">Gracia (min)</span><input type="number" id="o-grace" class="input" min="0" max="120" value="5"></label>
    </div>
    <label class="field"><span class="fieldLabel">Motivo</span><input type="text" id="o-reason" class="input" placeholder="Ej: reunión externa autorizada"></label>
    <div class="modalActions"><button class="btnGhost" type="button" id="o-cancel">Cancelar</button><button class="btnPrimary" type="button" id="o-save">Crear excepción</button></div>
  `);
  $("#o-cancel").addEventListener("click", closeModal);
  $("#o-save").addEventListener("click", async () => {
    const date = $("#o-date").value;
    if (!date) { toast("Indica la fecha.", { kind: "warn" }); return; }
    const payload = {
      email, date, enabled: $("#o-enabled").checked,
      start: $("#o-start").value, end: $("#o-end").value,
      modality: $("#o-modality").value, graceMinutes: Number($("#o-grace").value) || 0,
      reason: $("#o-reason").value.trim(), createdBy: ACTIVE_EMAIL, createdAt: serverTimestamp(), createdAtClient: Date.now()
    };
    if (!confirm("¿Crear esta excepción de horario?")) return;
    try {
      const id = `${safeEmailId(email)}_${date}`;
      await setDoc(doc(DB, COLLECTIONS.scheduleOverrides, id), payload, { merge: true });
      SCHEDULE_OVERRIDES[`${email}__${date}`] = { id, ...payload };
      toast("Excepción creada", { kind: "ok" });
      await closeModal();
      renderMemberSettings();
    } catch (error) {
      console.error(error);
      toast(error?.code === "permission-denied" ? "No tienes permisos para esta acción." : "No se pudo crear la excepción.", { kind: "warn" });
    }
  });
}

/* ==========================================================================
   6f. Vista: Equipo — admin
========================================================================== */
async function renderTeamTab() {
  if (!isCurrentUserAdmin()) { toast("Sección solo para administradores.", { kind: "warn" }); return goTab("inicio"); }
  await loadAdminData({ force: true }).catch(() => {});
  const members = adminMemberList();
  setPanel(`
    <section class="dashHead">
      <div>
        <p class="dashEyebrow">Panel admin</p>
        <h2 class="dashTitle">Equipo</h2>
        <p class="dashSub">Miembros, roles, modalidad y horario configurado.</p>
      </div>
    </section>
    <section class="teamGrid">
      ${members.map((m) => {
        const s = m.settings;
        const days = WEEK_DAYS.filter((d) => s.weeklySchedule[d.key]?.enabled);
        const hasSchedule = days.length > 0;
        return `<div class="memberCard card">
          <div class="memberTop">
            <div class="memberAvatar">${escapeHtml((m.name || "?").slice(0, 1).toUpperCase())}</div>
            <div class="memberId">
              <strong>${escapeHtml(m.name)}</strong>
              <small>${escapeHtml(m.email)}</small>
            </div>
            ${isAdminEmail(m.email) ? `<span class="badgeChip info memberRole">Admin</span>` : `<span class="badgeChip muted memberRole">Miembro</span>`}
          </div>
          <div class="memberMeta">
            <span class="badgeChip ${s.active ? "ok" : "muted"}">${s.active ? "Activo" : "Inactivo"}</span>
            <span class="badgeChip ${s.canWorkRemote ? "info" : "muted"}">${s.canWorkRemote ? "Remoto ✓" : "Solo sede"}</span>
          </div>
          ${hasSchedule
            ? `<div class="memberDays">${days.map((d) => `<span class="dayPill">${d.short} ${escapeHtml(s.weeklySchedule[d.key].start)}</span>`).join("")}</div>`
            : `<div class="emptyState small">Este miembro no tiene horario configurado.</div>`}
          <button class="btnGhost btnSmall" type="button" data-config="${escapeHtml(m.email)}">Configurar horario</button>
        </div>`;
      }).join("")}
    </section>
  `);
  $$("[data-config]", panel()).forEach((b) => b.addEventListener("click", () => { CONFIG_EMAIL = b.dataset.config; goTab("config"); }));
}

/* ==========================================================================
   8. Auth + mount
========================================================================== */
function friendlyAuthError(code = "") {
  if (code === "auth/unauthorized-domain") return "Esta dirección de la app no está habilitada para iniciar sesión.";
  if (code === "auth/popup-blocked") return "El navegador bloqueo la ventana de Google.";
  if (code === "auth/popup-closed-by-user") return "Cerraste el login.";
  if (code === "auth/network-request-failed") return "Fallo la red.";
  return "";
}

async function doGoogleLogin(auth) {
  if (loginLock) return;
  loginLock = true;
  const btn = $("#btn-google");
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    if (btn) { btn.disabled = true; btn.dataset.originalHtml = btn.innerHTML; btn.textContent = "Abriendo Google..."; }
    await setPersistence(auth, browserLocalPersistence);
    try { await signInWithPopup(auth, provider); }
    catch (popupError) {
      if (popupError?.code === "auth/popup-closed-by-user") return;
      const shouldTryRedirect = ["auth/popup-blocked", "auth/cancelled-popup-request", "auth/operation-not-supported-in-this-environment"].includes(popupError?.code);
      if (!shouldTryRedirect && !isStandalone()) throw popupError;
      toast("Te vamos a llevar a Google para iniciar sesión.", { ms: 2400 });
      await signInWithRedirect(auth, provider);
    }
  } catch (error) {
    if (error?.code === "auth/popup-closed-by-user") return;
    const friendly = friendlyAuthError(error?.code || "");
    toast(friendly ? `No se pudo iniciar sesión: ${friendly}` : "No se pudo iniciar sesión");
    console.error(error);
  } finally {
    loginLock = false;
    if (btn) { btn.disabled = false; btn.innerHTML = btn.dataset.originalHtml || `<span class="gIcon" aria-hidden="true">G</span> Entrar con Google`; }
  }
}

async function finalizeRedirectIfAny(auth) {
  try { await getRedirectResult(auth); }
  catch (error) {
    const friendly = friendlyAuthError(error?.code || "");
    toast(friendly ? `No se pudo completar el inicio de sesión: ${friendly}` : "No se pudo completar el inicio de sesión");
  }
}

function assertConfig(cfg) { return Boolean(cfg?.apiKey && cfg?.authDomain && cfg?.projectId && cfg?.appId); }

function setHubCopy() {
  document.title = HUB.name;
  $(".brandTitle") && ($(".brandTitle").textContent = "Musicala");
  $(".brandSub") && ($(".brandSub").textContent = HUB.subtitle);
  $(".appTitle") && ($(".appTitle").textContent = HUB.name);
}

async function mount() {
  setHubCopy();
  if (!assertConfig(firebaseConfig)) { show("login"); toast("No se pudo cargar la configuración de la app. Intenta más tarde."); return; }
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  AUTH = auth; DB = db;
  await setPersistence(auth, browserLocalPersistence).catch(() => null);
  await finalizeRedirectIfAny(auth);

  $("#btn-google")?.addEventListener("click", () => doGoogleLogin(auth));
  $("#btn-refresh-app")?.addEventListener("click", clearLocalAppCacheAndReload);
  $("#btn-logout")?.addEventListener("click", async () => {
    try { await signOut(auth); show("login"); toast("Sesión cerrada"); }
    catch (_) { toast("No se pudo cerrar sesión. Intenta de nuevo."); }
  });

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      ACTIVE_USER = null; ACTIVE_EMAIL = ""; ACTIVE_PROFILE = null; ACTIVE_LINKS = {};
      MEMBER_SETTINGS = {}; SCHEDULE_OVERRIDES = {}; DATA_LOADED = false;
      await closeModal(); show("login"); return;
    }
    const email = emailKey(user);
    if (HUB.USERS && Object.keys(HUB.USERS).length && !HUB.USERS[email]) {
      toast("Tu correo no esta autorizado para este hub");
      await signOut(auth).catch(() => null); show("login"); return;
    }
    ACTIVE_USER = user; ACTIVE_EMAIL = email;
    ACTIVE_PROFILE = HUB.USERS?.[email] || null;
    ACTIVE_LINKS = buildLinksForUser(email);
    DATA_LOADED = false;
    $("#user-line") && ($("#user-line").textContent = `${getProfileName()}${isCurrentUserAdmin() ? " · Admin" : ""} · v${BUILD}`);
    show("app");
    await loadAdminData().catch(() => {});
    CURRENT_TAB = "inicio";
    renderNav();
    goTab("inicio");
  });
}

document.addEventListener("DOMContentLoaded", () => {
  console.log("BUILD", BUILD);
  registerServiceWorker();
  setupInstallPrompt();
  mount();
});
