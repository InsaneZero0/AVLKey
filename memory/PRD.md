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

## Inmuebles del arrendador (2026-08-02)
- Verificación del arrendador: dos botones — "Guardar" (borrador editable, tooltip) y "Enviar información" (AlertDialog de confirmación → saveFiscal(true) → POST /api/users/me/registro/submit). Tras enviar, el formulario fiscal/bancario queda bloqueado (fieldset disabled) con aviso de envío.
- PropertyForm (Publicar inmueble): botón "Guardar" (borrador, review_stage="borrador", no público) además de "Enviar información" (review_stage="recibido" → validación). PropertyInput acepta review_stage.
- AdminMemberDetail (arrendador): cada propiedad muestra toda la info del formulario (descripción, tipo, colonia, ciudad, estado, dirección, renta, mantenimiento, recámaras/baños/estac/m², amueblado, pet friendly, amenidades, fotos) SIN mapa, antes de los radios de validación. En MyProperties la info se muestra siempre; fotos apiladas verticalmente bajo la principal. Mapa eliminado.
- MyProperties: botón "Detalles" por inmueble que despliega toda la info del formulario de publicación (descripción, tipo, colonia, ciudad, estado, dirección, renta, mantenimiento, recámaras/baños/estac/m², amueblado, pet friendly, amenidades, fotos) + mapa de ubicación.
- Nuevo componente /app/frontend/src/components/MapEmbed.js (Google Maps embed sin API key vía maps.google.com/maps?q=...&output=embed).
- PropertyForm: mapa de ubicación en tiempo real bajo el campo de dirección.

## Solicitudes + Análisis de Riesgo (2026-08-02)
- POST /api/applications ahora calcula el riesgo AUTOMÁTICAMENTE desde el registro del arrendatario: compute_risk_auto(total_income, rent_total, num_occupants, registro_stage, has_consent). total_income = ingreso solicitante + suma habitantes; rent_total = price_month + maintenance_fee; factores: relación ingreso/renta, estado del registro (autorizado/aprobado/en_revision/recibido/doc_faltante/rechazado), consentimiento, ocupantes. Score 0-100 → bajo(≥70)/medio(≥45)/alto.
- App doc guarda income_total, cohabitants_income, capacity(30%), num_occupants, registro_stage, has_consent, risk_score/level, income_ratio. Notifica al arrendador.
- PropertyDetail: diálogo de solicitud sin ingreso manual; muestra capacidad de pago (30%) vs renta+mantenimiento y avisos. MyApplications muestra badge de riesgo + ingreso total + capacidad. AdminApplications muestra capacidad/ocupantes + override manual (permiso modificar_decisiones_automaticas).

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
- Registro (frontend): botón "Eliminar registro" en el resumen → AlertDialog ("Toda tu información será borrada...") → DELETE /api/users/me/registro (borra fiscal_info, consentimiento, documentos del arrendatario, flags) → reaparece el formulario vacío para un registro nuevo.
- Registro (frontend): dos botones — "Guardar" (borrador editable, sin validación estricta) y "Enviar información" (AlertDialog de confirmación → valida obligatorios, POST /api/users/me/registro/submit marca registro_submitted=true y estado inicial "recibido"). Al enviar, el formulario se reemplaza por un RESUMEN de solo lectura (RegistroResumen) no editable. Teléfono del solicitante y de cada habitante obligatorio; RFC/CURP obligatorios (o pasaporte si extranjero).
- Registro (frontend): comprobantes del solicitante quitados de "Datos del solicitante" (van en Documentos). Botón único "Enviar información" al final (envía datos fiscales + consentimiento). Consentimiento crediticio arriba de "Documentos del contratante principal". Sin apartado de "Tarjeta de pago".

## Actividad económica del arrendatario (2026-08-03)
- Perfil del arrendatario (/panel/perfil): sección "Actividad económica actual" (selector Empleado/Empleado de gobierno/Profesionista/Comerciante/Otro, descripción máx.20, fecha inicio/fin date pickers, empresa máx.25, jefe inmediato máx.25) + dos formularios idénticos "Empleos anteriores". Se conserva el campo simple fiscal_info.actividad_economica.
- Botones del perfil (solo arrendatario): se quitaron los 3 botones individuales; ahora "Guardar" (borrador, tooltip "Al guardar podrás modificar posteriormente.") y "Enviar información" (AlertDialog "Revisa la información... no podrás modificar") que fija actividad_economica_submitted=true y bloquea los campos (fieldset disabled). Arrendador conserva "Guardar cambios".
- Backend: ProfileUpdate + PATCH /users/me aceptan actividad_economica_detalle (ActividadEconomica), empleos_anteriores (List[ActividadEconomica]) y actividad_economica_submitted (bool).
- Panel interno: la lista de Arrendatarios (/admin/arrendatarios) tiene columna "Actividad económica" con link "Ver actividad económica" (→ /admin/miembro/:id#actividad-economica) cuando el arrendatario ya envió, o "Sin enviar". El expediente (AdminMemberDetail) muestra la sección "Actividad económica y empleos anteriores" (ancla + scroll) solo cuando actividad_economica_submitted.

## Contrato desde visita — selector de fecha (2026-08-05)
- Visitas (arrendador): visita "completada" muestra botón "¿Quieres hacer un contrato de arrendamiento con: [Nombre]?" → abre diálogo con campo "A partir de:".
- Selector de fecha restringido: deshabilita hoy y los próximos 3 días; solo permite ventana del 4º al 10º día (min=+4, max=+10). Backend valida el mismo rango (POST /api/visits/{id}/create-contract, payload { start_date }); si existe contrato activo/borrador para ese arrendatario+inmueble lo devuelve sin duplicar.
- Al crear: contrato borrador (renta, depósito, comisión 5%, mantenimiento, 12 meses) y navega a /panel/contratos. `createContract` estaba llamado pero no definido en Visits.js (botón roto); ahora implementado.
- Verificado: backend (curl) rechaza +2/+15 días y acepta +5; frontend (screenshot) muestra diálogo con default +4 días.

## Contrato → revisión del administrador (2026-08-05)
- Al crear contrato desde visita completada, ahora se envía SOLO al administrador (no al arrendatario ni al notario). Estado inicial `en_revision_admin`.
- Se genera un texto de contrato ficticio de prueba (build_contract_text) con datos reales del inmueble/arrendador/arrendatario, guardado en el campo `contract_text`; asociado a la propiedad (property_id + property_public_id).
- notify_staff("administrar_contratos", ...) avisa a superadmin/admin_general/operaciones/legal con link /admin/contratos. El arrendatario NO ve el contrato mientras está en revisión (filtro en /my/contracts); el arrendador sí lo ve.
- Nuevo endpoint PATCH /api/admin/contracts/{id} (permiso administrar_contratos): edita contract_text y status (en_revision_admin/ajustado/listo_para_firma/borrador); notifica al arrendador del avance.
- AdminContracts.js: tabla con folio del inmueble, badge de estado y botón "Revisar / ajustar" → diálogo con selector de estado + textarea editable del texto del contrato + "Guardar ajustes".
- Verificado: backend (curl) contrato va a admin, arrendatario no lo ve, admin ajusta ok; frontend (screenshot) diálogo de revisión renderiza el contrato ficticio.

## Contrato en expediente del arrendatario + link de revisión (2026-08-05)
- El expediente del arrendatario (AdminMemberDetail) ahora muestra una sección "Contratos" con cada contrato (folio del inmueble, renta, inicio, badge de estado) y botón "Abrir y revisar".
- El botón navega a /admin/contratos?open={id}; AdminContracts lee el query param y abre automáticamente el diálogo de revisión/ajuste con el texto del contrato genérico cargado.
- Backend: /admin/members/{id} ahora devuelve `contracts` (contratos donde tenant_id == miembro). Se conserva build_contract_text (contrato genérico de prueba). Verificado con screenshots (sección + auto-apertura del diálogo).

## Plantilla de contrato ajustada (2026-08-06)
- Plazo seleccionable al crear el contrato desde la visita: 6/12/24 meses (default 12); backend valida y calcula end_date con add_months (respeta meses reales, no 365 días).
- build_contract_text reescrito con 13 cláusulas: Objeto, Destino/Uso (EXCLUSIVAMENTE habitacional), Vigencia forzosa, Renta, Incremento anual (INPC/INEGI), Depósito, Fondo de mantenimiento, Recargo por pago tardío (10% de la renta si se paga después del día 5), Pena por terminación anticipada (1 mensualidad), Comisión de administración, Obligaciones, Mediación (previa, a través de rentaloenlinea.com) y Jurisdicción.
- Verificado: backend (curl) contrato 24 meses genera end_date correcto y todas las cláusulas presentes; frontend (screenshot) selector "Plazo del contrato".

## Descargar contrato en PDF (2026-08-06)
- Enlace "Contratos" agregado al menú del panel interno (AdminLayout, perm administrar_contratos) — antes no había forma de navegar a /admin/contratos.
- Backend: GET /api/admin/contracts/{id}/pdf (perm administrar_contratos) genera el PDF con reportlab (build_contract_pdf) a partir de contract_text, respuesta application/pdf con Content-Disposition.
- Frontend AdminContracts: botón "Descargar PDF" en el diálogo de revisión y botón "PDF" por fila en la tabla (descarga vía blob). reportlab agregado a requirements.txt.
- Verificado: PDF renderizado (2 páginas, 13 cláusulas, texto justificado) vía skill document-verification; botón visible en el diálogo.

## Precios y comisiones en Publicar inmueble (2026-08-06)
- Sección "Precios (MXN)" rediseñada: Renta mensual (input), checkbox opcional "Garantía de daños" (5% × renta), checkbox opcional "Garantía de pago puntual" (5% × renta), línea fija "Comisión plataforma" (4% × renta) y "Total mensual (informativo)" = renta + garantías marcadas + comisión.
- Campo "Mantenimiento" (3%) ELIMINADO del formulario (maintenance_fee=0). El total es solo informativo para el arrendador.
- Comisión de plataforma cambiada a 4% en TODO (contrato incluido): create_contract_from_visit y generación por solicitud usan price_month*0.04.
- Backend PropertyInput: nuevos campos garantia_danos:bool, garantia_pago_puntual:bool (persisten y se recargan al editar).
- Verificado: cálculo en UI (renta 10,000 → daños 500, pago 500, comisión 400, total 11,400) y persistencia vía curl.

## Comisiones/garantías se RESTAN de la renta (2026-08-06)
- Corrección: garantías (daños 5%, pago puntual 5%) y comisión plataforma (4%) las paga el arrendador y la plataforma las descuenta, por lo que se RESTAN de la renta (antes se sumaban).
- Total renombrado a "Total a recibir (neto, informativo)" = renta − garantías marcadas − comisión; montos deducidos se muestran con "−" en rojo. Ej: renta 10,000 con ambas garantías → 10,000 − 500 − 500 − 400 = 8,600 neto.

## Tooltips de garantías (2026-08-06)
- Garantía de daños: ícono Info con tooltip "Cubre por daños hasta: $X" donde X = monto del descuento (5% renta) × 60. Ej. renta 10,000 → descuento 500 → "hasta $30,000".
- Garantía de pago puntual: tooltip "Cubre pago puntual antes del día 10 del mes. En caso de incumplimiento hasta 6 meses de renta."
- Verificado por screenshot (tooltip daños $30,000 con renta 10,000).

## Aviso al enviar publicación (2026-08-06)
- PropertyForm: al pulsar "Enviar información" se muestra un AlertDialog "Antes de enviar" con: "Tu inquilino pagará el 2.5% de mantenimiento; a los 12 meses o al término del contrato se te depositará en tu cuenta para mantenimiento" y "Tu inquilino además pagará el 4% de comisión." Botones Aceptar (envía review_stage=recibido) / Cancelar. El botón Guardar (borrador) no dispara el aviso.
- Títulos de garantías muestran "(opcional)".
- Verificado por screenshot.

## Detalle público: depósito y cuota (2026-08-06)
- PropertyDetail (tarjeta de precios): "Depósito en garantía (1 mes de renta)" = price_month (fijo, ya no usa prop.deposit) y nueva línea "Cuota Réntalo en Línea (4%)" = price_month*0.04.
- Backend: depósito del contrato = 1 mes de renta (prop["price_month"]) en ambos flujos (create_contract_from_visit y generación por solicitud aprobada).
- Verificado por screenshot (renta 11,000 → depósito 11,000, cuota 440).

## Menú del arrendador gated por autorización (2026-08-06)
- DashboardLayout: para el arrendador, "Mi perfil" siempre habilitado. "Publicar inmueble" se habilita SOLO cuando user.registro_stage === "autorizado" (checkbox "Autorizado" del admin). El resto (Mis inmuebles, Solicitudes recibidas, Visitas, Contratos, Pagos, Resumen) permanece deshabilitado (gris + candado, con tooltip). Aplica en sidebar y nav móvil.
- El arrendatario conserva todas sus opciones habilitadas.

## Menú del arrendador: 3 niveles (2026-08-06)
- Nivel 1 (registro nuevo): solo "Mi perfil".
- Nivel 2 (registro_stage === "autorizado"): + "Publicar inmueble".
- Nivel 3 (tiene ≥1 inmueble con review_stage === "publicado"): se habilita el resto (Mis inmuebles, Solicitudes recibidas, Visitas, Contratos, Pagos, Resumen). DashboardLayout consulta /my/properties (hasPublished). Tooltip de esas opciones: "Se habilitará cuando el administrador autorice la publicación de tu inmueble."
- Verificado por screenshots (estados no autorizado, autorizado, y con inmueble publicado → menú completo).

## Características sin negativos (2026-08-06)
- PropertyForm > Características: Recámaras, Baños y Estacionamientos ahora sanitizan la entrada a solo dígitos (replace /\D/g) igual que Área m², bloqueando el signo "−" y cualquier no-dígito. Verificado por screenshot ("-5"→5, "-3abc2"→32, "-1"→1).

## Selectores numéricos con steppers, solo positivos (2026-08-06)
- PropertyForm > Características: Recámaras, Baños, Estacionamientos, Área m² vuelven a type="number" (flechas stepper) con min="0" step="1"; Field bloquea teclas "-","+","e","E" (onKeyDown) y sanitiza onChange a solo dígitos. Verificado ("-5"→5, steppers visibles).

## Auto-mayúscula primera letra (2026-08-06)
- PropertyForm: helper capFirst aplicado a Título, Descripción, Colonia, Ciudad, Estado, Dirección y Amenidades; la primera letra del valor se capitaliza automáticamente al escribir. Verificado por screenshot.

## Buscar por ID en Explorar (2026-08-06)
- Explore: el filtro "Búsqueda / Palabra clave" se renombró a "Buscar por ID" (placeholder "Ej. P160826002", testid filter-id).
- Backend /properties: el parámetro q ahora también busca por public_id (regex case-insensitive), además de title/description/city/colonia. Verificado por curl (P160826002→1, p1608→2) y screenshot.

## Estadía estimada en solicitud (2026-08-06)
- Solicitud de arrendamiento (PropertyDetail): nuevo Select "¿Cuánto tiempo estimas tu estadía?" con opciones 6, 12, 18, 24, 30 meses (default 6). Se envía stay_months en el payload.
- Backend ApplicationInput: campo stay_months:int=6 (persistido vía model_dump). Verificado por screenshot.

## Mantenimiento 4% (2026-08-06)
- PropertyForm: nueva línea "Mantenimiento" = 4% de la renta (informativa, "lo paga el inquilino", no reduce el neto del arrendador). Payload guarda maintenance_fee = 4% de la renta.
- PropertyDetail: línea "Mantenimiento (4%)" = price_month*0.04/mes, siempre visible, junto a "Cuota Réntalo en Línea (4%)".
- Verificado por screenshots (form: renta 10,000 → mant 400; detalle: renta 11,000 → cuota 440 y mant 440/mes).

## Video en solicitud (reemplaza mensaje de texto) (2026-08-06)
- Solicitud de arrendamiento: "Mensaje al arrendador" ahora es subida de VIDEO (máx. 45 seg). Placeholder/guía: "Di tu nombre, tu ocupación, tu antigüedad, quiénes habitarían la propiedad (familiares, esposa, amig@s) y explica el motivo de la búsqueda en renta."
- Validación de duración ≤45s en cliente (metadata del <video>) + formato/size; preview con <video controls>.
- Backend: POST /applications/upload-video (mp4/webm/mov/ogg, ≤60MB) → object storage bajo {APP}/properties/applications/{uid}/; ApplicationInput.video_url persistido. MIME_TYPES ampliado con video.
- Verificado: curl (mp4 aceptado, txt rechazado) y screenshot del control.

## Solicitar arrendamiento deshabilitado (2026-08-06)
- PropertyDetail: el botón "Solicitar arrendamiento" ahora está disabled (atenuado, no abre el diálogo) con tooltip "Las solicitudes de arrendamiento están deshabilitadas temporalmente." Se conserva el formulario/diálogo (incluye subida de video) para reactivarlo. "Agendar una visita" sigue activo.

## Piso y número interior (opcionales) (2026-08-06)
- PropertyForm: nuevos inputs "Piso (opcional)" y "Número interior (opcional)" debajo de Dirección. Backend PropertyInput: piso:str="", numero_interior:str="". Verificado (UI + persistencia via curl).

## Piso/interior en dirección exacta (2026-08-06)
- exact_address() ahora incluye "Piso X" e "Int. Y" cuando existen; aplica a la dirección revelada al arrendatario tras confirmar la visita (v.exact_address) y al texto del contrato. Verificado con casos de prueba.

## Características para Oficina (2026-08-06)
- PropertyForm: si property_type === "oficina", la sección Características muestra Privados (bedrooms), Áreas de trabajo (nuevo work_areas), Baños, Estacionamientos, Área m² y checkbox Recepción (reemplaza Amueblado/Pet friendly). Otros tipos sin cambios.
- Backend PropertyInput: work_areas:int=0, reception:bool=False. Verificado por screenshot.

## Características de Oficina en detalle público (2026-08-06)
- PropertyDetail: si property_type === "oficina", los "facts" muestran Privados (bedrooms), Áreas de trabajo (work_areas), Baños, Estacionamientos, Área m² y Recepción (si reception=true), con iconos DoorClosed/LayoutGrid/Bell; oculta Amueblado/Pet friendly. Otros tipos sin cambios. Verificado por screenshot.

## Fix texto Mantenimiento 3%→4% (2026-08-06)
- MyProperties.js (Mis inmuebles) y AdminMemberDetail.js (expediente admin): etiqueta corregida de "Mantenimiento (3%)" a "Mantenimiento (4%)". Verificado por testing_agent (frontend 100%, sin ocurrencias de 3% restantes).

## Enviar contrato al solicitante (solo lectura) (2026-08-06)
- AdminContracts (diálogo Revisar/ajustar): nuevo botón "Enviar a solicitante" → POST /admin/contracts/{id}/send-to-tenant (guarda ajustes previos si cambió el texto), estado pasa a "enviado_arrendatario" y notifica al arrendatario. Nuevo estado agregado a STATUS_OPTIONS/ADMIN_CONTRACT_STATUSES/STATUS_LABEL.
- Arrendatario (Contracts.js): contrato enviado aparece con badge "Enviado al arrendatario" y botón "Ver contrato" → diálogo de SOLO LECTURA (<pre> no editable) + "Descargar PDF" (GET /my/contracts/{id}/pdf, solo partes del contrato). Etiqueta de comisión corregida a 4%.
- my_contracts sigue ocultando al arrendatario solo los contratos en "en_revision_admin".
- Verificado por curl (antes de enviar no lo ve; tras enviar lo ve con texto+PDF) y screenshots (botón admin + vista solo lectura tenant).

## Persona física/moral en perfil del arrendador (2026-08-06)
- Profile.js (solo arrendador): selector "¿Cómo te registras?" con dos opciones (checkbox) Persona física / Persona moral. Física → formulario actual (Nombre, Teléfono, RFC, CURP). Moral → oculta esos y muestra: Razón social, RFC, Representante legal, RFC del representante legal, Actividad de la empresa, Régimen fiscal, Nombre de contacto, Teléfono de contacto.
- Persistencia: tipo_persona + empresa_datos (dict) en ProfileUpdate/PATCH /users/me. Verificado por screenshot.

## Stripe Connect (PENDIENTE de decisión del usuario)
- Playbook obtenido. Falta respuesta del usuario a ask_human (onboarding Express, momento de dispersión, retenciones, manejo de depósito). Retomar cuando el usuario responda.

## Menú del arrendatario gated por autorización (2026-08-06)
- Nuevo arrendatario: solo "Registro" y "Mi perfil" habilitados (Mi perfil movido a 2º lugar, bajo Registro). El resto (Resumen, Mis solicitudes, Favoritos, Visitas, Contratos, Pagos) se habilita cuando user.registro_stage === "autorizado"; mientras tanto gris + candado + tooltip. Aplica en sidebar y nav móvil.

## Persona física/moral también para arrendatario (2026-08-06)
- Profile.js: el selector "¿Cómo te registras?" (Persona física/moral) ahora aplica a arrendador Y arrendatario (isExternal). En persona moral se sustituyen Nombre/Teléfono/RFC/CURP por los campos de empresa. Las secciones de actividad económica/empleos del arrendatario se conservan. Verificado (selector visible en perfil del arrendatario; campos moral idénticos al arrendador ya verificado).

## Máscara de RFC (2026-08-06)
- Profile.js (arrendador y arrendatario): RFC persona física con máscara 4 letras + 6 dígitos + 3 indistintos (13); RFC persona moral 3 letras + 6 dígitos + 3 indistintos (12); RFC del representante legal usa formato física (13). Helpers rfcFisica/rfcMoral fuerzan mayúsculas y orden. Verificado por screenshot.

## Leyenda "Ya puedes publicar tus propiedades" (2026-08-06)
- Profile.js: cuando isLandlord y registro_stage === "autorizado", muestra una leyenda verde "Ya puedes publicar tus propiedades" debajo de "Administra tu información personal.". Verificado por screenshot.

## Notes
- Stripe: modo prueba (sandbox reclamable). Pagos de renta procesados sin cálculo automático de impuestos (procesamiento directo). Se puede cambiar el plan fiscal más adelante.
- Credenciales de prueba en `/app/memory/test_credentials.md`.

## Máscaras CURP/RFC en Registro del arrendatario (2026-08-25)
- CURP con formato estricto (4 letras + 6 dígitos + 1 letra + 5 letras + 1 alfanumérico + 1 dígito = 18, mayúsculas) en Verification.js (reg-curp y co-curp-{idx}); ya existía en Profile.js.
- RFC persona física (4 letras + 6 dígitos + 3 alfanuméricos = 13) en Verification.js (reg-rfc y co-rfc-{idx}).
- Perfil arrendatario: en "Actividad económica actual" se quitó "Fecha de fin" (prop hideFechaFin en ActividadFields); Empleos anteriores conservan ambas fechas.
- Banner "Estatus de tu registro" en Verification.js siempre visible con fondo #F2EC91 (placeholder "Sin enviar").

## Visitas — avisos (2026-08-25)
- Arrendatario: visita "confirmada" muestra aviso "VISITA ACEPTADA · <fecha>" con fondo #F2F18F (data-testid visit-accepted-notice-{id}).
- Arrendador: visita "confirmada" muestra leyenda "Si quieres hacer un contrato con esta persona, oprime Completada." (#F2F18F). Al oprimir "Completada" aparece AlertDialog "Generar contrato de arrendamiento" (¿Deseas hacer un contrato…?) con Aceptar/Cancelar → act complete attended:true.

## Cobros / Stripe Connect — modelo retenido (2026-08-25)
- Backend (server.py): compute_charge_amounts, get_or_create_customer, _ensure_charge, _charge_now (off_session), _attempt_autocharge, _generate_period.
- Endpoints: POST /payments/card/setup-session, /payments/card/confirm, GET /payments/card; POST /payments/connect/onboard (graceful enabled:false si Connect no activo), GET /payments/connect/status; POST /payments/contracts/{id}/start-billing, /payments/charges/{id}/pay, GET /my/rent-charges; GET /admin/finance/summary, /admin/finance/charges, POST /admin/finance/generate, /admin/finance/charges/{id}/disperse (Stripe Transfer si connect active, si no ledger manual); POST /cron/rent-billing (Bearer WEBHOOK_CRON_SECRET, BackgroundTasks).
- Colección rent_charges: rent, maintenance(4%), commission(4%), guarantee_danos/pago(5% c/u), deposit(1er mes), tenant_total, net_landlord, retained, status(pendiente/pagado/fallido), dispersed, dispersal_method/ref.
- Frontend: Payments.js (branch arrendatario=tarjeta+pagar / arrendador=Connect+retención+cobros netos); AdminFinance.js en /admin/finanzas (resumen + tabla + "Generar cobros del mes" + diálogo "Registrar dispersión"); nav "Finanzas" (perm administrar_pagos).
- Cron: .emergent/crons.yml POST /api/cron/rent-billing día 1 08:00 America/Mexico_City.
- Verificado por curl end-to-end: renta 16,000 → tenant_total 32,640 (incl. depósito), comisión 640, neto 15,360, retenido 16,640; auto-cobro, dispersión manual, cron auth 401/200. Paneles verificados por screenshot.
- PENDIENTE (bloqueado por usuario): activar Connect en Dashboard de Stripe para transferencias reales al banco del arrendador (hoy dispersión = ledger manual).

## Cobranza, recibos, estado de cuenta y depósitos (2026-08-25)
- Recargo por atraso: 10% de la renta si el pago pasa del día 5. _apply_late_fee (base_total + late_fee) aplicado en pay_charge y en cron diario. Campos base_total/late_fee en rent_charges. UI muestra "Incluye recargo $X" (arrendatario) y "Recargo $X" (admin).
- Correo transaccional gestionado (Emergent, playbook Resend): send_email_managed + _assert_safe_email (gate G2/G3). EMERGENT_EMAIL_KEY + EMAIL_FROM_NAME="Réntalo en Línea" en backend/.env. Recibo al pagar (_send_receipt_email) y recordatorio de atraso (_send_reminder_email). Verificado: endpoint 202.
- Cron 2 (.emergent/crons.yml): payments-daily 09:00 CDMX → POST /api/cron/payments-daily (Bearer WEBHOOK_CRON_SECRET) aplica recargos + recordatorios.
- Estado de cuenta por arrendador: botón "Estado de cuenta" en /admin/arrendadores → /admin/estado-cuenta/:userId (AdminStatement.js). Endpoint GET /admin/finance/statement/{user_id} (perm consultar): landlord, charges, totals (net_total, dispersed, pending_dispersal, retained, commission), deposits.
- Caja "Depósitos en garantía" en el estado de cuenta: lista contratos con depósito (1 mes), estado Registrado/Pendiente y botón "Registrar depósito" → POST /admin/finance/contracts/{cid}/register-deposit (perm administrar_pagos, campos deposit_registered/at/reference, notifica al arrendador). Verificado por screenshot. Solo se muestran contratos cuyo cobro inicial (is_first) esté PAGADO.

## Registro del pago Stripe en las 3 vistas (2026-08-25)
- _charge_now: al confirmar el PaymentIntent (off_session) se hace upsert en payment_transactions (session_id=pi.id, concept "renta", period, amount=tenant_total, tenant/landlord, property, payment_status "paid"), además de actualizar rent_charges.
- Payments.js (arrendatario y arrendador): nueva sección "Historial de pagos (Stripe)" que consulta /my/payments (muestra concepto+periodo, inmueble, arrendatario si es arrendador, fecha, monto, estado).
- Admin: /admin/pagos (AdminPayments) muestra las transacciones. BUG corregido: al endpoint admin_payments le faltaba el decorador @api.get("/admin/payments") (devolvía 404); restaurado.
- Verificado end-to-end: pago de 2026-09 ($16,640) visible en admin, arrendatario y arrendador.

## 2026-06 — Publicar inmueble
- Switch "Amueblado" movido debajo de la fila Mantenimiento (sección Precios) en PropertyForm.js; "Pet friendly" permanece en Características. (DONE)
- Régimen fiscal de IVA (checkbox 8%/16%) bajo Amueblado; IVA = renta × tasa, se suma al Total a recibir. Inhabilitado para casa/departamento sin amueblar. Backend PropertyInput.iva_rate. (DONE)
- Texto IVA actualizado: "Lo puedes consultar en tu constancia de situación fiscal, en tu portal de Internet o con tu contador. Dato muy importante." (DONE)
- Local comercial, Bodega y Espacio industrial usan las características de Oficina (Privados, Áreas de trabajo, Baños, Estacionamientos, Área, Recepción); se ocultan Amueblado/Pet friendly. Aplicado en PropertyForm.js y PropertyDetail.js. (DONE)
- Para oficina/local/bodega/industrial, "Amenidades" se renombra a "Detalles especiales" (PropertyForm, PropertyDetail, MyProperties). (DONE)
- IVA en detalle público (fila "IVA (x%)"), en contratos (iva_rate/iva_amount guardados; cláusula CUARTA menciona IVA) y tarjeta de Contratos. Video de solicitud (video_url) visible en Solicitudes recibidas (arrendador) y Admin > Solicitudes. (DONE)
- Bloqueo de horarios de visita: campo slot_key (inmueble|fecha-hora UTC) con índice único parcial en visits; se reserva en crear/confirmar/reprogramar/formalizar y se libera al cancelar/completar/no asistir. Doble reserva → 409 "Ese horario ya fue reservado por otra persona". (DONE)
- Horarios ocupados en gris: en "Agendar visita" (detalle público, por día/hora) y en "Proponer nueva fecha" (Visitas) los horarios reservados del inmueble aparecen deshabilitados con "· Ocupado" y leyenda; validación cliente antes de enviar. Usa GET /properties/{id}/visits/busy. (DONE)
- Menú arrendador: "Mis inmuebles" se habilita desde que se envía el primer inmueble (cualquier review_stage distinto de borrador); el resto del menú sigue requiriendo un inmueble publicado. Se recalcula al cambiar de ruta. (DONE)
- Registro arrendatario: Datos del solicitante (nombre, RFC, CURP, teléfono y lada) se precargan desde Mi perfil cuando el registro aún no los tiene. (DONE)
- Registro arrendatario: RFC, CURP, teléfono (+lada) y actividad económica se toman siempre de Mi perfil y quedan bloqueados (solo lectura) con leyenda/enlace a Mi perfil. (DONE)
- Admin > Arrendatarios: columna "Actividad económica" reemplazada por "Estado de cuenta" (botón → /admin/estado-cuenta-arrendatario/:id). Nueva página AdminTenantStatement.js y endpoint GET /admin/finance/tenant-statement/{user_id} (pagado, pendiente, recargos, depósitos, contratos, historial de cobros). (DONE)
