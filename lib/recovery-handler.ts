import { callMakeApi, isTimeoutError, readMakeApiConfig, type MakeApiConfig } from './make-api.ts'
import { hashPassword } from './password-hash.ts'
import {
  RESET_TTL_MS,
  buildResetLink,
  createResetToken,
  hashResetToken,
  isWellFormedResetToken,
  readAppBaseUrl,
} from './password-recovery.ts'

const VENTANA_MS = 15 * 60 * 1000
const MAX_POR_IP = 5
const MAX_POR_USUARIO = 3
const MAX_RESET_POR_IP = 10

export const MENSAJE_SOLICITUD = 'Si existe una cuenta con ese usuario, enviamos un enlace al correo registrado. Vence en 30 minutos.'
const MENSAJE_ENLACE_INVALIDO = 'El enlace no es válido o ya venció. Pide uno nuevo.'
const MENSAJE_ERROR = 'No se pudo completar la solicitud. Inténtalo más tarde.'

type Options = {
  fetcher?: typeof fetch
  now?: () => number
  makeConfig?: MakeApiConfig | null
  attempts?: Map<string, number[]>
  baseUrl?: string
}

function json(body: Record<string, unknown>, status: number, headers?: HeadersInit) {
  return Response.json(body, { status, headers })
}

function clientIp(request: Request) {
  const real = request.headers.get('x-real-ip')?.trim()
  if (real) return real.slice(0, 128)
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded ? forwarded.slice(0, 128) : 'unknown'
}

// Reserva un intento y devuelve los segundos de espera si ya se superó el límite (0 si puede continuar).
function reservar(intentos: Map<string, number[]>, clave: string, max: number, ahora: number) {
  const activos = (intentos.get(clave) ?? []).filter((tiempo) => tiempo > ahora - VENTANA_MS)
  if (activos.length >= max) {
    intentos.set(clave, activos)
    return Math.max(1, Math.ceil((activos[0] + VENTANA_MS - ahora) / 1000))
  }
  activos.push(ahora)
  intentos.set(clave, activos)

  if (intentos.size > 5000) {
    for (const [otra, tiempos] of intentos) {
      const vigentes = tiempos.filter((tiempo) => tiempo > ahora - VENTANA_MS)
      if (vigentes.length) intentos.set(otra, vigentes)
      else intentos.delete(otra)
      if (intentos.size <= 4000) break
    }
  }
  return 0
}

function demasiadosIntentos(segundos: number) {
  return json(
    { success: false, message: 'Demasiados intentos. Espera unos minutos antes de volver a intentarlo.' },
    429,
    { 'Retry-After': String(segundos) },
  )
}

async function leerJson(request: Request) {
  try {
    const cuerpo: unknown = await request.json()
    return cuerpo && typeof cuerpo === 'object' ? (cuerpo as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function usuarioValido(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.trim().length > 0 && valor.trim().length <= 150
}

/** Paso 1: la persona pide el enlace. Siempre responde igual exista o no el usuario. */
export function createForgotPasswordHandler({
  fetcher = fetch,
  now = Date.now,
  makeConfig,
  attempts = new Map<string, number[]>(),
  baseUrl,
}: Options = {}) {
  return async function handleForgotPassword(request: Request) {
    const body = await leerJson(request)
    if (!body || !usuarioValido(body.usuario)) {
      return json({ success: false, message: 'Ingresa tu usuario.' }, 400)
    }
    const usuario = body.usuario.trim()

    const ahora = now()
    const esperaIp = reservar(attempts, `ip:${clientIp(request)}`, MAX_POR_IP, ahora)
    if (esperaIp > 0) return demasiadosIntentos(esperaIp)
    const esperaUsuario = reservar(attempts, `usuario:${usuario.toLowerCase()}`, MAX_POR_USUARIO, ahora)
    if (esperaUsuario > 0) return demasiadosIntentos(esperaUsuario)

    const { token, tokenHash } = createResetToken()
    const enlace = buildResetLink(baseUrl ?? readAppBaseUrl(), usuario, token)

    let resultado
    try {
      resultado = await callMakeApi(
        'recuperar_solicitar',
        { usuario, token_hash: tokenHash, expira: ahora + RESET_TTL_MS, enlace },
        { fetcher, config: makeConfig === undefined ? readMakeApiConfig() : makeConfig },
      )
    } catch (error) {
      return json({ success: false, message: isTimeoutError(error) ? 'La solicitud tardó demasiado. Inténtalo de nuevo.' : MENSAJE_ERROR }, isTimeoutError(error) ? 504 : 502)
    }
    if (!resultado) return json({ success: false, message: 'La integración con Make no está configurada en el servidor.' }, 503)
    if (resultado.status < 200 || resultado.status >= 300) return json({ success: false, message: MENSAJE_ERROR }, 502)

    return json({ success: true, message: MENSAJE_SOLICITUD }, 200)
  }
}

/** Paso 2: con el código del correo, la persona define su contraseña nueva. */
export function createResetPasswordHandler({
  fetcher = fetch,
  now = Date.now,
  makeConfig,
  attempts = new Map<string, number[]>(),
}: Options = {}) {
  return async function handleResetPassword(request: Request) {
    const body = await leerJson(request)
    if (!body) return json({ success: false, message: 'Revisa los datos enviados.' }, 400)

    const { usuario, token, password, confirmPassword } = body
    if (!usuarioValido(usuario) || !isWellFormedResetToken(token)) {
      return json({ success: false, message: MENSAJE_ENLACE_INVALIDO }, 400)
    }
    if (typeof password !== 'string' || password.length < 8 || password.length > 512) {
      return json({ success: false, message: 'La contraseña debe tener al menos 8 caracteres.' }, 400)
    }
    if (typeof confirmPassword !== 'string' || confirmPassword !== password) {
      return json({ success: false, message: 'Las contraseñas no coinciden.' }, 400)
    }

    const ahora = now()
    const espera = reservar(attempts, `reset:${clientIp(request)}`, MAX_RESET_POR_IP, ahora)
    if (espera > 0) return demasiadosIntentos(espera)

    // A Make solo llega el hash del código y el hash de la contraseña nueva.
    const passwordHash = await hashPassword(password)
    let resultado
    try {
      resultado = await callMakeApi(
        'recuperar_confirmar',
        { usuario: usuario.trim(), token_hash: hashResetToken(token), password: passwordHash, ahora },
        { fetcher, config: makeConfig === undefined ? readMakeApiConfig() : makeConfig },
      )
    } catch (error) {
      return json({ success: false, message: isTimeoutError(error) ? 'La solicitud tardó demasiado. Inténtalo de nuevo.' : MENSAJE_ERROR }, isTimeoutError(error) ? 504 : 502)
    }
    if (!resultado) return json({ success: false, message: 'La integración con Make no está configurada en el servidor.' }, 503)

    if ([400, 401, 403, 404, 410].includes(resultado.status)) {
      return json({ success: false, message: MENSAJE_ENLACE_INVALIDO }, 400)
    }
    const cuerpo = resultado.body
    const correcto =
      resultado.status >= 200 && resultado.status < 300 &&
      cuerpo !== null && typeof cuerpo === 'object' && (cuerpo as Record<string, unknown>).success === true
    if (!correcto) return json({ success: false, message: MENSAJE_ERROR }, 502)

    return json({ success: true, message: 'Contraseña actualizada. Ya puedes iniciar sesión.' }, 200)
  }
}

const globalConIntentos = globalThis as typeof globalThis & {
  __agroSensorRecoveryAttempts?: Map<string, number[]>
}
const intentosGlobales = (globalConIntentos.__agroSensorRecoveryAttempts ??= new Map())

export const handleForgotPasswordRequest = createForgotPasswordHandler({ attempts: intentosGlobales })
export const handleResetPasswordRequest = createResetPasswordHandler({ attempts: intentosGlobales })
