const NOTIFICATION_TO = "notificaciones.musicala@gmail.com";
const SENDER_NAME = "Musicala Admin Hub";

function doPost(e) {
  try {
    const payload = parsePayload_(e);
    if (!payload || payload.type !== "ingreso") {
      return json_({ ok: false, error: "Evento invalido: solo se notifican ingresos." });
    }

    const workerName = clean_(payload.name) || "Trabajador sin nombre";
    const workerEmail = clean_(payload.email) || "Correo no disponible";
    const bogotaDate = clean_(payload.date) || getBogotaDate_(payload.stamp);
    const bogotaTime = clean_(payload.time) || getBogotaTime_(payload.stamp);
    const subject = `Ingreso registrado - ${workerName} - ${bogotaDate} ${bogotaTime}`;
    const body = [
      "Se registro un ingreso de jornada en Musicala Admin Hub.",
      "",
      `Nombre del trabajador: ${workerName}`,
      `Correo del trabajador: ${workerEmail}`,
      "Tipo de marcacion: ingreso",
      `Modalidad: ${clean_(payload.modalidad || payload.mode) || "No disponible"}`,
      `Fuente: ${formatSource_(payload.source)}`,
      `Fecha Bogota: ${bogotaDate}`,
      `Hora Bogota: ${bogotaTime}`,
      `Fecha/hora ISO del evento: ${clean_(payload.stamp) || "No disponible"}`,
      `UID de Firebase: ${clean_(payload.uid) || "No disponible"}`,
      `ID del documento de Firestore: ${clean_(payload.docId) || "No disponible"}`,
      `Fue reemplazo de un ingreso existente: ${payload.replacedExisting ? "Si" : "No"}`,
      `Build de la app: ${clean_(payload.appBuild) || "No disponible"}`
    ].join("\n");

    MailApp.sendEmail({
      to: NOTIFICATION_TO,
      subject,
      body,
      name: SENDER_NAME
    });

    return json_({ ok: true });
  } catch (error) {
    return json_({ ok: false, error: String(error && error.message ? error.message : error) });
  }
}

function parsePayload_(e) {
  const raw = e && e.postData && e.postData.contents ? e.postData.contents : "";
  if (!raw) throw new Error("No se recibio cuerpo JSON.");
  return JSON.parse(raw);
}

function json_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function clean_(value) {
  return String(value || "").trim();
}

function formatSource_(source) {
  const value = clean_(source);
  if (value === "qr") return "QR";
  if (value === "manual_remote") return "manual remoto";
  return value || "otra";
}

function getBogotaDate_(isoStamp) {
  if (!isoStamp) return "No disponible";
  return Utilities.formatDate(new Date(isoStamp), "America/Bogota", "yyyy-MM-dd");
}

function getBogotaTime_(isoStamp) {
  if (!isoStamp) return "No disponible";
  return Utilities.formatDate(new Date(isoStamp), "America/Bogota", "HH:mm:ss");
}
