/* Musicala · Admin Hub (SIMPLE + Firebase Google Login)
   - Login con Google (Firebase Auth)
   - Hub exclusivo para Administrativos (lista blanca por correo)
   - Links generales + links personalizados por usuario (Horario anual / Documentos)
*/
const BUILD = "2026-02-16.4";

/* ===========
   1) Firebase Config (YA LISTO)
=========== */
const firebaseConfig = {
  apiKey: "AIzaSyCsXw0N_GkdwYMkdfZ_H2XIBNeTpGFn_rg",
  authDomain: "musicala-admin-hub.firebaseapp.com",
  projectId: "musicala-admin-hub",
  storageBucket: "musicala-admin-hub.firebasestorage.app",
  messagingSenderId: "468927778540",
  appId: "1:468927778540:web:619daeb67ff0287d92dfc9"
};

/* ===========
   2) Config Admin Hub (solo esto)
   - GENERAL_LINKS: le sale a TODOS los autorizados
   - USERS: lista blanca por correo + links personalizados (ej: horario, documentos)
=========== */
const HUB = {
  name: "Administrativos · Musicala",

  // Links generales (para todos los admins autorizados)
  // Dejamos “los otros” libres si no quieres ponerlos aún.
  GENERAL_LINKS: {
    nomina:     "https://docs.google.com/forms/d/e/1FAIpQLSeMOhoY9d8JOf1Oq8DnD_aSEDkBmOXmzYJtlCCU-7CNVYjnLA/viewform", // 💰 Novedades nómina (general) -> pega URL
    apertura:   "https://musicala.github.io/protocolodeapertura/", // 🔑 Protocolo de apertura (general) -> pega URL
    reglamento: "https://drive.google.com/file/d/1Oda0c_FnHrsgME2GE8LCb7z5huH-YbBk/view", // 📜 Reglamento interno (general) -> pega URL
    jornada:    "https://musicala.github.io/registrojornadaadmin/"  // ⏱️ Registro de jornada (general) -> pega URL
  },

  // Usuarios autorizados (TODOS Admin)
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
      label: "Camila Rodríguez",
      links: { horario: "", documentos: "" }
    },
    "licethrinconr@gmail.com": {
      label: "Liceth Rincón",
      links: {
        horario: "https://musicala.github.io/horario2026asistentecomercial/",
        documentos: "https://drive.google.com/drive/folders/1Xq_qn2gLNXQYuyVrxherSKvW7uNC8tnK?usp=sharing"
      }
    }
  },

  BUTTONS: [
    { id: "nomina",     icon: "💰", title: "Novedades nómina", subtitle: "General" },
    { id: "apertura",   icon: "🔑", title: "Protocolo de apertura", subtitle: "General" },
    { id: "horario",    icon: "📅", title: "Horario anual", subtitle: "Personal" },
    { id: "documentos", icon: "📁", title: "Documentos", subtitle: "Personal" },
    { id: "reglamento", icon: "📜", title: "Reglamento interno de trabajo", subtitle: "General" },
    { id: "jornada",    icon: "⏱️", title: "Registro de jornada", subtitle: "General" }
  ]
};

/* ===========
   3) Firebase SDK (CDN modular)
=========== */
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

/* ===========
   Helpers UI
=========== */
const $ = (sel, el = document) => el.querySelector(sel);

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function pickToastEl() {
  // En tu HTML tienes #toast en login y #toast-app en app. :contentReference[oaicite:1]{index=1}
  const a = $("#toast-app");
  const b = $("#toast");
  if (a && !a.hidden) return a;
  return b || a || null;
}

let toastTimer = null;
/**
 * Toast con acción opcional.
 * toast("Mensaje", { actionText:"Actualizar", onAction:()=>{}, sticky:true, ms:5000 })
 */
function toast(msg, opts = {}) {
  const el = pickToastEl();
  if (!el) return;

  const { actionText = "", onAction = null, sticky = false, ms = 2600 } = opts || {};

  el.classList.remove("show");
  el.hidden = false;
  el.innerHTML = "";

  const msgSpan = document.createElement("span");
  msgSpan.className = "toastMsg";
  msgSpan.textContent = String(msg ?? "");
  el.appendChild(msgSpan);

  if (actionText) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "toastBtn";
    btn.textContent = actionText;
    btn.addEventListener("click", () => {
      try { onAction && onAction(); }
      finally { el.classList.remove("show"); }
    });
    el.appendChild(btn);
  }

  requestAnimationFrame(() => el.classList.add("show"));

  clearTimeout(toastTimer);
  if (!sticky) {
    toastTimer = setTimeout(() => {
      el.classList.remove("show");
      if (el.id === "toast-app") el.hidden = true;
    }, Math.max(1200, Number(ms) || 2600));
  }
}

function show(which) {
  const vLogin = $("#view-login");
  const vApp = $("#view-app");
  if (!vLogin || !vApp) return;

  if (which === "login") {
    vLogin.hidden = false;
    vApp.hidden = true;
    const tApp = $("#toast-app");
    if (tApp) tApp.hidden = true;
  } else {
    vLogin.hidden = true;
    vApp.hidden = false;
  }
}

/* ===========
   PWA: install + SW
=========== */
let __deferredInstallPrompt = null;

function isIOS() {
  const ua = navigator.userAgent || "";
  return /iphone|ipad|ipod/i.test(ua);
}
function isStandalone() {
  if (window.navigator.standalone) return true; // iOS Safari
  return window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
}

function setInstallUI(visible) {
  const b1 = document.getElementById("btn-install");
  const b2 = document.getElementById("btn-install-2");
  if (b1) b1.hidden = !visible;
  if (b2) b2.hidden = !visible;
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  const promptUpdate = (reg) => {
    if (!reg || !reg.waiting) return;

    toast("Hay una actualización lista ✨", {
      actionText: "Actualizar",
      sticky: true,
      onAction: () => {
        try {
          reg.waiting.postMessage({ type: "SKIP_WAITING" });
        } catch (e) {
          console.warn("No se pudo activar update", e);
          toast("No se pudo actualizar, recarga la página 🙃");
        }
      }
    });
  };

  try {
    const reg = await navigator.serviceWorker.register("./sw.js", { scope: "./" });

    promptUpdate(reg);

    reg.addEventListener("updatefound", () => {
      const sw = reg.installing;
      if (!sw) return;

      sw.addEventListener("statechange", () => {
        if (sw.state === "installed" && navigator.serviceWorker.controller) {
          promptUpdate(reg);
        }
      });
    });

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (window.__reloadingForSW) return;
      window.__reloadingForSW = true;
      window.location.reload();
    });

    reg.update?.().catch(() => null);
  } catch (e) {
    console.warn("SW no se pudo registrar", e);
  }
}

function setupInstallPrompt() {
  if (isStandalone()) {
    setInstallUI(false);
    return;
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    __deferredInstallPrompt = e;
    setInstallUI(true);
  });

  window.addEventListener("appinstalled", () => {
    __deferredInstallPrompt = null;
    setInstallUI(false);
    toast("Instalada ✨");
  });

  const onInstallClick = async () => {
    if (isIOS() && !__deferredInstallPrompt) {
      toast("En iPhone/iPad: Compartir → “Agregar a pantalla de inicio”");
      return;
    }
    if (!__deferredInstallPrompt) {
      toast("Instalación no disponible todavía (abre en Chrome/Safari)");
      return;
    }

    __deferredInstallPrompt.prompt();
    const choice = await __deferredInstallPrompt.userChoice.catch(() => null);
    __deferredInstallPrompt = null;

    if (!choice || choice.outcome !== "accepted") {
      setInstallUI(false);
      setTimeout(() => setInstallUI(true), 8000);
      return;
    }
  };

  const b1 = document.getElementById("btn-install");
  const b2 = document.getElementById("btn-install-2");
  if (b1) b1.addEventListener("click", onInstallClick);
  if (b2) b2.addEventListener("click", onInstallClick);
}

/* ===========
   Render botones (dinámico)
=========== */
let ACTIVE_LINKS = {};

function renderButtons(buttons, links) {
  const grid = $("#grid");
  if (!grid) return;

  ACTIVE_LINKS = links || {};

  grid.innerHTML = (buttons || []).map(b => {
    const url = String(ACTIVE_LINKS[b.id] || "").trim();
    const pending = !url;
    const cls = pending ? "tile pending" : "tile";
    const badge = pending
      ? '<span class="badge">Pendiente</span>'
      : '<span class="badge ok">Abrir</span>';

    return `
      <button class="${cls}" type="button" data-id="${escapeHtml(b.id)}" aria-label="${escapeHtml(b.title)}">
        <div class="tileTop">
          <div class="ico" aria-hidden="true">${escapeHtml(b.icon)}</div>
          ${badge}
        </div>
        <div class="tileText">
          <div class="tTitle">${escapeHtml(b.title)}</div>
          <div class="tSub">${escapeHtml(b.subtitle)}</div>
        </div>
      </button>
    `;
  }).join("");

  if (!grid.__boundClick) {
    grid.__boundClick = true;
    grid.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-id]");
      if (!btn) return;

      const id = btn.getAttribute("data-id");
      const url = String(ACTIVE_LINKS[id] || "").trim();

      if (!url) {
        toast(`Pendiente: falta pegar el link de “${id}”`);
        return;
      }

      // Asegura protocolo (evita links sin https://)
      const safeUrl = /^(https?:)?\/\//i.test(url) ? url : ("https://" + url);

      window.open(safeUrl, "_blank", "noopener,noreferrer");
    }, { passive: true });
  }
}

/* ===========
   Auth
=========== */
function prettyName(user, fallbackEmail = "") {
  const name = user?.displayName || "";
  const email = user?.email || fallbackEmail || "";
  return name ? name : (email ? email : "Sesión activa");
}

function friendlyAuthError(code = "") {
  if (code === "auth/unauthorized-domain") return "Dominio no autorizado en Firebase Auth (Authorized domains).";
  if (code === "auth/popup-blocked") return "El navegador bloqueó el popup. En modo app instalada usamos redirect.";
  if (code === "auth/cancelled-popup-request") return "Se canceló el popup de inicio de sesión.";
  if (code === "auth/popup-closed-by-user") return "Cerraste el login.";
  if (code === "auth/network-request-failed") return "Falló la red. Revisa internet.";
  return "";
}

async function doGoogleLogin(auth) {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  try {
    await setPersistence(auth, browserLocalPersistence);

    if (isStandalone()) {
      await signInWithRedirect(auth, provider);
      return;
    }
    await signInWithPopup(auth, provider);
  } catch (err) {
    const code = err?.code || "";
    if (code === "auth/popup-closed-by-user") return;

    const friendly = friendlyAuthError(code);
    toast(friendly ? `No se pudo iniciar sesión: ${friendly}` : "No se pudo iniciar sesión");
    console.error("Login error:", err);
  }
}

async function doLogout(auth) {
  try {
    await signOut(auth);
  } catch (err) {
    toast("No se pudo cerrar sesión");
    console.error(err);
  }
}

/* ===========
   Boot
=========== */
function assertConfig(cfg) {
  const bad = !cfg || !cfg.apiKey || !cfg.authDomain || !cfg.projectId || !cfg.appId;
  if (!bad) return true;
  console.warn("Firebase config incompleto. Revisa firebaseConfig en app.js");
  return false;
}

async function finalizeRedirectIfAny(auth) {
  try {
    const res = await getRedirectResult(auth);
    if (res?.user) {
      console.log("Redirect login OK:", res.user.email || res.user.uid);
    }
  } catch (err) {
    const code = err?.code || "";
    if (code) {
      const friendly = friendlyAuthError(code);
      toast(friendly ? `Login redirect falló: ${friendly}` : "Login redirect falló");
      console.warn("Redirect result error:", err);
    }
  }
}

function emailKey(user) {
  return String(user?.email || "").toLowerCase().trim();
}

function hasUserRestrictions() {
  return HUB.USERS && Object.keys(HUB.USERS).length > 0;
}

function buildLinksForUser(email) {
  const base = { ...(HUB.GENERAL_LINKS || {}) };
  const prof = HUB.USERS?.[email] || null;
  const overrides = prof?.links || {};
  return { ...base, ...overrides };
}

async function mount() {
  try { document.title = "Musicala · Admin Hub"; } catch (_) {}

  if (!assertConfig(firebaseConfig)) {
    show("login");
    toast("Falta configurar Firebase en app.js");
    return;
  }

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);

  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch (e) {
    console.warn("No se pudo setPersistence:", e);
  }

  await finalizeRedirectIfAny(auth);

  const btnGoogle = $("#btn-google");
  const btnOut = $("#btn-logout");
  const userLine = $("#user-line");

  if (btnGoogle) btnGoogle.addEventListener("click", () => doGoogleLogin(auth));
  if (btnOut) btnOut.addEventListener("click", () => doLogout(auth));

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      show("login");
      return;
    }

    const email = emailKey(user);

    // Lista blanca: si hay restricciones y tu correo no está, chao.
    if (hasUserRestrictions() && !HUB.USERS[email]) {
      toast("Tu correo no está autorizado para este hub 🫠");
      try { await signOut(auth); } catch (_) {}
      show("login");
      return;
    }

    const profile = HUB.USERS?.[email] || null;
    const mergedLinks = buildLinksForUser(email);

    if (userLine) {
      userLine.textContent = profile?.label || prettyName(user, email);
    }

    show("app");
    renderButtons(HUB.BUTTONS || [], mergedLinks);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  console.log("BUILD", BUILD);

  registerServiceWorker();
  setupInstallPrompt();
  mount();
});
