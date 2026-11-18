import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { AUTH_COOKIE_NAME, getSession } from '@/lib/auth-session'

const MAKE_TIMEOUT_MS = 12_000
const EMAIL_PATTERN = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/

// usuario y parcela se insertan en un correo HTML en Make: se elimina cualquier carácter que permita inyectar etiquetas.
function stripHtmlChars(value: string) {
  return value.replace(/[<>&"]/g, '').trim()
}

function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

function getLocalDateParts(timestamp: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(timestamp))
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00'
  const date = `${get('year')}-${get('month')}-${get('day')}`
  const time = `${get('hour')}:${get('minute')}:${get('second')}`
  return { date, time }
}

function isSameOriginRequest(request: NextRequest) {
  // Los navegadores fijan Sec-Fetch-Site y el JavaScript de la página no puede modificarlo.
  // Detrás de un proxy (preview de v0) el Host no coincide con el Origin, por eso se prioriza.
  const fetchSite = request.headers.get('sec-fetch-site')
  if (fetchSite) return fetchSite === 'same-origin'

  const originHeader = request.headers.get('origin')
  if (!originHeader) return false

  let requestOrigin: string
  try {
    const parsedOrigin = new URL(originHeader)
    if (parsedOrigin.protocol !== 'http:' && parsedOrigin.protocol !== 'https:') return false
    requestOrigin = parsedOrigin.origin
  } catch {
    return false
  }

  const allowedOrigins = new Set([request.nextUrl.origin])
  const forwardedHost = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  const forwardedProtocol = (
    request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol.slice(0, -1)
  ).split(',')[0].trim().replace(/:$/, '').toLowerCase()

  if ((forwardedProtocol === 'http' || forwardedProtocol === 'https') && forwardedHost) {
    for (const host of forwardedHost.split(',')) {
      const normalizedHost = host.trim()
      if (!normalizedHost) continue
      try {
        allowedOrigins.add(new URL(`${forwardedProtocol}://${normalizedHost}`).origin)
      } catch {
        continue
      }
    }
  }

  return allowedOrigins.has(requestOrigin)
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ message: 'Origen de solicitud no válido.' }, { status: 403 })
  }

  const session = getSession(request.cookies.get(AUTH_COOKIE_NAME)?.value)
  if (!session) {
    return NextResponse.json({ message: 'Inicia sesión para programar el recordatorio.' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'La solicitud no tiene un formato válido.' }, { status: 400 })
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ message: 'Faltan los datos del evento.' }, { status: 400 })
  }

  const { title, description, startDateTime, timeZone, requestId, correo: correoSolicitado, parcela } = body as Record<string, unknown>
  // El destinatario es el correo con el que la persona se registró; solo se acepta el del formulario si la cuenta no tiene uno.
  const correo = session.correo ?? correoSolicitado
  if (
    typeof correo !== 'string' || correo.trim().length > 254 || !EMAIL_PATTERN.test(correo.trim()) ||
    typeof parcela !== 'string' || !parcela.trim() || parcela.length > 200 ||
    typeof title !== 'string' || !title.trim() || title.length > 200 ||
    typeof description !== 'string' || description.length > 1000 ||
    typeof startDateTime !== 'string' || startDateTime.length > 64 ||
    typeof timeZone !== 'string' || timeZone.length > 100 || !isValidTimeZone(timeZone) ||
    typeof requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)
  ) {
    return NextResponse.json({ message: 'Los datos del evento no son válidos.' }, { status: 400 })
  }

  const startTimestamp = Date.parse(startDateTime)
  if (!Number.isFinite(startTimestamp)) {
    return NextResponse.json({ message: 'La fecha del evento no es válida.' }, { status: 400 })
  }

  const webhookUrl = process.env.MAKE_WEBHOOK_URL?.trim()
  const apiKey = process.env.MAKE_API_KEY?.trim()
  if (!webhookUrl || !apiKey) {
    return NextResponse.json(
      { message: 'El envío de correos no está disponible por ahora.' },
      { status: 503 },
    )
  }

  let parsedWebhookUrl: URL
  try {
    parsedWebhookUrl = new URL(webhookUrl)
  } catch {
    return NextResponse.json(
      { message: 'El envío de correos no está disponible por ahora.' },
      { status: 503 },
    )
  }

  if (parsedWebhookUrl.protocol !== 'https:' || !parsedWebhookUrl.hostname.endsWith('.make.com')) {
    return NextResponse.json(
      { message: 'El envío de correos no está disponible por ahora.' },
      { status: 503 },
    )
  }

  const normalizedStart = new Date(startTimestamp).toISOString()
  const endDateTime = new Date(startTimestamp + 30 * 60 * 1000).toISOString()
  const localStart = getLocalDateParts(startTimestamp, timeZone)
  const localEnd = getLocalDateParts(startTimestamp + 30 * 60 * 1000, timeZone)
  // Enlace que crea el evento directamente en el Google Calendar de quien lo abre (sin invitaciones de remitentes desconocidos).
  const toCalendarDate = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const calendarUrl = `https://calendar.google.com/calendar/render?${new URLSearchParams({
    action: 'TEMPLATE',
    text: `AgroSensor: ${stripHtmlChars(title.trim())}`,
    details: `${stripHtmlChars(description.trim())} Abre AgroSensor para revisar las lecturas de tus sensores.`,
    dates: `${toCalendarDate(normalizedStart)}/${toCalendarDate(endDateTime)}`,
    ctz: timeZone,
  }).toString()}`
  const makePayload = {
    // Campos que usa el escenario de Make (Gmail y Google Calendar)
    correo: correo.trim(),
    calendar_url: calendarUrl,
    usuario: stripHtmlChars(session.nombre || session.usuario),
    parcela: stripHtmlChars(parcela),
    user_id: createHash('sha256').update(session.usuario, 'utf8').digest('hex'),
    event_id: requestId.toLowerCase(),
    title: title.trim(),
    description: description.trim(),
    start_datetime: normalizedStart,
    end_datetime: endDateTime,
    time_zone: timeZone,
    fecha: localStart.date,
    hora: localStart.time.slice(0, 5),
    fecha_hora_local: `${localStart.date} ${localStart.time}`,
    fecha_fin: localEnd.date,
    hora_fin: localEnd.time.slice(0, 5),
  }

  try {
    const response = await fetch(parsedWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-make-apikey': apiKey,
      },
      body: JSON.stringify(makePayload),
      cache: 'no-store',
      signal: AbortSignal.timeout(MAKE_TIMEOUT_MS),
    })

    if (!response.ok) {
      return NextResponse.json(
        { message: 'No se pudo enviar el correo. Inténtalo de nuevo.' },
        { status: 502 },
      )
    }

    return NextResponse.json({ success: true, eventId: requestId.toLowerCase() })
  } catch {
    return NextResponse.json(
      { message: 'No se pudo enviar el correo. Inténtalo de nuevo.' },
      { status: 502 },
    )
  }
}
