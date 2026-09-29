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

export function jsonError(code: string, status: number): Response {
  return Response.json(
    { error: code, message: errorMessage(code) },
    { status },
  );
}

function errorMessage(code: string): string {
  const messages: Record<string, string> = {
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
