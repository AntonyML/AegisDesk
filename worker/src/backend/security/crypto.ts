const encoder = new TextEncoder();

export function randomToken(bytes = 24): string {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return toBase64Url(data);
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return toBase64Url(new Uint8Array(digest));
}

export function timingSafeEqual(left: string, right: string): boolean {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  if (leftBytes.byteLength !== rightBytes.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

export function jsonError(
  code: string,
  status: number,
  details?: Record<string, unknown>,
): Response {
  return Response.json(
    { error: code, code, message: errorMessage(code), ...details },
    { status },
  );
}

function errorMessage(code: string): string {
  const messages: Record<string, string> = {
    SENSITIVE_DATA_SUSPECTED:
      "La descripción contiene datos sensibles o confidenciales (claves, contraseñas, tokens o tarjetas).",
    TOO_LONG: "El campo excede la longitud máxima permitida.",
    INVALID:
      "El valor del campo es inválido o no cumple con el formato requerido.",
    assignment_group_mismatch:
      "El usuario y el grupo no pertenecen a la misma organización.",
    assignment_organization_mismatch:
      "La organización, el grupo y el usuario no son compatibles.",
    group_not_available: "El grupo no existe o está desactivado.",
    managed_user_not_available: "El usuario no existe o está desactivado.",
    organization_not_available: "La organización no existe o está desactivada.",
    organization_not_found: "La organización indicada no existe.",
    installation_not_found: "La instalación indicada no existe.",
    cycle_not_found: "El ciclo indicado no existe.",
    invalid_payload: "Revisá los datos enviados.",
    rate_limited:
      "Demasiadas solicitudes. Por favor intentá nuevamente más tarde.",
    csrf_protection_failed:
      "Petición rechazada por verificación de seguridad (CSRF).",
    invalid_content_type:
      "El encabezado Content-Type debe ser application/json.",
  };
  return messages[code] ?? code;
}

function toBase64Url(data: Uint8Array): string {
  let binary = "";
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
