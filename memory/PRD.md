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

## Notes
- Stripe: modo prueba (sandbox reclamable). Pagos de renta procesados sin cálculo automático de impuestos (procesamiento directo). Se puede cambiar el plan fiscal más adelante.
- Credenciales de prueba en `/app/memory/test_credentials.md`.
