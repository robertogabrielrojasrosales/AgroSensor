import assert from 'node:assert/strict'
import test from 'node:test'
import { verifyPassword } from '../lib/password-hash.ts'
import {
  DEFAULT_APP_BASE_URL,
  RESET_TTL_MS,
  buildResetLink,
  createResetToken,
  hashResetToken,
  isWellFormedResetToken,
  readAppBaseUrl,
} from '../lib/password-recovery.ts'
import { MENSAJE_SOLICITUD, createForgotPasswordHandler, createResetPasswordHandler } from '../lib/recovery-handler.ts'

const makeConfig = { url: 'https://hook.us2.make.com/test-hook', apiKey: 'test-secret' }
const BASE = 'https://agrosensor.test'

function peticion(ruta, cuerpo, ip = '192.0.2.10') {
  return new Request(`${BASE}${ruta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-real-ip': ip },
    body: JSON.stringify(cuerpo),
  })
}

test('el código de recuperación es aleatorio, de 43 caracteres y solo se guarda su hash', () => {
  const a = createResetToken()
  const b = createResetToken()

  assert.notEqual(a.token, b.token)
  assert.equal(isWellFormedResetToken(a.token), true)
  assert.equal(a.tokenHash, hashResetToken(a.token))
  assert.notEqual(a.tokenHash, a.token)
  assert.equal(isWellFormedResetToken('corto'), false)
  assert.equal(isWellFormedResetToken(`${a.token}x`), false)
  assert.equal(isWellFormedResetToken(undefined), false)
})

test('la dirección del enlace sale de la configuración y rechaza valores inseguros', () => {
  assert.equal(readAppBaseUrl('https://mi-app.onrender.com/otra/ruta'), 'https://mi-app.onrender.com')
  assert.equal(readAppBaseUrl('http://localhost:3000'), 'http://localhost:3000')
  assert.equal(readAppBaseUrl('http://sitio-inseguro.com'), DEFAULT_APP_BASE_URL)
  assert.equal(readAppBaseUrl('no es una url'), DEFAULT_APP_BASE_URL)
  assert.equal(readAppBaseUrl(undefined), DEFAULT_APP_BASE_URL)

  const enlace = new URL(buildResetLink('https://mi-app.onrender.com', 'Leandro Mauricci', 'abc'))
  assert.equal(enlace.origin, 'https://mi-app.onrender.com')
  assert.equal(enlace.searchParams.get('reset'), 'abc')
  assert.equal(enlace.searchParams.get('usuario'), 'Leandro Mauricci')
})

test('solicitar: manda a Make solo el hash del código, la expiración y el enlace', async () => {
  const llamadas = []
  const handler = createForgotPasswordHandler({
    now: () => 1_000_000,
    makeConfig,
    baseUrl: 'https://mi-app.onrender.com',
    attempts: new Map(),
    fetcher: async (url, init) => {
      llamadas.push({ url, headers: init.headers, cuerpo: JSON.parse(init.body) })
      return Response.json({ success: true })
    },
  })

  const respuesta = await handler(peticion('/api/auth/forgot', { usuario: ' roberto01 ' }))

  assert.equal(respuesta.status, 200)
  assert.deepEqual(await respuesta.json(), { success: true, message: MENSAJE_SOLICITUD })
  assert.equal(llamadas.length, 1)
  const { cuerpo } = llamadas[0]
  assert.equal(llamadas[0].headers['x-make-apikey'], 'test-secret')
  assert.equal(cuerpo.accion, 'recuperar_solicitar')
  assert.equal(cuerpo.usuario, 'roberto01')
  assert.equal(cuerpo.expira, 1_000_000 + RESET_TTL_MS)

  const enlace = new URL(cuerpo.enlace)
  const token = enlace.searchParams.get('reset')
  assert.equal(enlace.origin, 'https://mi-app.onrender.com')
  assert.equal(enlace.searchParams.get('usuario'), 'roberto01')
  assert.equal(isWellFormedResetToken(token), true)
  assert.equal(cuerpo.token_hash, hashResetToken(token))
  assert.equal(JSON.stringify({ ...cuerpo, enlace: undefined }).includes(token), false)
})

test('solicitar: responde igual aunque Make no encuentre al usuario y valida el dato', async () => {
  const handler = createForgotPasswordHandler({ makeConfig, attempts: new Map(), fetcher: async () => Response.json({ success: true }) })

  const existente = await (await handler(peticion('/api/auth/forgot', { usuario: 'alguien' }, '192.0.2.1'))).json()
  const otro = await (await handler(peticion('/api/auth/forgot', { usuario: 'nadie-existe' }, '192.0.2.2'))).json()
  assert.deepEqual(existente, otro)

  for (const cuerpo of [{}, { usuario: '' }, { usuario: '   ' }, { usuario: 42 }, { usuario: 'x'.repeat(151) }]) {
    const respuesta = await handler(peticion('/api/auth/forgot', cuerpo, '192.0.2.3'))
    assert.equal(respuesta.status, 400)
  }
})

test('solicitar: limita 3 intentos por usuario y 5 por IP en la ventana', async () => {
  let ahora = 1_000
  const handler = createForgotPasswordHandler({ now: () => ahora, makeConfig, attempts: new Map(), fetcher: async () => Response.json({ success: true }) })

  for (let i = 0; i < 3; i += 1) {
    assert.equal((await handler(peticion('/api/auth/forgot', { usuario: 'roberto01' }, `192.0.2.${i + 20}`))).status, 200)
  }
  const bloqueado = await handler(peticion('/api/auth/forgot', { usuario: 'ROBERTO01' }, '192.0.2.99'))
  assert.equal(bloqueado.status, 429)
  assert.ok(Number(bloqueado.headers.get('Retry-After')) > 0)

  for (let i = 0; i < 5; i += 1) {
    assert.equal((await handler(peticion('/api/auth/forgot', { usuario: `otro${i}` }, '192.0.2.50'))).status, 200)
  }
  assert.equal((await handler(peticion('/api/auth/forgot', { usuario: 'otro9' }, '192.0.2.50'))).status, 429)

  ahora += 15 * 60 * 1000 + 1
  assert.equal((await handler(peticion('/api/auth/forgot', { usuario: 'roberto01' }, '192.0.2.99'))).status, 200)
})

test('solicitar: errores de Make o de red no filtran datos y no confirman nada', async () => {
  const caido = createForgotPasswordHandler({ makeConfig, attempts: new Map(), fetcher: async () => { throw new Error('network') } })
  assert.equal((await caido(peticion('/api/auth/forgot', { usuario: 'a' }))).status, 502)

  const malo = createForgotPasswordHandler({ makeConfig, attempts: new Map(), fetcher: async () => new Response(null, { status: 500 }) })
  assert.equal((await malo(peticion('/api/auth/forgot', { usuario: 'a' }))).status, 502)

  const sinConfig = createForgotPasswordHandler({ makeConfig: null, attempts: new Map(), fetcher: async () => new Response() })
  assert.equal((await sinConfig(peticion('/api/auth/forgot', { usuario: 'a' }))).status, 503)
})

const tokenValido = createResetToken().token
const cuerpoReset = { usuario: 'roberto01', token: tokenValido, password: 'clave-nueva-123', confirmPassword: 'clave-nueva-123' }

test('confirmar: manda a Make el hash del código y un hash de la contraseña nueva, nunca la clave', async () => {
  const llamadas = []
  const handler = createResetPasswordHandler({
    now: () => 5_000,
    makeConfig,
    attempts: new Map(),
    fetcher: async (url, init) => {
      llamadas.push(JSON.parse(init.body))
      return Response.json({ success: true })
    },
  })

  const respuesta = await handler(peticion('/api/auth/reset', cuerpoReset))

  assert.equal(respuesta.status, 200)
  assert.equal((await respuesta.json()).success, true)
  const enviado = llamadas[0]
  assert.equal(enviado.accion, 'recuperar_confirmar')
  assert.equal(enviado.usuario, 'roberto01')
  assert.equal(enviado.ahora, 5_000)
  assert.equal(enviado.token_hash, hashResetToken(tokenValido))
  assert.match(enviado.password, /^scrypt\$/)
  assert.deepEqual(await verifyPassword('clave-nueva-123', enviado.password), { ok: true, legacy: false })
  const texto = JSON.stringify(enviado)
  assert.equal(texto.includes('clave-nueva-123'), false)
  assert.equal(texto.includes(tokenValido), false)
})

test('confirmar: rechaza datos inválidos sin llamar a Make', async () => {
  let llamadas = 0
  const handler = createResetPasswordHandler({ makeConfig, attempts: new Map(), fetcher: async () => { llamadas += 1; return Response.json({ success: true }) } })
  const casos = [
    [{ ...cuerpoReset, token: 'corto' }, 'El enlace no es válido o ya venció. Pide uno nuevo.'],
    [{ ...cuerpoReset, usuario: '' }, 'El enlace no es válido o ya venció. Pide uno nuevo.'],
    [{ ...cuerpoReset, password: 'corta', confirmPassword: 'corta' }, 'La contraseña debe tener al menos 8 caracteres.'],
    [{ ...cuerpoReset, confirmPassword: 'otra-clave-123' }, 'Las contraseñas no coinciden.'],
  ]
  for (const [cuerpo, mensaje] of casos) {
    const respuesta = await handler(peticion('/api/auth/reset', cuerpo))
    assert.equal(respuesta.status, 400)
    assert.equal((await respuesta.json()).message, mensaje)
  }
  assert.equal(llamadas, 0)
})

test('confirmar: un código vencido, usado o inexistente da el mismo mensaje', async () => {
  for (const status of [400, 401, 404, 410]) {
    const handler = createResetPasswordHandler({ makeConfig, attempts: new Map(), fetcher: async () => Response.json({ success: false }, { status }) })
    const respuesta = await handler(peticion('/api/auth/reset', cuerpoReset))
    assert.equal(respuesta.status, 400)
    assert.equal((await respuesta.json()).message, 'El enlace no es válido o ya venció. Pide uno nuevo.')
  }

  const incoherente = createResetPasswordHandler({ makeConfig, attempts: new Map(), fetcher: async () => Response.json({ ok: true }) })
  assert.equal((await incoherente(peticion('/api/auth/reset', cuerpoReset))).status, 502)

  const caido = createResetPasswordHandler({ makeConfig, attempts: new Map(), fetcher: async () => { throw new Error('network') } })
  assert.equal((await caido(peticion('/api/auth/reset', cuerpoReset))).status, 502)
})

test('confirmar: limita los intentos por IP', async () => {
  const handler = createResetPasswordHandler({ makeConfig, attempts: new Map(), fetcher: async () => Response.json({ success: false }, { status: 401 }) })
  for (let i = 0; i < 10; i += 1) {
    assert.equal((await handler(peticion('/api/auth/reset', cuerpoReset, '192.0.2.77'))).status, 400)
  }
  assert.equal((await handler(peticion('/api/auth/reset', cuerpoReset, '192.0.2.77'))).status, 429)
})
