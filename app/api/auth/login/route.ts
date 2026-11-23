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
import { authenticateUser } from '@/lib/login-credentials'

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

  // Make solo entrega el hash guardado; la contraseña escrita se convierte a hash y se compara aquí.
  const resultado = await authenticateUser(normalizedUsuario, password)
  if (!resultado.ok) {
    if (resultado.badCredentials) recordFailedLogin(normalizedUsuario)
    return NextResponse.json({ message: resultado.message }, { status: resultado.status })
  }

  clearFailedLogins(normalizedUsuario)
  const { usuario: usuarioAutenticado, nombre, correo } = resultado
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
