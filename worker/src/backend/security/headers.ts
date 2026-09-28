export function bearer(request: Request): string | null {
  return authorizationValue(request, "bearer");
}

export function enrollmentCode(request: Request): string | null {
  return authorizationValue(request, "enrollment");
}

function authorizationValue(
  request: Request,
  expectedScheme: string,
): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const [scheme, value] = header.split(" ", 2);
  return scheme?.toLowerCase() === expectedScheme && value ? value : null;
}
