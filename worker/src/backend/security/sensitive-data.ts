const PRIVATE_KEY_PATTERN = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/i;
const PASSWORD_PATTERN = /(?:password|contrase[ñn]a|clave)\s*[:=]\s*\S+/i;
const JWT_PATTERN =
  /\bey[A-Za-z0-9_-]{10,}\.ey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/;
const CARD_CANDIDATE_PATTERN = /\b(?:\d[ -]*?){13,19}\b/g;

export function isValidLuhn(numberString: string): boolean {
  const digits = numberString.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;

  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits.charAt(i), 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

export function containsSensitiveData(text: string): boolean {
  if (!text) return false;

  if (PRIVATE_KEY_PATTERN.test(text)) return true;
  if (PASSWORD_PATTERN.test(text)) return true;
  if (JWT_PATTERN.test(text)) return true;

  const cardMatches = text.match(CARD_CANDIDATE_PATTERN);
  if (cardMatches) {
    for (const match of cardMatches) {
      const cleaned = match.replace(/[\s-]/g, "");
      if (
        cleaned.length >= 13 &&
        cleaned.length <= 19 &&
        /^\d+$/.test(cleaned)
      ) {
        if (isValidLuhn(cleaned)) {
          return true;
        }
      }
    }
  }

  return false;
}
