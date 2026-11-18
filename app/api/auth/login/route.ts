import { NextResponse } from 'next/server'
import {
  AUTH_COOKIE_NAME,
  AUTH_SESSION_MAX_AGE,
  clearFailedLogins,
  isAuthSessionConfigured,
  createSession,
  getLoginRetryAfter,
  recordFailedLogin,
} from '@/lib/auth-session'
import { callMakeApi, isTimeoutError } from '@/lib/make-api'

function messageFrom(value: unknown) {
  if (!value || typeof value !== 'object' || !('message' in value)) return null
  const message = (value as { message?: unknown }).message
  return typeof message === 'string' && message.trim() ? message.trim().slice(0, 240) : null
}

export async function POST(request: Request) {
  if (!isAuthSessionConfigured()) {
    return NextResponse.json({ message: 'La configuración de sesiones del servidor está incompleta.' }, { status: 503 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'La solicitud no tiene un formato válido.' }, { status: 400 })
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ message: 'Ingresa tu usuario y contraseña.' }, { status: 400 })
  }

  const { usuario, password } = body as { usuario?: unknown; password?: unknown }
  if (
    typeof usuario !== 'string' ||
    typeof password !== 'string' ||
    !usuario.trim() ||
    usuario.length > 150 ||
    password.length === 0 ||
    password.length > 512
  ) {
    return NextResponse.json({ message: 'Ingresa un usuario y una contraseña válidos.' }, { status: 400 })
  }

  const normalizedUsuario = usuario.trim()
  const retryAfter = getLoginRetryAfter(normalizedUsuario)
  if (retryAfter > 0) {
    return NextResponse.json(
      { message: 'Demasiados intentos. Espera unos minutos antes de volver a intentarlo.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    )
  }

  let makeResult
  try {
    makeResult = await callMakeApi('login', { usuario: normalizedUsuario, password })
  } catch (error) {
    const timedOut = isTimeoutError(error)
    return NextResponse.json(
      { message: timedOut ? 'El servicio de acceso tardó demasiado. Inténtalo de nuevo.' : 'No se pudo conectar con el servicio de acceso.' },
      { status: timedOut ? 504 : 502 },
    )
  }
  if (!makeResult) {
    return NextResponse.json({ message: 'La integración con Make no está configurada en el servidor.' }, { status: 503 })
  }

  const result = makeResult.body

  if (makeResult.status === 401) {
    recordFailedLogin(normalizedUsuario)
    return NextResponse.json(
      { message: messageFrom(result) ?? 'Usuario o contraseña incorrectos.' },
      { status: 401 },
    )
  }

  const usuarioAutenticado =
    result && typeof result === 'object' && 'usuario' in result && typeof result.usuario === 'string'
      ? result.usuario.trim()
      : ''
  const textoDe = (key: 'nombre' | 'correo', max: number) =>
    result && typeof result === 'object' && key in result && typeof (result as Record<string, unknown>)[key] === 'string'
      ? ((result as Record<string, unknown>)[key] as string).trim().slice(0, max)
      : ''
  const nombre = textoDe('nombre', 100)
  const correo = textoDe('correo', 254)
  const loginCorrecto =
    makeResult.status >= 200 && makeResult.status < 300 &&
    result &&
    typeof result === 'object' &&
    'success' in result &&
    result.success === true &&
    usuarioAutenticado.length > 0 &&
    usuarioAutenticado.length <= 150

  if (!loginCorrecto) {
    return NextResponse.json({ message: 'El servicio de acceso no está disponible. Inténtalo más tarde.' }, { status: 502 })
  }

  clearFailedLogins(normalizedUsuario)
  const sessionToken = createSession(usuarioAutenticado, { nombre, correo })
  if (!sessionToken) {
    return NextResponse.json({ message: 'La configuración de sesiones del servidor está incompleta.' }, { status: 503 })
  }

  const response = NextResponse.json({
    success: true,
    usuario: usuarioAutenticado,
    nombre: nombre || undefined,
    correo: correo || undefined,
  })
  response.cookies.set(AUTH_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
    maxAge: AUTH_SESSION_MAX_AGE,
  })
  return response
}
