export const PROPERTY_TYPES = [
  { value: "casa", label: "Casa" },
  { value: "departamento", label: "Departamento" },
  { value: "oficina", label: "Oficina" },
  { value: "local", label: "Local comercial" },
  { value: "terreno", label: "Terreno" },
  { value: "bodega", label: "Bodega" },
  { value: "industrial", label: "Espacio industrial" },
];

export const TYPE_LABEL = Object.fromEntries(PROPERTY_TYPES.map((t) => [t.value, t.label]));

export const EMPLOYMENT_TYPES = [
  { value: "empleado_formal", label: "Empleado formal" },
  { value: "empresario", label: "Empresario / Dueño de negocio" },
  { value: "independiente", label: "Independiente / Freelance" },
  { value: "estudiante", label: "Estudiante" },
  { value: "otro", label: "Otro" },
];

export function formatMXN(n) {
  return (n || 0).toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  });
}

export function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

export const STATUS_LABEL = {
  disponible: "Disponible",
  rentado: "Rentado",
  en_proceso: "En proceso",
  pausado: "Pausado",
  pendiente: "Pendiente",
  en_revision: "En revisión",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  borrador: "Borrador",
  activo: "Activo",
  finalizado: "Finalizado",
};

export const RISK_LABEL = {
  bajo: "Riesgo bajo",
  medio: "Riesgo medio",
  alto: "Riesgo alto",
};

export const MEX_STATES = [
  "Aguascalientes", "Baja California", "Baja California Sur", "Campeche", "Chiapas",
  "Chihuahua", "CDMX", "Coahuila", "Colima", "Durango", "Estado de México", "Guanajuato",
  "Guerrero", "Hidalgo", "Jalisco", "Michoacán", "Morelos", "Nayarit", "Nuevo León",
  "Oaxaca", "Puebla", "Querétaro", "Quintana Roo", "San Luis Potosí", "Sinaloa", "Sonora",
  "Tabasco", "Tamaulipas", "Tlaxcala", "Veracruz", "Yucatán", "Zacatecas",
];

export const LEASE_TERMS = [
  { value: "6", label: "6 meses" },
  { value: "12", label: "12 meses" },
  { value: "18", label: "18 meses" },
  { value: "24", label: "24 meses" },
];

export const AMENITIES_OPTIONS = [
  "Gimnasio", "Alberca", "Roof garden", "Seguridad 24h", "Elevador",
  "Estacionamiento de visitas", "Área de lavado", "Balcón", "Jardín", "Aire acondicionado",
];

export const CITIES = [
  { name: "Ciudad de México", state: "CDMX", img: "https://images.unsplash.com/photo-1518105515732-8df2a35c0c56?crop=entropy&cs=srgb&fm=jpg&q=85&w=600" },
  { name: "Monterrey", state: "Nuevo León", img: "https://images.pexels.com/photos/17238410/pexels-photo-17238410.jpeg?auto=compress&cs=tinysrgb&w=600" },
  { name: "Guadalajara", state: "Jalisco", img: "https://images.unsplash.com/photo-1690130206583-3ad3f9515b82?crop=entropy&cs=srgb&fm=jpg&q=85&w=600" },
  { name: "Querétaro", state: "Querétaro", img: "https://images.unsplash.com/photo-1531166473306-c4c0827f3a89?crop=entropy&cs=srgb&fm=jpg&q=85&w=600" },
  { name: "Puebla", state: "Puebla", img: "https://images.unsplash.com/photo-1579967742648-bcb8bacfee66?crop=entropy&cs=srgb&fm=jpg&q=85&w=600" },
  { name: "Toluca", state: "Estado de México", img: "https://images.unsplash.com/photo-1674252260339-6a9986775993?crop=entropy&cs=srgb&fm=jpg&q=85&w=600" },
];

export const STAFF_ROLE_LABELS = {
  superadmin: "Superadministrador",
  admin_general: "Administrador general",
  operaciones: "Operaciones",
  revision_propiedades: "Revisión de propiedades",
  soporte: "Soporte",
  finanzas: "Finanzas",
  cobranza: "Cobranza",
  legal: "Área legal",
  notaria: "Notaría",
};

export const PERMISSION_LABELS = {
  consultar: "Consultar",
  crear: "Crear",
  editar: "Editar",
  aprobar: "Aprobar",
  rechazar: "Rechazar",
  descargar: "Descargar",
  eliminar: "Eliminar",
  administrar_pagos: "Administrar pagos",
  administrar_contratos: "Administrar contratos",
  consultar_documentos_sensibles: "Documentos sensibles",
  modificar_decisiones_automaticas: "Modificar decisiones automáticas",
  administrar_usuarios: "Administrar usuarios",
};
