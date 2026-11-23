import { callMakeApi, isTimeoutError, readMakeApiConfig, type MakeApiConfig } from './make-api.ts'
import { hashPassword } from './password-hash.ts'

const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_ATTEMPTS = 5
const EMAIL_PATTERN = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/

type RegistrationHandlerOptions = {
  fetcher?: typeof fetch
  now?: () => number
  attemptsByIp?: Map<string, number[]>
  makeConfig?: MakeApiConfig | null
}

type RegistrationBody = {
  usuario?: unknown
  password?: unknown
  confirmPassword?: unknown
  nombre?: unknown
  correo?: unknown
}

function jsonResponse(body: Record<string, unknown>, status: number, headers?: HeadersInit) {
  return Response.json(body, { status, headers })
}

function clientIp(request: Request) {
  const realIp = request.headers.get('x-real-ip')?.trim()
  if (realIp) return realIp.slice(0, 128)

  const forwardedIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwardedIp ? forwardedIp.slice(0, 128) : 'unknown'
}

function reserveAttempt(attemptsByIp: Map<string, number[]>, ip: string, now: number) {
  const activeAttempts = (attemptsByIp.get(ip) ?? []).filter((timestamp) => timestamp > now - RATE_LIMIT_WINDOW_MS)

  if (activeAttempts.length >= RATE_LIMIT_MAX_ATTEMPTS) {
    attemptsByIp.set(ip, activeAttempts)
    return Math.max(1, Math.ceil((activeAttempts[0] + RATE_LIMIT_WINDOW_MS - now) / 1000))
  }

  activeAttempts.push(now)
  attemptsByIp.set(ip, activeAttempts)

  if (attemptsByIp.size > 5000) {
    for (const [attemptIp, timestamps] of attemptsByIp) {
      const remaining = timestamps.filter((timestamp) => timestamp > now - RATE_LIMIT_WINDOW_MS)
      if (remaining.length) attemptsByIp.set(attemptIp, remaining)
      else attemptsByIp.delete(attemptIp)
      if (attemptsByIp.size <= 4000) break
    }
  }

  return 0
}

export function createRegistrationHandler({
  fetcher = fetch,
  now = Date.now,
  attemptsByIp = new Map<string, number[]>(),
  makeConfig,
}: RegistrationHandlerOptions = {}) {
  return async function handleRegistration(request: Request) {
    const retryAfter = reserveAttempt(attemptsByIp, clientIp(request), now())
    if (retryAfter > 0) {
      return jsonResponse(
        { success: false, message: 'Demasiados intentos de registro. Espera un minuto e inténtalo de nuevo.' },
        429,
        { 'Retry-After': String(retryAfter) },
      )
    }

    let body: RegistrationBody
    try {
      body = (await request.json()) as RegistrationBody
    } catch {
      return jsonResponse({ success: false, message: 'Revisa los datos del registro.' }, 400)
    }

    const { usuario, password, confirmPassword, nombre, correo } = body ?? {}
    if (
      typeof usuario !== 'string' ||
      usuario.length === 0 ||
      usuario.length > 150 ||
      /\s/.test(usuario)
    ) {
      return jsonResponse({ success: false, message: 'Ingresa un usuario sin espacios.' }, 400)
    }
    const nombreLimpio = typeof nombre === 'string' ? nombre.replace(/[<>&"]/g, '').trim() : ''
    if (!nombreLimpio || nombreLimpio.length > 100) {
      return jsonResponse({ success: false, message: 'Ingresa tu nombre.' }, 400)
    }
    const correoLimpio = typeof correo === 'string' ? correo.trim() : ''
    if (!correoLimpio || correoLimpio.length > 254 || !EMAIL_PATTERN.test(correoLimpio)) {
      return jsonResponse({ success: false, message: 'Ingresa un correo válido.' }, 400)
    }
    if (typeof password !== 'string' || password.length < 8 || password.length > 512) {
      return jsonResponse({ success: false, message: 'La contraseña debe tener al menos 8 caracteres.' }, 400)
    }
    if (typeof confirmPassword !== 'string' || confirmPassword !== password) {
      return jsonResponse({ success: false, message: 'Las contraseñas no coinciden.' }, 400)
    }

    // A Make y a la hoja solo llega el hash con sal; la contraseña escrita nunca sale de la aplicación.
    const passwordHash = await hashPassword(password)

    let makeResult
    try {
      makeResult = await callMakeApi(
        'registro',
        { usuario, password: passwordHash, nombre: nombreLimpio, correo: correoLimpio },
        { fetcher, config: makeConfig === undefined ? readMakeApiConfig() : makeConfig },
      )
    } catch (error) {
      return jsonResponse(
        { success: false, message: isTimeoutError(error) ? 'El registro tardó demasiado. Inténtalo de nuevo.' : 'No se pudo completar el registro. Inténtalo más tarde.' },
        isTimeoutError(error) ? 504 : 502,
      )
    }
    if (!makeResult) {
      return jsonResponse({ success: false, message: 'La integración con Make no está configurada en el servidor.' }, 503)
    }

    if (makeResult.status === 409) {
      return jsonResponse({ success: false, message: 'El usuario ya existe' }, 409)
    }

    if (makeResult.status !== 201) {
      return jsonResponse({ success: false, message: 'No se pudo completar el registro. Inténtalo más tarde.' }, 502)
    }

    const result = makeResult.body

    if (
      !result ||
      typeof result !== 'object' ||
      !('success' in result) ||
      result.success !== true ||
      !('message' in result) ||
      typeof result.message !== 'string' ||
      !('usuario' in result) ||
      typeof result.usuario !== 'string' ||
      !result.usuario.trim() ||
      result.usuario.length > 150
    ) {
      return jsonResponse({ success: false, message: 'No se pudo completar el registro. Inténtalo más tarde.' }, 502)
    }

    return jsonResponse(
      { success: true, message: 'Usuario registrado', usuario: result.usuario.trim() },
      201,
    )
  }
}

const registrationGlobal = globalThis as typeof globalThis & {
  __agroSensorRegistrationAttempts?: Map<string, number[]>
}

const registrationAttempts = (registrationGlobal.__agroSensorRegistrationAttempts ??= new Map())

export const handleRegistrationRequest = createRegistrationHandler({ attemptsByIp: registrationAttempts })
