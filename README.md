# Musicala Admin Hub — Glow Up 2026

Rediseño visual premium + panel administrativo de jornadas, puntualidad, horarios y
correcciones, **manteniendo intacta** la base existente (login Google, lista blanca,
QR, marcación remota, notificación por Apps Script y PWA).

`BUILD = 2026-06-05.1`

---

## 1. Archivos modificados

| Archivo | Cambio |
|---|---|
| `index.html` | Nuevo shell de panel: header + `#panel-nav` (navegación) + `#panel-content` (contenido dinámico). Versiones de cache actualizadas. |
| `app.js` | Reescrito y reorganizado por secciones. Conserva toda la lógica original (auth, QR, remoto, guardado, email, SW) y añade: roles, horarios por miembro, excepciones, cálculo centralizado de puntualidad, estadísticas, edición/anulación de registros, navegación por tabs, exportación CSV/reportes. |
| `styles.css` | Se **agregó** (no se borró nada) el bloque `PANEL GLOW UP 2026`: KPIs, tablas, badges de estado, filtros, ranking, horario semanal, equipo, barra inferior móvil. |
| `firestore.rules` | Modelo de roles (admin/equipo) + reglas para las 3 colecciones. Sin `delete`. |
| `sw.js` | `BUILD` actualizado a `2026-06-05.1` (renueva caches). |
| `gas/code.gs` | **Sin cambios** (sigue siendo compatible con el payload de ingreso). |
| `manifest.webmanifest` | Sin cambios (solo se actualizó el `?v=` del link en `index.html`). |

## 2. Nueva estructura (resumen)

`app.js` está dividido en bloques comentados:
1. Config y constantes (incluye `ADMIN_EMAILS`, `WEEK_DAYS`, defaults de horario).
2. Utilidades (fechas **America/Bogota**, `YYYY-MM-DD` / `HH:mm`, DOM, toasts con tono).
3. Modelo de datos: roles, member settings, overrides y **cálculo de puntualidad**.
4. PWA / Service Worker / instalación.
5. Navegación tipo panel (`TABS`, `goTab`).
6. Vistas: Inicio, Marcar jornada, Registros, Estadísticas, Configuración, Equipo.
7. Modales: detalle, edición/corrección, anulación, excepciones, horario.
8. Auth + `mount`.

Se mantuvo **todo en `app.js` como módulo ES** (sin dividir en varios archivos) para no
complicar el despliegue en GitHub Pages.

### Funciones clave (tal como se pidió)
`isCurrentUserAdmin()`, `getActiveMemberSettings()`, `getExpectedScheduleForDate(email,date)`,
`getScheduleOverride(email,date)`, `calculateShiftStatus(record,schedule)`,
`calculateStats(records,range)`, `renderDashboard()`, `renderAdminStats()`,
`renderMemberSettings()`, `saveMemberSettings()`, `renderRecordsTab()/applyRecordsFilter()`,
`openRecordDetail(id)`, `openEditRecordModal(id)`, `saveRecordCorrection(id,patch,reason)`.

## 3. Colecciones de Firestore

| Colección | ID de documento | Uso |
|---|---|---|
| `adminShiftRecords` *(existente)* | `{correo_normalizado}_{YYYY-MM-DD}` | Registros de jornada (1 por usuario/día). |
| `adminMemberSettings` *(nueva)* | `{correo_normalizado}` | Horario semanal y datos del miembro. |
| `adminScheduleOverrides` *(nueva)* | `{correo_normalizado}_{YYYY-MM-DD}` | Excepción de horario por fecha. |

> Normalización del correo: minúsculas, todo lo no `[a-z0-9]` → `_`.

## 4. Campos nuevos

**En `adminShiftRecords` (correcciones / anulación):**
```
manualCorrection, correctionReason, correctedBy, correctedAtClient, correctedAt,
adminNotes, statusOverride, correctionHistory[] (arrayUnion: {correctedBy,
correctedAtClient, previousData, newData, reason}),
voided, voidReason, voidedBy, voidedAt
```
El estado (puntual/tarde/etc.) **no se guarda**: se calcula siempre con
`calculateShiftStatus()`. Solo se persiste `statusOverride` (ej. `"justificado"`).

**`adminMemberSettings`:**
```
email, name, role ("admin"|"member"), active, canWorkRemote, defaultGraceMinutes,
weeklySchedule: { monday..sunday: { enabled, start, end, modality, graceMinutes, notes } },
createdAt, updatedAt, updatedAtClient, updatedBy
```

**`adminScheduleOverrides`:**
```
email, date, enabled, start, end, modality, graceMinutes, reason,
createdBy, createdAt, createdAtClient
```

## 5. Reglas de Firestore (resumen)
- `isAdmin()` = los 2 correos administradores. `isTeam()` = lista blanca completa.
- `adminShiftRecords`: el miembro crea/actualiza **su** registro (flujo normal); el admin
  puede crear/actualizar cualquiera (correcciones). Lectura: dueño ve lo suyo, admin ve todo.
- `adminMemberSettings` / `adminScheduleOverrides`: lectura propia o admin; escritura **solo admin**.
- **Ningún `delete`** (se usa `voided`).

## 6. Cálculo de puntualidad
Prioridad de horario: **1) excepción por fecha → 2) horario semanal → 3) sin horario.**
Reglas: dentro de gracia → `puntual`; pasada la gracia → `tarde`; con horario y sin
ingreso → `ausente`; ingreso sin salida → `incompleto`; salida antes de lo esperado →
`salida temprana`; sin horario pero marcó → `fuera de horario`; corregido → badge
`editado`; `statusOverride` → `justificado`. Métricas: `lateMinutes`, `workedMinutes`,
`expectedMinutes`, `isLate`, `isOnTime`, `isIncomplete`, `leftEarly`, `status`.

## 7. Configuración manual en Firebase / Apps Script
1. **Publicar las reglas**: pega `firestore.rules` en Firebase Console → Firestore → Reglas → Publicar.
2. **No requiere índices** nuevos (las consultas usan `orderBy("date")` + `where("email")`,
   que Firestore resuelve con índice simple; si pidiera un índice compuesto, usa el enlace del error).
3. **Agregar/quitar miembros**: edítalos en `HUB.USERS` (app.js) **y** en `isTeam()` (firestore.rules).
   Para nuevos admins: agrégalos en `ADMIN_EMAILS` (app.js) **y** en `isAdmin()` (rules).
4. **Apps Script**: sin cambios. El endpoint actual sigue recibiendo el mismo payload de ingreso.
5. Las colecciones se crean solas al guardar el primer documento (no hay que crearlas a mano).

## 8. Cómo probar
- **Login usuario normal** (ej. `licethrinconr@gmail.com`): ve Inicio (su estado), Marcar, Registros (solo los suyos).
- **Login admin** (`alekcaballeromusic@gmail.com` o `catalina.medina.leal@gmail.com`): ve además Estadísticas, Configuración y Equipo.
- **Marcar ingreso/salida**: tab *Marcar* → QR en sede o remoto (si está autorizado).
- **Configurar horario**: tab *Configuración* → elige miembro → ajusta días → *Guardar horario*.
- **Ver puntualidad**: tab *Estadísticas* → rango Hoy/Semana/Mes → KPIs + tabla por miembro/día.
- **Corregir un registro**: tab *Registros* → *Editar* → cambia hora/estado + motivo → *Guardar correccion* (queda en `correctionHistory`, sin tocar el horario semanal).
- **Crear excepción**: *Configuración* → *+ Excepción por fecha*.
- **Exportar**: *Registros* → *Exportar CSV*; *Estadísticas* → *Copiar resumen* / *Copiar reporte*.

## Notas
- Todo en zona horaria `America/Bogota`, fechas `YYYY-MM-DD`, horas `HH:mm`.
- Interfaz clara (sin modo oscuro), acentos azul `#0C41C4` / morado `#680DBF` / fucsia `#CE0071`.
- Compatible con GitHub Pages (rutas relativas, módulos ES, sin build step).
