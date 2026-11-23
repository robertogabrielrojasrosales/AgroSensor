import assert from 'node:assert/strict'
import test from 'node:test'
import { authenticateUser } from '../lib/login-credentials.ts'
import { hashPassword, isPasswordHash, verifyPassword } from '../lib/password-hash.ts'

const makeConfig = { url: 'https://hook.us2.make.com/test-hook', apiKey: 'test-secret' }

test('hashPassword genera hashes distintos (sal aleatoria) que verifyPassword reconoce', async () => {
  const a = await hashPassword('clave-segura-123')
  const b = await hashPassword('clave-segura-123')

  assert.notEqual(a, b)
  assert.equal(isPasswordHash(a), true)
  assert.equal(a.includes('clave-segura-123'), false)
  assert.deepEqual(await verifyPassword('clave-segura-123', a), { ok: true, legacy: false })
  assert.deepEqual(await verifyPassword('clave-segura-124', a), { ok: false, legacy: false })
  assert.deepEqual(await verifyPassword('', a), { ok: false, legacy: false })
})

test('verifyPassword rechaza hashes alterados o con parámetros absurdos', async () => {
  const bueno = await hashPassword('clave-segura-123')
  const partes = bueno.split('$')

  assert.equal((await verifyPassword('clave-segura-123', [...partes.slice(0, 5), partes[5].slice(0, -2) + 'AA'].join('$'))).ok, false)
  assert.equal((await verifyPassword('clave-segura-123', `scrypt$4294967296$8$1$${partes[4]}$${partes[5]}`)).ok, false)
  assert.equal((await verifyPassword('clave-segura-123', `scrypt$16383$8$1$${partes[4]}$${partes[5]}`)).ok, false)
  assert.equal((await verifyPassword('clave-segura-123', 'scrypt$16384$8$1$$')).ok, false)
})

test('las contraseñas antiguas en texto plano se comparan tal cual y se marcan como legacy', async () => {
  assert.deepEqual(await verifyPassword('Lucero12', 'Lucero12'), { ok: true, legacy: true })
  assert.deepEqual(await verifyPassword('Lucero13', 'Lucero12'), { ok: false, legacy: true })
  assert.deepEqual(await verifyPassword('algo', ''), { ok: false, legacy: true })
})

function fetcherCon(respuesta, llamadas = []) {
  return async (url, init) => {
    llamadas.push({ url, init, cuerpo: JSON.parse(init.body) })
    return respuesta
  }
}

test('login: pide a Make solo el hash del usuario y compara la contraseña en la app', async () => {
  const hash = await hashPassword('clave-segura-123')
  const llamadas = []
  const fetcher = fetcherCon(
    Response.json({ success: true, usuario: 'roberto01', nombre: 'Roberto Rojas', correo: 'roberto@gmail.com', password_hash: hash }),
    llamadas,
  )

  const resultado = await authenticateUser('roberto01', 'clave-segura-123', { fetcher, makeConfig })

  assert.deepEqual(resultado, { ok: true, usuario: 'roberto01', nombre: 'Roberto Rojas', correo: 'roberto@gmail.com', legacy: false })
  assert.equal(llamadas.length, 1)
  assert.deepEqual(llamadas[0].cuerpo, { usuario: 'roberto01', accion: 'login_hash' })
  assert.equal(JSON.stringify(llamadas[0].cuerpo).includes('clave-segura-123'), false)
})

test('login: contraseña incorrecta devuelve 401 sin revelar el hash', async () => {
  const hash = await hashPassword('clave-segura-123')
  const fetcher = fetcherCon(Response.json({ success: true, usuario: 'roberto01', password_hash: hash }))

  const resultado = await authenticateUser('roberto01', 'otra-clave-999', { fetcher, makeConfig })

  assert.deepEqual(resultado, { ok: false, status: 401, message: 'Usuario o contraseña incorrectos.', badCredentials: true })
  assert.equal(JSON.stringify(resultado).includes(hash), false)
})

test('login: usuario inexistente (401 o 404 de Make) devuelve el mismo mensaje genérico', async () => {
  for (const status of [401, 404]) {
    const fetcher = fetcherCon(Response.json({ success: false, message: 'no existe' }, { status }))
    const resultado = await authenticateUser('nadie', 'cualquiera-123', { fetcher, makeConfig })
    assert.deepEqual(resultado, { ok: false, status: 401, message: 'Usuario o contraseña incorrectos.', badCredentials: true })
  }
})

test('login: acepta una cuenta antigua con contraseña en texto plano y la marca como legacy', async () => {
  const fetcher = fetcherCon(Response.json({ success: true, usuario: 'Lucero', nombre: 'Lucero Cerdán', password_hash: 'Lucero12' }))

  assert.equal((await authenticateUser('Lucero', 'Lucero12', { fetcher, makeConfig })).legacy, true)
  assert.equal((await authenticateUser('Lucero', 'Lucero13', { fetcher, makeConfig })).ok, false)
})

test('login: respuestas inválidas o fallos de red no autentican', async () => {
  const sinHash = fetcherCon(Response.json({ success: true, usuario: 'roberto01' }))
  assert.equal((await authenticateUser('roberto01', 'clave-segura-123', { fetcher: sinHash, makeConfig })).status, 502)

  const sinExito = fetcherCon(Response.json({ success: false, usuario: 'roberto01', password_hash: 'x' }))
  assert.equal((await authenticateUser('roberto01', 'x', { fetcher: sinExito, makeConfig })).ok, false)

  const caido = async () => { throw new Error('network') }
  const red = await authenticateUser('roberto01', 'clave-segura-123', { fetcher: caido, makeConfig })
  assert.equal(red.ok, false)
  assert.equal(red.status, 502)

  const sinConfig = await authenticateUser('roberto01', 'clave-segura-123', { fetcher: fetcherCon(new Response()), makeConfig: null })
  assert.equal(sinConfig.status, 503)
})
