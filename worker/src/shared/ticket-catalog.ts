export const TICKET_CATEGORIES = [
  {
    value: "aegisdesk",
    label: "AegisDesk",
    issues: [
      { value: "no_inicia", label: "No inicia o no abre" },
      { value: "mensaje_error", label: "Muestra un mensaje de error" },
      { value: "aviso_bloqueo", label: "Muestra un aviso o bloqueo" },
      { value: "terminos", label: "Problema con los términos o su aceptación" },
      { value: "otro", label: "Otro problema de AegisDesk" },
    ],
  },
  {
    value: "sidc",
    label: "SIDC",
    issues: [
      { value: "no_abre", label: "No se abre" },
      { value: "mensaje_error", label: "Muestra un mensaje de error" },
      { value: "acceso", label: "Problema de inicio de sesión o acceso" },
      {
        value: "lento_cierre",
        label: "Está lento o se cierra inesperadamente",
      },
      { value: "otro", label: "Otro problema de SIDC" },
    ],
  },
  {
    value: "equipo_red",
    label: "Equipo o conexión",
    issues: [
      { value: "sin_conexion", label: "No hay conexión" },
      { value: "lentitud", label: "El equipo está lento" },
      { value: "permisos", label: "Problema de permisos o acceso" },
      { value: "otro", label: "Otro problema de equipo o conexión" },
    ],
  },
] as const;

export function isTicketCategory(value: string): boolean {
  return TICKET_CATEGORIES.some((category) => category.value === value);
}

export function getTicketIssueSummary(
  categoryValue: string,
  issueValue: string,
): string | undefined {
  const category = TICKET_CATEGORIES.find(
    ({ value }) => value === categoryValue,
  );
  const issue = category?.issues.find(({ value }) => value === issueValue);
  return category && issue
    ? `Área: ${category.label}; problema: ${issue.label}`
    : undefined;
}
