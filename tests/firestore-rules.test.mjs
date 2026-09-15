/* Pruebas de las reglas de Firestore: verifican que desactivar o retirar a un
   miembro desde el hub corta su acceso de verdad, y que nadie más se rompe.

   Requisitos: Java y las dependencias del emulador.
     npm i -D firebase-tools firebase @firebase/rules-unit-testing
     npx firebase emulators:exec --only firestore --project demo-musicala \
       "node tests/firestore-rules.test.mjs"
*/
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, deleteDoc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import fs from "fs";

const ADMIN = "alekcaballeromusic@gmail.com";
const LICETH = "licethrinconr@gmail.com";
const ANGIE = "angiecamilar4@gmail.com";
const CATA = "catalina.medina.leal@gmail.com";
const id = (e) => e.toLowerCase().replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "");
const bogota = (offsetDays = 0) => {
  const d = new Date(Date.now() - 5 * 3600 * 1000 + offsetDays * 86400000);
  return d.toISOString().slice(0, 10);
};

const env = await initializeTestEnvironment({
  projectId: "demo-musicala",
  firestore: { rules: fs.readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"), host: "127.0.0.1", port: 8080 }
});
await env.clearFirestore();

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  const settings = (email, extra) => setDoc(doc(db, "adminMemberSettings", id(email)), { email, active: true, ...extra });
  await settings(ADMIN, {});
  await settings(CATA, { active: false });                 // admin mal configurada: no debe bloquearse
  await settings(LICETH, {});                              // vinculada
  await settings(ANGIE, { active: false });                // desactivada desde la app
  await setDoc(doc(db, "adminShiftRecords", "r_liceth"), { email: LICETH, role: "administrativo", date: "2026-09-10" });
  await setDoc(doc(db, "adminShiftRecords", "r_angie"), { email: ANGIE, role: "administrativo", date: "2026-09-10" });
  await setDoc(doc(db, "adminHubLinks", "l1"), { title: "Link", url: "https://x", audience: "all", active: true });
});

const as = (email) => env.authenticatedContext("uid_" + id(email), { email, email_verified: true, firebase: { sign_in_provider: "google.com" } }).firestore();
const setEnd = (email, endDate) => env.withSecurityRulesDisabled((ctx) =>
  setDoc(doc(ctx.firestore(), "adminMemberSettings", id(email)), { email, active: true, endDate }));

let pass = 0, fail = 0;
const check = async (label, expect, run) => {
  try { await (expect === "allow" ? assertSucceeds(run()) : assertFails(run())); console.log(`OK    ${label}`); pass++; }
  catch (e) { console.log(`FAIL  ${label} -> ${String(e).split("\n")[0]}`); fail++; }
};

// Vinculada: todo normal
await check("activa lee su registro", "allow", () => getDoc(doc(as(LICETH), "adminShiftRecords", "r_liceth")));
await check("activa marca jornada", "allow", () => setDoc(doc(as(LICETH), "adminShiftRecords", "r_new"), { email: LICETH, role: "administrativo", date: bogota() }));
await check("activa lee botones del hub", "allow", () => getDoc(doc(as(LICETH), "adminHubLinks", "l1")));

// Desactivada desde la app
await check("inactiva NO lee su registro", "deny", () => getDoc(doc(as(ANGIE), "adminShiftRecords", "r_angie")));
await check("inactiva NO marca jornada", "deny", () => setDoc(doc(as(ANGIE), "adminShiftRecords", "r_angie2"), { email: ANGIE, role: "administrativo", date: bogota() }));
await check("inactiva NO lee botones del hub", "deny", () => getDoc(doc(as(ANGIE), "adminHubLinks", "l1")));
await check("inactiva SI lee su propia config (para el aviso)", "allow", () => getDoc(doc(as(ANGIE), "adminMemberSettings", id(ANGIE))));

// Retiro por fecha
await setEnd(LICETH, bogota(0));
await check("ultimo dia de trabajo: sigue entrando", "allow", () => getDoc(doc(as(LICETH), "adminShiftRecords", "r_liceth")));
await setEnd(LICETH, bogota(-1));
await check("retirada ayer: ya no entra", "deny", () => getDoc(doc(as(LICETH), "adminShiftRecords", "r_liceth")));
await check("retirada ayer: no marca jornada", "deny", () => setDoc(doc(as(LICETH), "adminShiftRecords", "r_new2"), { email: LICETH, role: "administrativo", date: bogota() }));
await setEnd(LICETH, bogota(30));
await check("retiro futuro: entra hasta esa fecha", "allow", () => getDoc(doc(as(LICETH), "adminShiftRecords", "r_liceth")));

// Admins y casos borde
await check("admin lee cualquier registro", "allow", () => getDoc(doc(as(ADMIN), "adminShiftRecords", "r_angie")));
await check("admin con active:false NO se bloquea", "allow", () => getDoc(doc(as(CATA), "adminHubLinks", "l1")));
await check("admin desactiva a alguien", "allow", () => setDoc(doc(as(ADMIN), "adminMemberSettings", id(ANGIE)), { email: ANGIE, active: false }, { merge: true }));
await check("inactiva NO se reactiva sola", "deny", () => setDoc(doc(as(ANGIE), "adminMemberSettings", id(ANGIE)), { email: ANGIE, active: true }, { merge: true }));
await check("correo ajeno al equipo sigue fuera", "deny", () => getDoc(doc(as("desconocida@gmail.com"), "adminHubLinks", "l1")));

// Miembro de la lista blanca sin documento de configuración (recién agregado):
// nada lo bloquea, el flujo normal de QR / remoto sigue funcionando.
await env.withSecurityRulesDisabled((ctx) => deleteDoc(doc(ctx.firestore(), "adminMemberSettings", id(ANGIE))));
await check("miembro sin config marca jornada", "allow", () => setDoc(doc(as(ANGIE), "adminShiftRecords", "r_angie3"), { email: ANGIE, role: "administrativo", date: bogota() }));
await check("miembro sin config cierra su jornada", "allow", () => updateDoc(doc(as(ANGIE), "adminShiftRecords", "r_angie"), { salidaTime: "16:00" }));
await check("miembro sin config lee sus registros", "allow", () => getDoc(doc(as(ANGIE), "adminShiftRecords", "r_angie")));
await check("nadie escribe el registro de otra persona", "deny", () => setDoc(doc(as(ANGIE), "adminShiftRecords", "r_otro"), { email: LICETH, role: "administrativo", date: bogota() }));

console.log(`\n${pass} OK · ${fail} FAIL`);
await env.cleanup();
process.exit(fail ? 1 : 0);
