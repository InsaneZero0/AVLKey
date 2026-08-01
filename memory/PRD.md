# PRD — Réntalo en Línea

## Problem Statement (original)
Plataforma web responsive tipo SaaS "Réntalo en Línea" para la administración de arrendamientos tradicionales (viviendas, departamentos, oficinas, locales, terrenos, bodegas, espacios industriales) en México. Conecta arrendadores y arrendatarios: publicación/búsqueda de inmuebles, solicitudes, documentos, contratos, pagos mensuales, depósitos, mantenimiento, cobranza, inspecciones y expedientes legales. Actúa como intermediaria y administradora. Experiencia inspirada en Airbnb, enfocada en arrendamiento tradicional de mediano/largo plazo.

## User Choices
- MVP: publicación + búsqueda + registro + solicitudes **+ contratos y pagos mensuales**.
- Auth: email/contraseña **y** Google (gestionado por Emergent).
- Pagos: Stripe (sandbox claimable).
- Análisis de riesgo: reglas simples (sin IA).
- Diseño: definido por el equipo, temática de bienes raíces México (terracota + navy, fuentes Outfit/Manrope).

## Architecture
- Backend: FastAPI (`/app/backend/server.py`), MongoDB (motor). Auth por cookie httpOnly `session_token` (+ Bearer). Stripe SDK para pagos MXN (checkout dinámico por monto).
- Frontend: React 19 + React Router 7 + Tailwind + shadcn/ui + framer-motion + sonner. Context de auth, rutas protegidas, dashboards por rol.

## Personas
- Arrendador: publica inmuebles, revisa solicitudes con score de riesgo, aprueba (genera contrato), activa contratos, cobra rentas.
- Arrendatario: busca inmuebles, envía solicitudes, firma/administra contratos, paga renta y depósito con tarjeta.

## Implemented (2026-06-19)
- Auth email/contraseña + Google OAuth (Emergent); roles arrendador/arrendatario; perfil y cambio de rol.
- Publicación/búsqueda/detalle de inmuebles con filtros; 8 inmuebles sembrados; 3 usuarios demo.
- Solicitudes de arrendamiento con score de riesgo por reglas (ingreso/renta, empleo, aval, ocupantes).
- Aprobación de solicitud → generación automática de contrato (renta, depósito, comisión 5%, 12 meses); activación/finalización.
- Pagos con Stripe (renta y depósito) en MXN; página de éxito/cancelado con polling; historial de pagos.
- Dashboards por rol con estadísticas.
- Verificado: testing agent backend 16/16, flujos frontend críticos 100%.

## Backlog (prioritized)
- P0: Notificaciones por email (Resend) en solicitud/aprobación/pago; subida de documentos (identidad, comprobantes) con object storage.
- P1: Agendar visitas; inspecciones iniciales/finales con fotos; cobranza/atrasos automáticos y recordatorios; expediente legal/notaría.
- P2: Cobertura de pago (garantía), fondo de mantenimiento con movimientos, mensajería arrendador-arrendatario, reseñas/comunidad, panel admin, generación PDF de contrato.

## RBAC (2026-06-21)
- Roles externos: arrendador/arrendatario; **cuenta dual** (misma cuenta actúa como ambos, cambio de perfil en /panel/perfil).
- Roles internos: superadmin, admin_general, operaciones, revision_propiedades, soporte, finanzas, cobranza, legal, notaria.
- Permisos granulares: consultar, crear, editar, aprobar, rechazar, descargar, eliminar, administrar_pagos, administrar_contratos, consultar_documentos_sensibles, modificar_decisiones_automaticas, administrar_usuarios.
- Deny-by-default vía require_permission(); jerarquía de asignación (can_grant), auditoría de acciones sensibles.
- Panel interno /admin con navegación filtrada por permisos: Resumen, Usuarios, Revisión de propiedades, Solicitudes, Contratos, Pagos, Documentos sensibles, Auditoría.
- Flujo de revisión de propiedades (pendiente/aprobada/rechazada) y override de decisión de riesgo.
- Verificado: RBAC backend 13/13 + regresión 16/16; panel frontend validado.

## Verificación de usuarios (2026-06-21)
- Carga de documentos (object storage) con versiones, visualización controlada por acceso, vencimiento y alertas.
- Arrendador: identificación, comprobante domicilio, RFC, constancia fiscal, acreditación de propiedad, facultad legal (opcional), foto; + info fiscal y **cuenta bancaria** (para recibir renta).
- Arrendatario: identificación, comprobante domicilio, comprobantes de ingresos, info laboral, referencias personales/laborales; + **consentimiento obligatorio** de consulta de historial crediticio guardando fecha, hora, IP, texto, versión y evidencia. Tarjeta vía Stripe (no se almacena).
- Revisión interna (RBAC): aprobar/rechazar/solicitar corrección + fecha de vencimiento; listar/revisar documentos requiere `consultar_documentos_sensibles`.
- Verificado: backend 13/13 verificación + 16/16 base + 13/13 RBAC; flujos frontend 100%.

## Agendamiento de visitas (2026-06-21)
- Arrendatario solicita visita (fecha/hora, horarios ocupados deshabilitados). Arrendador confirma, rechaza, propone nueva fecha (reprograma) o cancela; marca completada / no asistió.
- Dirección exacta revelada solo tras confirmación (para el arrendatario).
- Estados: solicitada, confirmada, reprogramada, cancelada, completada, no_asistio; con historial (timeline) por visita.
- Notificaciones in-app (campana con conteo) + recordatorios de visitas confirmadas en <48h; disponibilidad por inmueble; validación de fecha futura.
- Verificado: backend 14/14 + suites previas; flujos frontend 100%.

## Panel interno de administración (2026-07)
- Cuenta owner superadmin: cpfzamora@yahoo.com.mx / digital2025 (staff_role superadmin).
- Menú del panel interno reducido a: Resumen, Usuarios, Arrendadores, Arrendatarios, Propiedades en revisión.
- Arrendadores/Arrendatarios: listado con folio, nombre, correo, teléfono; nombre clicable → expediente (/admin/miembro/:id).
- Expediente del miembro: info personal, fiscal/bancaria, consentimiento (arrendatario), Documentos enviados (formato Verificación, solo Ver/Descargar), Propiedades con status, Observaciones (textarea máx. 50 → user.admin_note, notifica al arrendador), Revisión de validación (radio: Recibido, En revisión, Documentación faltante, Aprobado, Publicado, Rechazado → property.review_stage + notifica).
- El arrendador ve status de validación (display_status) y observación (admin_note) dentro de cada inmueble en /panel/inmuebles.

## Perfil / Registro (2026-07)
- Registro pide tipo de cuenta (arrendatario/arrendador). Menú del arrendatario NO muestra "Publicar inmueble".
- Barra superior del panel y menú de usuario muestran folio de subscriptor + nombre.
- Folios (nuevos subscriptores/propiedades desde hoy): prefijo + DDMMYY + folio diario 3 dígitos. Arrendatario I, Arrendador A, Propiedad P (ej. I310726001, A310726001, P310726001). Usuarios/propiedades previos conservan su ID anterior (I/A + member_no).
- Publicar inmueble: subtítulo "Esta información pasará al departamento de validación..."; botón "Enviar información"; subida de fotos desde dispositivo (POST /properties/upload-image, servidas en /api/media/{path}); documento que acredita propiedad (acreditacion_propiedad).

## Publicar inmueble — precios (2026-07)
- Bug corregido (foco/un-solo-dígito): Field y MoneyInput movidos a nivel de módulo (se remontaban en cada render).
- Precios con MoneyInput: signo $ dentro del input, etiqueta MX afuera, solo dígitos (sin centavos).
- Campo Depósito eliminado del formulario (backend deposit=0).
- Mantenimiento = 3% de la renta, calculado automáticamente y no editable (disabled).
- Verificado por testing_agent (iteration_7, frontend 100%).

## Publicación gated por estado (2026-07)
- Revisión y validación (radios) ahora se muestran bajo cada propiedad en el expediente del arrendador (panel interno).
- El buscador público (GET /properties) filtra review_stage == "publicado"; una propiedad solo es visible cuando el admin selecciona "Publicado".
- Migración: propiedades aprobadas existentes y seeds -> review_stage "publicado".

## ID de propiedad / folio (2026-07)
- Cada propiedad tiene public_id (P+DDMMYY+NNN); backfill a propiedades existentes.
- El ID se muestra en negritas y color rojo en el detalle (/inmueble/:id), en las tarjetas (PropertyCard) y en el expediente del panel interno.
- Buscador por ID en el hero de la landing (GET /properties/by-folio/{folio}, solo publicadas, tolera minúsculas) → navega al detalle.

## Registro del arrendatario (2026-07)
- Menú del arrendatario: "Verificación" renombrado a "Registro" y movido al tope (arriba de Resumen).
- Encabezado informativo en Registro: "Al llenar y enviar la siguiente información, esta pasará a revisión, te estaremos notificando tu status en tu perfil."
- Formulario "Datos del solicitante": Nombre (fijo/read-only), RFC, CURP (18), Teléfono, Régimen fiscal (selector SAT), Actividad económica, Ingreso mensual neto ($ + MX + coma miles), Comprobantes de ingresos (subida privada), y botón "Compartiré la vivienda con:" (sub-formulario cohabitante con misma info). Almacenamiento privado: POST /uploads/income-proof + GET /uploads/private/{path} (solo dueño o interno con permiso). FiscalInfo con phone, actividad_economica, curp, ingreso_mensual, comprobantes_ingresos, share_housing, cohabitante.

## Registro del arrendatario — ampliación (2026-07-31)
- Datos del solicitante: selectores de Adultos (18+), Menores (12-17), Niños (0-11) y campo libre de Mascotas. Nota "Importante" (amarilla) junto a "Personas que habitarán la propiedad".
- Habitantes: se generan automáticamente = (adultos 18+) − 1 (excluye al solicitante); sin botón "Agregar"/"Quitar". Nombre, RFC y CURP obligatorios.
- Sección "En caso de extranjero" (solicitante y cada habitante): checkbox que revela # de pasaporte + foto de pasaporte + documento migratorio; al activarlo se anulan y deshabilitan RFC, CURP y régimen fiscal.
- Habitantes (adultos 18+): campo de Fotografía de INE (ine_fotos). RFC limitado a 12 caracteres (solicitante y habitantes). Teléfono con selector de prefijo por país (default +52) limitado a 10 dígitos (phone_code).
- Backend FiscalInfo/Cohabitante: adultos_18, menores_12_17, ninos_0_11, mascotas, es_extranjero, pasaporte, pasaporte_fotos, migratorio_fotos, phone_code, cohabitante.ine_fotos.
- Panel interno (AdminMemberDetail): expediente del arrendatario muestra toda la info fiscal, teléfono con prefijo, ocupantes, mascotas, comprobantes/INE/pasaporte/migratorio (fotos privadas), habitantes, consentimiento crediticio y documentos enviados. Radio de validación del registro (Recibido, En revisión, Documentación faltante, Aprobado, Publicado, Rechazado) → user.registro_stage; PATCH /api/admin/members/{id}/registro-stage, notifica al arrendatario (banner de estatus arriba de su Registro).
- Habitantes: teléfono con prefijo de país (10 dígitos, default +52) y parentesco con el contratante principal (Cohabitante.phone, phone_code, parentesco). Se muestran en el expediente admin.
- Estados de registro: radios del registro usan REGISTRO_STAGE_OPTIONS (Recibido, En revisión, Documentación faltante, Aprobado, Autorizado, Rechazado) — SIN "Publicado" (que se conserva solo para validación de propiedades vía REVIEW_STAGE_OPTIONS). Backend REVIEW_STAGES/labels incluye "autorizado".
- Banner de estatus del arrendatario: muestra "Capacidad de pago" (30% del ingreso total) junto al estatus.
- AdminMemberDetail: debajo de Observaciones se muestra "Ingreso mensual total (capacidad de pago)" = ingreso del solicitante + suma de ingresos de habitantes, y debajo "Capacidad de pago mensual (30%)" = 30% del total, formato $X,XXX MX.
- AdminMemberDetail: bloque de radios de validación del registro movido al FINAL de la hoja. El estatus (registro_stage) y las observaciones (admin_note) se muestran al arrendatario en su perfil (/panel/perfil, tarjeta "Estatus de tu registro").
- AdminMemberDetail robusto para cuentas duales: bloques de validación/registro/consentimiento del arrendatario se muestran cuando showTenant (rol arrendatario o existe fiscal_info de arrendatario/consentimiento), aunque la cuenta figure como arrendador.
- Registro (frontend): dos botones — "Guardar" (borrador editable, sin validación estricta) y "Enviar información" (AlertDialog de confirmación → valida obligatorios, POST /api/users/me/registro/submit marca registro_submitted=true y estado inicial "recibido"). Al enviar, el formulario se reemplaza por un RESUMEN de solo lectura (RegistroResumen) no editable. Teléfono del solicitante y de cada habitante obligatorio; RFC/CURP obligatorios (o pasaporte si extranjero).
- Registro (frontend): comprobantes del solicitante quitados de "Datos del solicitante" (van en Documentos). Botón único "Enviar información" al final (envía datos fiscales + consentimiento). Consentimiento crediticio arriba de "Documentos del contratante principal". Sin apartado de "Tarjeta de pago".

## Notes
- Stripe: modo prueba (sandbox reclamable). Pagos de renta procesados sin cálculo automático de impuestos (procesamiento directo). Se puede cambiar el plan fiscal más adelante.
- Credenciales de prueba en `/app/memory/test_credentials.md`.
