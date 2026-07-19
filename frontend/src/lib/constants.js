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
