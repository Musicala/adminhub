# Despliegue de notificaciones por correo

Este Apps Script debe desplegarse desde la cuenta `imusicala@gmail.com`. Al ejecutarse como esa cuenta, los correos enviados con `MailApp.sendEmail` saldran desde `imusicala@gmail.com`.

## Pasos

1. Entra a [Google Apps Script](https://script.google.com/) usando la cuenta `imusicala@gmail.com`.
2. Crea un proyecto nuevo.
3. Borra el contenido inicial del archivo `Code.gs`.
4. Pega el contenido de `gas/code.gs` de este proyecto.
5. Guarda el proyecto con un nombre claro, por ejemplo `HUB Admin Musicala - Notificaciones de ingreso`.
6. Haz clic en `Implementar` > `Nueva implementacion`.
7. En tipo de implementacion, elige `Aplicacion web`.
8. Configura:
   - Ejecutar como: `Yo`
   - Quien tiene acceso: `Cualquier usuario` o `Cualquier persona con el enlace`, segun la opcion disponible en la cuenta.
9. Haz clic en `Implementar`.
10. Autoriza los permisos que Google solicite para enviar correo.
11. Copia la URL de la aplicacion web.
12. En `app.js`, reemplaza:

```js
const EMAIL_NOTIFICATION_ENDPOINT = "PEGAR_AQUI_URL_WEB_APP_APPS_SCRIPT";
```

por:

```js
const EMAIL_NOTIFICATION_ENDPOINT = "https://script.google.com/macros/s/URL_DE_TU_IMPLEMENTACION/exec";
```

13. Publica/sube nuevamente el frontend.

## Prueba recomendada

1. Marca un ingreso desde QR o desde la opcion remota/manual.
2. Confirma que el registro se guarde en Firestore en la coleccion `adminShiftRecords`.
3. Revisa que llegue un correo a `notificaciones.musicala@gmail.com`.
4. Marca una salida y confirma que no llegue correo.

Si cambias el codigo del Apps Script despues de desplegarlo, crea una nueva version o edita la implementacion existente para que use la version mas reciente.
