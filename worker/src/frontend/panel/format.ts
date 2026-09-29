const dateFormatter = new Intl.DateTimeFormat("es-CR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Costa_Rica",
});

export function formatDate(value: string | null): string {
  if (!value) return "Nunca";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

export function formatRelative(value: string | null): string {
  if (!value) return "Nunca";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "Fecha no disponible";

  const seconds = Math.round((Date.now() - time) / 1000);
  if (seconds < 45) return "Hace unos segundos";
  if (seconds < 3600)
    return `Hace ${Math.max(1, Math.round(seconds / 60))} min`;
  if (seconds < 86400) return `Hace ${Math.round(seconds / 3600)} h`;
  if (seconds < 604800) return `Hace ${Math.round(seconds / 86400)} d`;
  return formatDate(value);
}

export function truncateId(value: string, length = 8): string {
  return value.length <= length ? value : `${value.slice(0, length)}…`;
}

export function statusLabel(value: string): string {
  const labels: Record<string, string> = {
    active: "Activo",
    disabled: "Desactivado",
    revoked: "Revocado",
    open: "Abierto",
    in_progress: "En progreso",
    resolved: "Resuelto",
    spam: "Spam",
  };
  return labels[value] ?? value;
}

export function statusTone(value: string): string {
  if (value === "active" || value === "resolved") return "positive";
  if (value === "disabled") return "warning";
  if (value === "revoked" || value === "spam") return "negative";
  if (value === "in_progress") return "warning";
  return "neutral";
}

export function cycleLabel(dueAt: string | null): string {
  return dueAt ? `Vence ${formatDate(dueAt)}` : "Sin ciclo asignado";
}

export function eventLabel(type: string): string {
  const labels: Record<string, string> = {
    shell_opened: "Apertura del shell",
    sidc_launch_succeeded: "SIDC iniciado",
    sidc_launch_failed: "Fallo al iniciar SIDC",
    maintenance_consent: "Consentimiento de mantenimiento",
    maintenance_blocked: "Mantenimiento pendiente",
  };
  return labels[type] ?? type.replaceAll("_", " ");
}

export function eventTone(type: string): string {
  if (type.includes("failed") || type.includes("blocked")) return "negative";
  if (type.includes("consent")) return "warning";
  return "positive";
}
