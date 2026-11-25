import { createHash, randomBytes } from 'node:crypto'

// Recuperación de contraseña: un código aleatorio de un solo uso viaja por correo y en la hoja solo se guarda su hash.
export const RESET_TTL_MS = 30 * 60 * 1000
export const DEFAULT_APP_BASE_URL = 'https://agrosensor-fph7.onrender.com'

// 32 bytes aleatorios en base64url ocupan siempre 43 caracteres.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

export function hashResetToken(token: string) {
  return createHash('sha256').update(token).digest('base64url')
}

export function createResetToken() {
  const token = randomBytes(32).toString('base64url')
  return { token, tokenHash: hashResetToken(token) }
}

export function isWellFormedResetToken(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_PATTERN.test(value)
}

/**
 * Dirección pública de la app para armar el enlace del correo. Sale de una variable de entorno (nunca del
 * encabezado Host de la petición, que un atacante podría falsificar para desviar el enlace).
 */
export function readAppBaseUrl(value: string | undefined = process.env.APP_BASE_URL) {
  const texto = value?.trim()
  if (texto) {
    try {
      const url = new URL(texto)
      const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
      if (url.protocol === 'https:' || (url.protocol === 'http:' && local)) return url.origin
    } catch {
      // se usa la dirección por defecto
    }
  }
  return DEFAULT_APP_BASE_URL
}

export function buildResetLink(baseUrl: string, usuario: string, token: string) {
  const url = new URL('/', baseUrl)
  url.searchParams.set('reset', token)
  url.searchParams.set('usuario', usuario)
  return url.toString()
}
