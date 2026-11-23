import assert from 'node:assert/strict'
import test from 'node:test'
import { verifyPassword } from '../lib/password-hash.ts'
import { createRegistrationHandler } from '../lib/registration-handler.ts'

const makeConfig = { url: 'https://hook.us2.make.com/test-hook', apiKey: 'test-secret' }
const validRegistration = {
  usuario: 'roberto01',
  password: 'clave-segura-123',
  confirmPassword: 'clave-segura-123',
  nombre: 'Roberto Rojas',
  correo: 'roberto@gmail.com',
}

function createRequest(body, ip = '192.0.2.10') {
  return new Request('https://agrosensor.test/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-real-ip': ip },
    body: JSON.stringify(body),
  })
}

function createHandler(fetcher) {
  return createRegistrationHandler({ fetcher, now: () => 1_000, attemptsByIp: new Map(), makeConfig })
}

test('registra un usuario nuevo y reenvía a Make usuario, contraseña, nombre y correo', async () => {
  let receivedUrl
  let receivedBody
  let receivedHeaders
  const handler = createHandler(async (url, init) => {
    receivedUrl = url
    receivedHeaders = init.headers
    receivedBody = JSON.parse(init.body)
    return Response.json({ success: true, message: 'Usuario registrado', usuario: 'roberto01' }, { status: 201 })
  })

  const response = await handler(createRequest(validRegistration))
  assert.equal(response.status, 201)
  assert.deepEqual(await response.json(), {
    success: true,
    message: 'Usuario registrado',
    usuario: 'roberto01',
  })
  assert.equal(receivedUrl, makeConfig.url)
  assert.equal(receivedHeaders['x-make-apikey'], 'test-secret')
  // La contraseña nunca viaja en texto plano: a Make le llega un hash con sal que se verifica con la clave original.
  const { password: enviada, ...resto } = receivedBody
  assert.deepEqual(resto, {
    usuario: 'roberto01',
    nombre: 'Roberto Rojas',
    correo: 'roberto@gmail.com',
    accion: 'registro',
  })
  assert.match(enviada, /^scrypt\$/)
  assert.notEqual(enviada, validRegistration.password)
  assert.equal(JSON.stringify(receivedBody).includes(validRegistration.password), false)
  assert.deepEqual(await verifyPassword(validRegistration.password, enviada), { ok: true, legacy: false })
  assert.equal((await verifyPassword('otra-clave-123', enviada)).ok, false)
})

test('devuelve 409 cuando el usuario ya existe', async () => {
  const handler = createHandler(async () => new Response(null, { status: 409 }))
  const response = await handler(createRequest(validRegistration))

  assert.equal(response.status, 409)
  assert.deepEqual(await response.json(), { success: false, message: 'El usuario ya existe' })
})

test('rechaza validaciones sin llamar a Make', async (t) => {
  let fetchCalls = 0
  const handler = createHandler(async () => {
    fetchCalls += 1
    return Response.json({ success: true, message: 'Usuario registrado', usuario: 'roberto01' }, { status: 201 })
  })
  const invalidCases = [
    { body: { ...validRegistration, usuario: '' }, message: 'Ingresa un usuario sin espacios.' },
    { body: { ...validRegistration, usuario: 'roberto 01' }, message: 'Ingresa un usuario sin espacios.' },
    { body: { ...validRegistration, password: 'corta', confirmPassword: 'corta' }, message: 'La contraseña debe tener al menos 8 caracteres.' },
    { body: { ...validRegistration, confirmPassword: 'otra-clave' }, message: 'Las contraseñas no coinciden.' },
    { body: { ...validRegistration, nombre: '  ' }, message: 'Ingresa tu nombre.' },
    { body: { ...validRegistration, correo: 'no-es-correo' }, message: 'Ingresa un correo válido.' },
    { body: { ...validRegistration, correo: '' }, message: 'Ingresa un correo válido.' },
  ]

  for (const [index, invalidCase] of invalidCases.entries()) {
    await t.test(`caso ${index + 1}`, async () => {
      const response = await handler(createRequest(invalidCase.body, `192.0.2.${index + 10}`))
      assert.equal(response.status, 400)
      assert.deepEqual(await response.json(), { success: false, message: invalidCase.message })
    })
  }

  assert.equal(fetchCalls, 0)
})

test('devuelve un error genérico ante un fallo de red sin exponer datos sensibles', async () => {
  const handler = createHandler(async () => {
    throw new Error('network error')
  })
  const response = await handler(createRequest(validRegistration))
  const body = await response.json()

  assert.equal(response.status, 502)
  assert.equal(body.message, 'No se pudo completar el registro. Inténtalo más tarde.')
  assert.equal(JSON.stringify(body).includes(validRegistration.password), false)
})

test('limita a cinco intentos por minuto para la misma IP', async () => {
  let now = 1_000
  const handler = createRegistrationHandler({
    now: () => now,
    attemptsByIp: new Map(),
    makeConfig,
    fetcher: async () => Response.json({ success: true, message: 'Usuario registrado', usuario: 'roberto01' }, { status: 201 }),
  })

  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal((await handler(createRequest(validRegistration))).status, 201)
  }

  const limitedResponse = await handler(createRequest(validRegistration))
  assert.equal(limitedResponse.status, 429)
  assert.equal(limitedResponse.headers.get('Retry-After'), '60')

  now += 60_001
  assert.equal((await handler(createRequest(validRegistration))).status, 201)
})
