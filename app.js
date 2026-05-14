/* Musicala Admin Hub
   - Login con Google (Firebase Auth)
   - Hub exclusivo para administrativos
   - Registro de jornada interno con lector QR + Firestore
*/
const BUILD = "2026-05-14.1";

const firebaseConfig = {
  apiKey: "AIzaSyCsXw0N_GkdwYMkdfZ_H2XIBNeTpGFn_rg",
  authDomain: "musicala-admin-hub.firebaseapp.com",
  projectId: "musicala-admin-hub",
  storageBucket: "musicala-admin-hub.firebasestorage.app",
  messagingSenderId: "468927778540",
  appId: "1:468927778540:web:619daeb67ff0287d92dfc9"
};

const HUB = {
  name: "Musicala Admin Hub",
  subtitle: "Centro administrativo",
  GENERAL_LINKS: {
    nomina: "https://docs.google.com/forms/d/e/1FAIpQLSeMOhoY9d8JOf1Oq8DnD_aSEDkBmOXmzYJtlCCU-7CNVYjnLA/viewform",
    apertura: "https://musicala.github.io/protocolodeapertura/",
    reglamento: "https://drive.google.com/file/d/1Oda0c_FnHrsgME2GE8LCb7z5huH-YbBk/view",
    jornada: "__INTERNAL_SHIFT__",
    registrosJornada: "__INTERNAL_RECORDS__"
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
  BUTTONS: [
    { id: "jornada", icon: "⏱️", title: "Registro de jornada", subtitle: "Sede QR o remoto", section: "Operacion diaria" },
    { id: "registrosJornada", icon: "📊", title: "Llegadas registradas", subtitle: "Ver historial", section: "Operacion diaria" },
    { id: "nomina", icon: "💰", title: "Novedades nomina", subtitle: "General", section: "Administracion" },
    { id: "apertura", icon: "🔑", title: "Protocolo de apertura", subtitle: "General", section: "Administracion" },
    { id: "horario", icon: "🗓️", title: "Horario anual", subtitle: "Personal", section: "Personal" },
    { id: "documentos", icon: "📁", title: "Documentos", subtitle: "Personal", section: "Personal" },
    { id: "reglamento", icon: "📜", title: "Reglamento interno de trabajo", subtitle: "General", section: "Administracion" }
  ]
};

const COLLECTIONS = {
  shiftRecords: "adminShiftRecords"
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
  const { actionText = "", onAction = null, sticky = false, ms = 2800 } = opts;
  el.classList.remove("show");
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
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9@._+\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function prettyName(user, fallbackEmail = "") {
  return user?.displayName || fallbackEmail || "Sesion activa";
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

function getProfileName() {
  return ACTIVE_PROFILE?.label || prettyName(ACTIVE_USER, ACTIVE_EMAIL);
}

function canCurrentUserMarkRemote() {
  const current = [
    ACTIVE_EMAIL,
    getProfileName(),
    ACTIVE_USER?.displayName
  ].map(normalizeIdentity).filter(Boolean);
  return REMOTE_WORK_ALLOWED_USERS
    .map(normalizeIdentity)
    .some((allowed) => current.includes(allowed));
}

function remoteNotAllowedMessage() {
  return "La marcacion desde casa no esta habilitada para tu usuario. Por favor marca tu ingreso en la sede con el codigo QR.";
}

function getBogotaParts(date = new Date()) {
  const dateFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHIFT.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const timeFmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: SHIFT.timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  return { date: dateFmt.format(date), time: timeFmt.format(date).slice(0, 5) };
}

function formatDateTime(iso) {
  if (!iso) return "-";
  try {
    return new Intl.DateTimeFormat("es-CO", {
      timeZone: SHIFT.timezone,
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(iso));
  } catch (_) {
    return iso;
  }
}

function formatShiftMode(mode, source) {
  if (mode === "presencial" && source === "qr") return "Presencial QR";
  if (mode === "remoto" && source === "manual_remote") return "Remoto manual";
  if (mode === "presencial") return "Presencial";
  if (mode === "remoto") return "Remoto";
  return "-";
}

function detectShiftType(rawText) {
  const raw = String(rawText || "").toUpperCase();
  if (raw.includes("SALIDA") || raw.includes("ADM-SALIDA") || raw.includes("OUT") || raw.includes("CHECKOUT")) return "salida";
  if (raw.includes("LLEGADA") || raw.includes("ADM-LLEGADA") || raw.includes("INGRESO") || raw.includes("ENTRADA") || raw.includes("IN") || raw.includes("CHECKIN")) return "ingreso";
  return "";
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent || "");
}

function isStandalone() {
  return Boolean(window.navigator.standalone) || window.matchMedia?.("(display-mode: standalone)").matches;
}

function setInstallUI(visible) {
  ["btn-install", "btn-install-2"].forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) btn.hidden = !visible;
  });
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const promptUpdate = (reg) => {
    if (!reg?.waiting) return;
    reg.waiting.postMessage({ type: "SKIP_WAITING" });
  };
  try {
    const swUrl = `./sw.js?v=${encodeURIComponent(BUILD)}`;
    const reg = await navigator.serviceWorker.register(swUrl, {
      scope: "./",
      updateViaCache: "none"
    });
    promptUpdate(reg);
    reg.addEventListener("updatefound", () => {
      const sw = reg.installing;
      sw?.addEventListener("statechange", () => {
        if (sw.state === "installed" && navigator.serviceWorker.controller) promptUpdate(reg);
      });
    });
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "SW_ACTIVATED") {
        console.log("SW_ACTIVATED", event.data.version);
      }
    });
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (window.__reloadingForSW) return;
      window.__reloadingForSW = true;
      window.location.reload();
    });
    reg.update?.().catch(() => null);
  } catch (error) {
    console.warn("No se pudo preparar la app para uso sin conexion", error);
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
  if (isStandalone()) {
    setInstallUI(false);
    return;
  }
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
    if (isIOS() && !__deferredInstallPrompt) {
      toast("En iPhone/iPad: Compartir > Agregar a pantalla de inicio");
      return;
    }
    if (!__deferredInstallPrompt) {
      toast("Instalacion no disponible todavia");
      return;
    }
    __deferredInstallPrompt.prompt();
    await __deferredInstallPrompt.userChoice.catch(() => null);
    __deferredInstallPrompt = null;
  };
  $("#btn-install")?.addEventListener("click", onInstallClick);
  $("#btn-install-2")?.addEventListener("click", onInstallClick);
}

function renderHero() {
  let hero = $("#admin-hero");
  if (hero) return;
  const top = $(".top");
  if (!top) return;
  hero = document.createElement("section");
  hero.id = "admin-hero";
  hero.className = "workspaceHero";
  hero.innerHTML = `
    <div class="heroIntro">
      <p class="heroEyebrow">Inicio de hoy</p>
      <h3 class="heroTitle">Administracion Musicala</h3>
      <p class="heroText">Marca jornada, revisa accesos administrativos y conserva los documentos clave en un solo lugar.</p>
    </div>
    <div class="heroFocus">
      <div class="heroFocusLabel">Jornada</div>
      <div class="heroFocusTitle" id="hero-shift-title">Marca tu jornada</div>
      <p class="heroFocusText" id="hero-shift-subtitle">${canCurrentUserMarkRemote() ? "Escanea QR si estas en sede o marca manualmente si trabajas remoto." : "Escanea el QR en sede para registrar tu ingreso o salida."}</p>
      <div class="heroActions">
        <button class="btnPrimary" type="button" data-hero-action="jornada">Marcar jornada</button>
        <button class="btnGhost" type="button" data-hero-action="registrosJornada">Ver registros</button>
      </div>
    </div>
  `;
  top.insertAdjacentElement("afterend", hero);
  hero.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-hero-action]");
    if (btn) triggerAccess(btn.dataset.heroAction);
  });
}

function renderButtons(buttons, links) {
  const grid = $("#grid");
  if (!grid) return;
  ACTIVE_LINKS = links || {};
  const sections = new Map();
  for (const button of buttons || []) {
    const section = button.section || "General";
    if (!sections.has(section)) sections.set(section, []);
    sections.get(section).push(button);
  }
  grid.innerHTML = Array.from(sections.entries()).map(([section, items]) => `
    <div class="gridSection">
      <div class="sectionTitle">${escapeHtml(section)}</div>
      <div class="sectionGrid">
        ${items.map((b) => {
          const url = String(ACTIVE_LINKS[b.id] || "").trim();
          const internal = url.startsWith("__INTERNAL_");
          const pending = !url;
          const badgeText = pending ? "Pendiente" : (internal ? "Abrir" : "Abrir");
          return `
            <button class="tile${pending ? " pending" : ""}" type="button" data-id="${escapeHtml(b.id)}" aria-label="${escapeHtml(b.title)}">
              <div class="tileTop">
                <div class="ico" aria-hidden="true">${escapeHtml(b.icon)}</div>
                <span class="badge${pending ? "" : " ok"}">${badgeText}</span>
              </div>
              <div class="tileText">
                <div class="tTitle">${escapeHtml(b.title)}</div>
                <div class="tSub">${escapeHtml(b.subtitle)}</div>
              </div>
            </button>
          `;
        }).join("")}
      </div>
    </div>
  `).join("");

  if (!grid.__boundClick) {
    grid.__boundClick = true;
    grid.addEventListener("click", (event) => {
      const btn = event.target.closest("button[data-id]");
      if (btn) triggerAccess(btn.getAttribute("data-id"));
    });
  }
}

function triggerAccess(id) {
  const url = String(ACTIVE_LINKS[id] || "").trim();
  if (id === "jornada" || url === "__INTERNAL_SHIFT__") {
    openShiftModal();
    return;
  }
  if (id === "registrosJornada" || url === "__INTERNAL_RECORDS__") {
    openRecordsModal();
    return;
  }
  if (!url) {
    toast(`Pendiente: falta pegar el link de "${id}"`);
    return;
  }
  const safeUrl = /^(https?:)?\/\//i.test(url) ? url : `https://${url}`;
  window.open(safeUrl, "_blank", "noopener,noreferrer");
}

function ensureModal() {
  let overlay = $("#modal-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "modal-overlay";
    overlay.className = "drawerOverlay";
    overlay.hidden = true;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", closeModal);
  }
  let modal = $("#modal-workspace");
  if (!modal) {
    modal = document.createElement("section");
    modal.id = "modal-workspace";
    modal.className = "modal modalWide";
    modal.hidden = true;
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
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
        <div class="modalBody workspaceBody">
          <div id="workspace-content"></div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    $("#btn-workspace-close", modal)?.addEventListener("click", closeModal);
  }
  return modal;
}

async function closeModal() {
  await stopQrScanner();
  const modal = $("#modal-workspace");
  const overlay = $("#modal-overlay");
  if (modal) modal.hidden = true;
  if (overlay) overlay.hidden = true;
}

function setModalCopy(title, subtitle, eyebrow = "Modulo interno") {
  ensureModal();
  $("#workspace-title").textContent = title;
  $("#workspace-subtitle").textContent = subtitle;
  $("#workspace-eyebrow").textContent = eyebrow;
  $("#modal-overlay").hidden = false;
  $("#modal-workspace").hidden = false;
}

function insecureContextMsg() {
  return !window.isSecureContext
    ? "La camara necesita HTTPS o localhost. En GitHub Pages funciona con HTTPS."
    : "";
}

async function listVideoInputs() {
  if (window.Html5Qrcode?.getCameras) {
    const cams = await window.Html5Qrcode.getCameras();
    return cams.map((cam) => ({ id: cam.id || cam.deviceId, label: cam.label || "Camara" }));
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === "videoinput").map((d) => ({ id: d.deviceId, label: d.label || "Camara" }));
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
  if (!devices.length) {
    if (result) result.textContent = insecureContextMsg() || "No se detectaron camaras. Revisa permisos.";
    return;
  }
  for (const [index, device] of devices.entries()) {
    const opt = document.createElement("option");
    opt.value = device.id;
    opt.textContent = device.label || `Camara ${index + 1}`;
    select.appendChild(opt);
  }
  currentCameraId = currentCameraId && devices.some((d) => d.id === currentCameraId)
    ? currentCameraId
    : pickBestCameraId(devices);
  select.value = currentCameraId;
}

async function requestPermissionsAndRefresh() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    stream.getTracks().forEach((track) => track.stop());
  } catch (_) {
    const result = $("#shift-result");
    if (result) result.textContent = insecureContextMsg() || "Concede permiso a la camara en el navegador.";
  } finally {
    await populateCameras();
  }
}

async function openShiftModal() {
  const remoteAllowed = canCurrentUserMarkRemote();
  setModalCopy(
    "Registro de jornada",
    remoteAllowed ? "Escanea QR si estas en sede o marca manualmente si trabajas remoto." : "Para este usuario la jornada se marca desde sede con QR.",
    "Operacion diaria"
  );
  $("#workspace-content").innerHTML = `
    <section class="shiftTool">
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
          <strong>Estoy en sede &middot; Escanear QR</strong>
          <small>Escanear QR de ingreso o salida</small>
        </button>
        <button id="btnRemoteMode" class="shiftModeCard remote${remoteAllowed ? "" : " locked"}" type="button" aria-disabled="${remoteAllowed ? "false" : "true"}">
          <span class="modeKicker">Jornada remota</span>
          <strong>Estoy trabajando remoto</strong>
          <small>${remoteAllowed ? "Marcar inicio o cierre de jornada manualmente" : "Disponible solo para usuarios autorizados"}</small>
        </button>
      </div>
      <div id="shift-mode-view"></div>
      <div id="today-summary" class="summaryBox"></div>
    </section>
  `;
  wireShiftModeControls();
  await renderTodaySummary();
}

function wireShiftModeControls() {
  $("#btnOnSiteMode")?.addEventListener("click", renderOnSiteShiftView);
  $("#btnRemoteMode")?.addEventListener("click", async () => {
    if (!canCurrentUserMarkRemote()) {
      toast(remoteNotAllowedMessage(), { ms: 4200 });
      renderOnSiteShiftView();
      return;
    }
    await stopQrScanner();
    renderRemoteShiftView();
  });
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
        <label class="field">
          <span class="fieldLabel">Camara</span>
          <select id="cameraSelect" class="input"></select>
        </label>
        <button id="btnPerms" class="btnGhost" type="button">Permitir/Actualizar</button>
        <button id="btnFlip" class="btnGhost" type="button">Voltear</button>
      </div>
      <div class="qrActions">
        <button id="btnStart" class="btnPrimary" type="button">Iniciar camara</button>
        <button id="btnStop" class="btnGhost" type="button" disabled>Detener</button>
      </div>
      <div id="reader" class="reader"></div>
      <div class="resultPanel">
        <div class="panelTitle">Ultimo resultado</div>
        <div id="shift-result" class="result">Apunta la camara al codigo QR de la sede.</div>
      </div>
    </section>
  `;
  wireShiftControls();
  populateCameras().catch(() => {
    $("#shift-result").textContent = insecureContextMsg() || "Error listando camaras.";
  });
}

function renderRemoteShiftView() {
  if (!canCurrentUserMarkRemote()) {
    toast(remoteNotAllowedMessage(), { ms: 4200 });
    renderOnSiteShiftView();
    return;
  }
  const now = new Date();
  const parts = getBogotaParts(now);
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
  if (error?.code === "permission-denied") {
    return "No se pudo guardar: este correo no tiene permiso de escritura en Firestore. Revisa que el correo autorizado sea exactamente el mismo con el que se inicio sesion.";
  }
  if (error?.code === "unavailable" || error?.code === "deadline-exceeded") {
    return "No se pudo guardar por conexion inestable. Intenta de nuevo cuando el celular tenga buena señal.";
  }
  return "No se pudo guardar tu marcacion. Revisa tu conexion e intenta de nuevo.";
}

async function markRemoteShift(type) {
  if (submitLock) return;
  if (!canCurrentUserMarkRemote()) {
    toast(remoteNotAllowedMessage(), { ms: 4200 });
    return;
  }
  const actionText = type === "ingreso" ? "iniciando" : "cerrando";
  const confirmed = confirm(`Confirmas que estas ${actionText} tu jornada remota en este momento?`);
  if (!confirmed) return;
  submitLock = true;
  const result = $("#remote-result");
  try {
    const now = new Date();
    const parts = getBogotaParts(now);
    if (result) result.textContent = "Guardando tu marcacion...";
    await saveShiftRecord({
      type,
      raw: "REMOTE_MANUAL",
      mode: "remoto",
      source: "manual_remote",
      date: parts.date,
      time: parts.time,
      stamp: now.toISOString()
    });
    if (result) result.textContent = `${type === "ingreso" ? "Ingreso" : "Salida"} remoto registrado: ${parts.date} ${parts.time}`;
    toast("Jornada remota registrada");
    renderRemoteShiftView();
    await renderTodaySummary();
  } catch (error) {
    if (error?.message !== "cancelled") console.error(error);
    if (result) result.textContent = friendlySaveError(error);
  } finally {
    submitLock = false;
  }
}

function wireShiftControls() {
  $("#cameraSelect")?.addEventListener("change", (event) => {
    currentCameraId = event.target.value;
  });
  $("#btnPerms")?.addEventListener("click", requestPermissionsAndRefresh);
  $("#btnStart")?.addEventListener("click", startQrScanner);
  $("#btnStop")?.addEventListener("click", stopQrScanner);
  $("#btnFlip")?.addEventListener("click", async () => {
    const options = $$("#cameraSelect option").map((opt) => opt.value);
    if (options.length < 2) {
      $("#shift-result").textContent = "No encontramos otra camara disponible en este dispositivo.";
      return;
    }
    const nextId = options[(options.indexOf(currentCameraId) + 1) % options.length];
    currentCameraId = nextId;
    $("#cameraSelect").value = nextId;
    if (qrReader?.isScanning) {
      await stopQrScanner();
      await startQrScanner();
    }
  });
}

async function startQrScanner() {
  const result = $("#shift-result");
  if (!window.Html5Qrcode) {
    result.textContent = "No se pudo abrir el lector de QR. Revisa tu conexion a internet e intenta de nuevo.";
    return;
  }
  try {
    if (!currentCameraId) await populateCameras();
    if (qrReader) await qrReader.stop().catch(() => null);
    qrReader = new window.Html5Qrcode("reader");
    try {
      await qrReader.start(
        { deviceId: { exact: currentCameraId } },
        { fps: 10, qrbox: (vw, vh) => ({ width: Math.min(vw, vh) * 0.72, height: Math.min(vw, vh) * 0.72 }) },
        onScanSuccess,
        () => {}
      );
    } catch (_) {
      await qrReader.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: (vw, vh) => ({ width: Math.min(vw, vh) * 0.72, height: Math.min(vw, vh) * 0.72 }) },
        onScanSuccess,
        () => {}
      );
    }
    $("#btnStart").disabled = true;
    $("#btnStop").disabled = false;
    result.textContent = "Camara activa. Acerca el codigo QR al recuadro.";
  } catch (error) {
    console.error(error);
    result.textContent = insecureContextMsg() || "No pudimos abrir la camara. Revisa el permiso de camara o cierra otras apps que la esten usando.";
  }
}

async function stopQrScanner() {
  if (!qrReader) return;
  try {
    if (qrReader.isScanning) await qrReader.stop();
    await qrReader.clear();
  } catch (_) {}
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
    if (!type) {
      result.textContent = "Este codigo QR no corresponde a la marcacion de jornada. Por favor usa el QR de entrada o salida de la sede.";
      return;
    }
    const now = new Date();
    const parts = getBogotaParts(now);
    const secondsSinceLastOk = (Date.now() - lastQrSaveOkAt) / 1000;
    if (secondsSinceLastOk < 8) {
      result.textContent = "Ya acabamos de guardar una marcacion. Espera unos segundos antes de escanear otra vez.";
      return;
    }
    result.textContent = `Registrando ${type === "ingreso" ? "tu ingreso" : "tu salida"}...`;
    await saveShiftRecord({
      type,
      raw: decodedText,
      mode: "presencial",
      source: "qr",
      date: parts.date,
      time: parts.time,
      stamp: now.toISOString()
    });
    savedOk = true;
    lastQrSaveOkAt = Date.now();
    result.textContent = `${type === "ingreso" ? "Ingreso" : "Salida"} registrado: ${parts.date} ${parts.time}. Camara detenida para evitar registros duplicados.`;
    toast("Jornada registrada");
    await stopQrScanner();
    await renderTodaySummary();
  } catch (error) {
    if (error?.message !== "cancelled") console.error(error);
    result.textContent = friendlySaveError(error);
  } finally {
    if (!savedOk) {
      setTimeout(() => {
        try { if (qrReader?.isScanning) qrReader.resume?.(); } catch (_) {}
        submitLock = false;
      }, 900);
    } else {
      submitLock = false;
    }
  }
}

async function saveShiftRecord(entry) {
  if (!DB || !ACTIVE_EMAIL) throw new Error("service_not_ready");
  if ((entry.mode === "remoto" || entry.source === "manual_remote") && !canCurrentUserMarkRemote()) {
    throw new Error("remote_not_allowed");
  }
  const safeEmailId = ACTIVE_EMAIL.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "");
  const docId = `${safeEmailId}_${entry.date}`;
  const ref = doc(DB, COLLECTIONS.shiftRecords, docId);
  const existingSnap = await getDoc(ref);
  const existing = existingSnap.exists() ? existingSnap.data() : null;
  const existingTime = existing?.[`${entry.type}Time`];
  if (existingTime) {
    const replace = confirm(`Ya existe un ${entry.type} registrado hoy a las ${existingTime}. ¿Quieres reemplazarlo?`);
    if (!replace) throw new Error("cancelled");
  }
  const mode = entry.mode || "presencial";
  const source = entry.source || "qr";
  const modalidad = mode === "presencial" ? "sede" : mode;
  const clientCreatedAt = new Date().toISOString();
  const base = {
    role: SHIFT.role,
    email: ACTIVE_EMAIL,
    name: getProfileName(),
    date: entry.date,
    modalidad,
    updatedAt: serverTimestamp(),
    updatedAtClient: Date.now(),
    appBuild: BUILD
  };
  const typed = {
    [`${entry.type}Time`]: entry.time,
    [`${entry.type}Stamp`]: entry.stamp,
    [`${entry.type}Raw`]: entry.raw,
    [`${entry.type}ByUid`]: ACTIVE_USER?.uid || "",
    [`${entry.type}Mode`]: mode,
    [`${entry.type}Source`]: source,
    [`${entry.type}Modalidad`]: modalidad
  };
  const event = {
    type: entry.type,
    mode,
    modalidad,
    source,
    time: entry.time,
    stamp: entry.stamp,
    uid: ACTIVE_USER?.uid || "",
    email: ACTIVE_EMAIL,
    name: getProfileName(),
    raw: entry.raw,
    appBuild: BUILD,
    clientCreatedAt,
    clientCreatedAtMs: Date.now()
  };
  const payload = {
    ...base,
    ...typed,
    events: arrayUnion(event)
  };
  if (existingSnap.exists()) {
    await updateDoc(ref, payload);
  } else {
    await setDoc(ref, {
      ...payload,
      createdAt: serverTimestamp(),
      createdAtClient: Date.now()
    });
  }
}

async function getShiftRecords({ mineOnly = true, max = 60 } = {}) {
  if (!DB) return [];
  const clauses = [collection(DB, COLLECTIONS.shiftRecords), orderBy("date", "desc"), limit(max)];
  if (mineOnly && ACTIVE_EMAIL) clauses.splice(1, 0, where("email", "==", ACTIVE_EMAIL));
  const snap = await getDocs(query(...clauses));
  return snap.docs.map((item) => ({ id: item.id, ...item.data() }));
}

async function renderTodaySummary() {
  const host = $("#today-summary");
  if (!host) return;
  const { date } = getBogotaParts();
  let records = [];
  try {
    records = await getShiftRecords({ mineOnly: true, max: 10 });
  } catch (error) {
    console.warn(error);
  }
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

async function openRecordsModal() {
  setModalCopy("Llegadas registradas", "Aqui puedes revisar tus marcaciones recientes.", "Consulta");
  $("#workspace-content").innerHTML = `
    <section class="recordsTool">
      <div class="recordsToolbar">
        <button class="btnPrimary" id="btn-my-records" type="button">Mis registros</button>
        <button class="btnGhost" id="btn-all-records" type="button">Equipo</button>
      </div>
      <div id="records-list" class="recordsList">Cargando...</div>
    </section>
  `;
  $("#btn-my-records")?.addEventListener("click", () => renderRecords(true));
  $("#btn-all-records")?.addEventListener("click", () => renderRecords(false));
  await renderRecords(true);
}

async function renderRecords(mineOnly) {
  const host = $("#records-list");
  if (!host) return;
  host.textContent = "Cargando...";
  try {
    const records = await getShiftRecords({ mineOnly, max: 80 });
    if (!records.length) {
      host.innerHTML = `<div class="emptyState">Aun no hay registros para mostrar.</div>`;
      return;
    }
    host.innerHTML = `
      <div class="recordTable">
        <div class="recordRow head">
          <div>Fecha</div><div>Nombre</div><div>Ingreso</div><div>Salida</div>
        </div>
        ${records.map((record) => `
          <div class="recordRow">
            <div>${escapeHtml(record.date || "-")}</div>
            <div>
              <strong>${escapeHtml(record.name || "-")}</strong>
              <small>${escapeHtml(record.email || "")}</small>
            </div>
            <div>${escapeHtml(record.ingresoTime || "-")}<small>${escapeHtml(formatShiftMode(record.ingresoMode, record.ingresoSource))}</small><small>${escapeHtml(formatDateTime(record.ingresoStamp))}</small></div>
            <div>${escapeHtml(record.salidaTime || "-")}<small>${escapeHtml(formatShiftMode(record.salidaMode, record.salidaSource))}</small><small>${escapeHtml(formatDateTime(record.salidaStamp))}</small></div>
          </div>
        `).join("")}
      </div>
    `;
  } catch (error) {
    console.error(error);
    host.innerHTML = `<div class="emptyState">No se pudieron cargar los registros. Revisa tu conexion e intenta de nuevo.</div>`;
  }
}

function friendlyAuthError(code = "") {
  if (code === "auth/unauthorized-domain") return "Esta direccion de la app no esta habilitada para iniciar sesion.";
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
    if (btn) {
      btn.disabled = true;
      btn.dataset.originalHtml = btn.innerHTML;
      btn.textContent = "Abriendo Google...";
    }
    await setPersistence(auth, browserLocalPersistence);
    try {
      await signInWithPopup(auth, provider);
    } catch (popupError) {
      if (popupError?.code === "auth/popup-closed-by-user") return;
      const shouldTryRedirect = [
        "auth/popup-blocked",
        "auth/cancelled-popup-request",
        "auth/operation-not-supported-in-this-environment"
      ].includes(popupError?.code);
      if (!shouldTryRedirect && !isStandalone()) throw popupError;
      toast("Te vamos a llevar a Google para iniciar sesion.", { ms: 2400 });
      await signInWithRedirect(auth, provider);
    }
  } catch (error) {
    if (error?.code === "auth/popup-closed-by-user") return;
    const friendly = friendlyAuthError(error?.code || "");
    toast(friendly ? `No se pudo iniciar sesion: ${friendly}` : "No se pudo iniciar sesion");
    console.error(error);
  } finally {
    loginLock = false;
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = btn.dataset.originalHtml || `<span class="gIcon" aria-hidden="true">G</span> Entrar con Google`;
    }
  }
}

async function finalizeRedirectIfAny(auth) {
  try {
    await getRedirectResult(auth);
  } catch (error) {
    const friendly = friendlyAuthError(error?.code || "");
    toast(friendly ? `No se pudo completar el inicio de sesion: ${friendly}` : "No se pudo completar el inicio de sesion");
  }
}

function assertConfig(cfg) {
  return Boolean(cfg?.apiKey && cfg?.authDomain && cfg?.projectId && cfg?.appId);
}

function setHubCopy() {
  document.title = HUB.name;
  $(".brandTitle") && ($(".brandTitle").textContent = "Musicala");
  $(".brandSub") && ($(".brandSub").textContent = HUB.subtitle);
  $(".appTitle") && ($(".appTitle").textContent = HUB.name);
}

async function mount() {
  setHubCopy();
  if (!assertConfig(firebaseConfig)) {
    show("login");
    toast("No se pudo cargar la configuracion de la app. Intenta mas tarde.");
    return;
  }
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  AUTH = auth;
  DB = db;
  await setPersistence(auth, browserLocalPersistence).catch(() => null);
  await finalizeRedirectIfAny(auth);

  $("#btn-google")?.addEventListener("click", () => doGoogleLogin(auth));
  $("#btn-refresh-app")?.addEventListener("click", clearLocalAppCacheAndReload);
  $("#btn-logout")?.addEventListener("click", async () => {
    try {
      await signOut(auth);
      show("login");
      toast("Sesion cerrada");
    } catch (_) {
      toast("No se pudo cerrar sesion. Intenta de nuevo.");
    }
  });

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      ACTIVE_USER = null;
      ACTIVE_EMAIL = "";
      ACTIVE_PROFILE = null;
      ACTIVE_LINKS = {};
      await closeModal();
      show("login");
      return;
    }
    const email = emailKey(user);
    if (HUB.USERS && Object.keys(HUB.USERS).length && !HUB.USERS[email]) {
      toast("Tu correo no esta autorizado para este hub");
      await signOut(auth).catch(() => null);
      show("login");
      return;
    }
    ACTIVE_USER = user;
    ACTIVE_EMAIL = email;
    ACTIVE_PROFILE = HUB.USERS?.[email] || null;
    ACTIVE_LINKS = buildLinksForUser(email);
    $("#user-line") && ($("#user-line").textContent = `${getProfileName()} · v${BUILD}`);
    show("app");
    renderHero();
    renderButtons(HUB.BUTTONS, ACTIVE_LINKS);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  console.log("BUILD", BUILD);
  registerServiceWorker();
  setupInstallPrompt();
  mount();
});
