/* Compara DOS archivos de reglas sondeando las mismas operaciones contra el
   emulador, y muestra en qué cambia el comportamiento. Pensado para este
   proyecto Firebase compartido (Admin Hub, Compras, Manager, nómina, Wix):
   el último despliegue reemplaza el archivo completo, así que antes de
   publicar conviene comparar lo que está vivo en la consola contra lo nuevo.

     npm i -D firebase-tools firebase @firebase/rules-unit-testing
     # guarda en consola.rules lo que está publicado hoy en Firebase
     npx firebase emulators:exec --only firestore --project demo-musicala \
       "node tests/firestore-rules-diff.mjs consola.rules firestore.rules"

   Cada fila marcada con ▲ es un cambio de comportamiento: deben ser solo los
   que buscabas.
*/
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import fs from "fs";

const bogota = (o = 0) => new Date(Date.now() - 5 * 3600 * 1000 + o * 86400000).toISOString().slice(0, 10);
const id = (e) => e.toLowerCase().replace(/[^a-z0-9]+/gi, "_");
const MGR = "apps/manager-musicala";

// Sondas: cada una se corre contra las reglas viejas (consola) y las nuevas.
const probes = [
  ["nómina · crear novedad", "alekcaballeromusic@gmail.com", (db) => setDoc(doc(db, `${MGR}/novedades_nomina/n1`), { estado: "nueva" })],
  ["nómina · leer novedad", "adminmusicala@gmail.com", (db) => getDoc(doc(db, `${MGR}/novedades_nomina/n_seed`))],
  ["nómina · empleados", "musicalaasesor@gmail.com", (db) => setDoc(doc(db, `${MGR}/empleados/e1`), { nombre: "X" })],
  ["nómina · nomina_mensual", "emilybg0102@gmail.com", (db) => getDoc(doc(db, `${MGR}/nomina_mensual/2026-09`))],
  ["manager · comodín lectura", "annitolad@gmail.com", (db) => getDoc(doc(db, `${MGR}/managerSettings/s1`))],
  ["manager · users self-create admin", "catalina.medina.leal@gmail.com", (db) => setDoc(doc(db, `${MGR}/users/uid_catalina_medina_leal_gmail_com`), { email: "catalina.medina.leal@gmail.com", role: "admin", active: true })],
  ["manager · escribir sin ser admin", "annitolad@gmail.com", (db) => setDoc(doc(db, `${MGR}/lockers/l1`), { x: 1 })],
  ["compras · leer item", "musicalaasesor@gmail.com", (db) => getDoc(doc(db, "apps/compras-musicala/items/i_seed"))],
  ["compras · ajeno no lee", "licethrinconr@gmail.com", (db) => getDoc(doc(db, "apps/compras-musicala/items/i_seed"))],
  ["wix · docente lee su reserva", "emilybg0102@gmail.com", (db) => getDoc(doc(db, "calendarioWix/b_emily"))],
  ["wix · docente lee reserva ajena", "emilybg0102@gmail.com", (db) => getDoc(doc(db, "calendarioWix/b_otra"))],
  ["wix · roomAssignments docente", "malego2709@gmail.com", (db) => getDoc(doc(db, "roomAssignments/r1"))],
  ["hubUsers · docente lee el suyo", "annitolad@gmail.com", (db) => getDoc(doc(db, `hubUsers/${"annitolad@gmail.com"}`))],
  ["calendarLastSeen · propio", "malego2709@gmail.com", (db) => setDoc(doc(db, "calendarLastSeen/malego2709@gmail.com"), { at: 1 })],
  ["hub · activa lee registro", "angiecamilar4@gmail.com", (db) => getDoc(doc(db, "adminShiftRecords/r_angie"))],
  ["hub · activa marca jornada", "angiecamilar4@gmail.com", (db) => setDoc(doc(db, "adminShiftRecords/r_angie_new"), { email: "angiecamilar4@gmail.com", role: "administrativo", date: bogota() })],
  ["hub · admin lee todo", "alekcaballeromusic@gmail.com", (db) => getDoc(doc(db, "adminShiftRecords/r_liceth"))],
  ["hub · RETIRADA lee registro", "licethrinconr@gmail.com", (db) => getDoc(doc(db, "adminShiftRecords/r_liceth"))],
  ["hub · RETIRADA marca jornada", "licethrinconr@gmail.com", (db) => setDoc(doc(db, "adminShiftRecords/r_lic_new"), { email: "licethrinconr@gmail.com", role: "administrativo", date: bogota() })],
  ["hub · RETIRADA lee botones", "licethrinconr@gmail.com", (db) => getDoc(doc(db, "adminHubLinks/l1"))],
  ["hub · RETIRADA lee su config", "licethrinconr@gmail.com", (db) => getDoc(doc(db, `adminMemberSettings/${id("licethrinconr@gmail.com")}`))],
  ["hub · RETIRADA en nómina", "licethrinconr@gmail.com", (db) => getDoc(doc(db, `${MGR}/nomina_mensual/2026-09`))],
  ["fuera de todo", "alekcaballeromusic@gmail.com", (db) => getDoc(doc(db, "coleccionRandom/x"))]
];

const run = async (label, rulesFile, projectId) => {
  const env = await initializeTestEnvironment({ projectId,
    firestore: { rules: fs.readFileSync(rulesFile, "utf8"), host: "127.0.0.1", port: 8080 } });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "adminMemberSettings", id("licethrinconr@gmail.com")), { email: "licethrinconr@gmail.com", active: true, endDate: bogota(-1) });
    await setDoc(doc(db, "adminMemberSettings", id("angiecamilar4@gmail.com")), { email: "angiecamilar4@gmail.com", active: true });
    await setDoc(doc(db, "adminShiftRecords", "r_liceth"), { email: "licethrinconr@gmail.com", role: "administrativo", date: bogota(-5) });
    await setDoc(doc(db, "adminShiftRecords", "r_angie"), { email: "angiecamilar4@gmail.com", role: "administrativo", date: bogota(-5) });
    await setDoc(doc(db, "adminHubLinks", "l1"), { title: "L", url: "https://x", audience: "all", active: true });
    await setDoc(doc(db, `${MGR}/novedades_nomina/n_seed`), { estado: "nueva" });
    await setDoc(doc(db, `${MGR}/nomina_mensual/2026-09`), { dias: 30 });
    await setDoc(doc(db, `${MGR}/managerSettings/s1`), { x: 1 });
    await setDoc(doc(db, "apps/compras-musicala/items/i_seed"), { nombre: "resma" });
    await setDoc(doc(db, "calendarioWix/b_emily"), { staffEmail: "emilybg0102@gmail.com" });
    await setDoc(doc(db, "calendarioWix/b_otra"), { staffEmail: "otra@gmail.com" });
    await setDoc(doc(db, "roomAssignments/r1"), { sala: "A" });
    await setDoc(doc(db, "hubUsers/annitolad@gmail.com"), { enabled: true });
  });
  const out = {};
  for (const [name, email, op] of probes) {
    const db = env.authenticatedContext("uid_" + id(email), { email, email_verified: true, firebase: { sign_in_provider: "google.com" } }).firestore();
    try { await op(db); out[name] = "permitido"; } catch (e) { out[name] = (e?.code === "permission-denied" || String(e).includes("permission-denied")) ? "denegado" : "ERROR:" + String(e).slice(0, 60); }
  }
  await env.cleanup();
  return out;
};

const [antesFile, despuesFile] = process.argv.slice(2);
if (!antesFile || !despuesFile) {
  console.error("Uso: node tests/firestore-rules-diff.mjs <reglas-actuales.rules> <reglas-nuevas.rules>");
  process.exit(2);
}
const viejo = await run("antes", antesFile, "demo-antes");
const nuevo = await run("despues", despuesFile, "demo-despues");
let cambios = 0;
console.log("SONDA".padEnd(34), "ANTES".padEnd(11), "DESPUÉS");
for (const [name] of probes) {
  const igual = viejo[name] === nuevo[name];
  if (!igual) cambios++;
  console.log((igual ? "     " : "  ▲  ") + name.padEnd(29), viejo[name].padEnd(11), nuevo[name]);
}
console.log(`\n${probes.length} sondas · ${cambios} cambios de comportamiento`);
process.exit(0);
