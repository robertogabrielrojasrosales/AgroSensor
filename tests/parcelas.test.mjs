import assert from 'node:assert/strict'
import test from 'node:test'
import { createParcelasHandler } from '../lib/parcelas-handler.ts'
import {
  calcularAntiguedad,
  sensoresRecomendados,
  siguienteIdParcela,
  textoCoberturaSensores,
  textoSugerenciaSensores,
} from '../lib/parcelas-utils.ts'

const usuario = 'roberto@gmail.com'
const parcela = {
  id_parcela: 'P-001',
  nombre: 'Parcela Norte',
  hectareas: 12.5,
  cultivo: 'Maíz',
  tipo_sensor: 'Básico',
  antiguedad: calcularAntiguedad('2024-03-15'),
  fecha_instalacion: '2024-03-15',
}
const datosFormulario = {
  nombre: parcela.nombre,
  hectareas: parcela.hectareas,
  cultivo: parcela.cultivo,
  tipo_sensor: parcela.tipo_sensor,
  fecha_instalacion: parcela.fecha_instalacion,
}
const makeUrl = 'https://hook.us2.make.com/test-hook'
const makeHeaders = { 'Content-Type': 'application/json', Accept: 'application/json', 'x-make-apikey': 'test-secret' }

function jsonResponse(body, status = 200) {
  return Response.json(body, { status })
}

function createHandler(options = {}) {
  return createParcelasHandler({
    makeConfig: { url: makeUrl, apiKey: 'test-secret' },
    ...options,
  })
}

test('lista parcelas del usuario y convierte hectáreas string a número', async () => {
  let requestedUrl = ''
  let requestOptions
  const handlers = createHandler({
    fetcher: async (url, options) => {
      requestedUrl = String(url)
      requestOptions = options
      return jsonResponse({ success: true, parcelas: [{ ...parcela, usuario, hectareas: '12.5' }] })
    },
  })

  const response = await handlers.listar(usuario)
  assert.equal(requestedUrl, makeUrl)
  assert.deepEqual(requestOptions.headers, makeHeaders)
  assert.deepEqual(JSON.parse(requestOptions.body), { usuario, accion: 'parcelas_listar' })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { success: true, parcelas: [parcela] })
})

test('normaliza encabezados de Google Sheets con espacios y decimales locales', async () => {
  const hojaRow = {
    usuario: ` ${usuario.toUpperCase()} `,
    'id parcela': 'P-001',
    nombre: 'Parcela Norte',
    hectareas: '1,5',
    cultivo: 'Maíz',
    'tipo sensor': 'Humedad',
    antiguedad: 'Hace 3 años',
    'fecha instalacion': '2023-10-01',
  }
  const handlers = createHandler({
    fetcher: async () => jsonResponse({ success: true, parcelas: [hojaRow] }),
  })

  const response = await handlers.listar(usuario)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    success: true,
    parcelas: [{ ...parcela, hectareas: 1.5, antiguedad: calcularAntiguedad('2023-10-01'), fecha_instalacion: '2023-10-01' }],
  })
})

test('no expone parcelas devueltas para otros usuarios', async () => {
  const handlers = createHandler({
    fetcher: async () => jsonResponse({
      success: true,
      parcelas: [
        { ...parcela, usuario },
        { ...parcela, id_parcela: 'OTHER-001', usuario: 'other@example.com' },
      ],
    }),
  })

  const response = await handlers.listar(usuario)
  assert.deepEqual(await response.json(), { success: true, parcelas: [parcela] })
})

test('acepta una lista vacía', async () => {
  const handlers = createHandler({ fetcher: async () => jsonResponse({ success: true, parcelas: [] }) })
  const response = await handlers.listar(usuario)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { success: true, parcelas: [] })
})

test('rechaza una respuesta de listado con esquema inválido', async () => {
  const handlers = createHandler({
    fetcher: async () => jsonResponse({ success: true, parcelas: [{ ...parcela, usuario, nombre: '' }] }),
  })
  assert.equal((await handlers.listar(usuario)).status, 502)
})

test('inserta con ID siguiente, antigüedad calculada y usuario de sesión (ignora el usuario/ID del cliente)', async () => {
  let insertOptions
  const handlers = createHandler({
    fetcher: async (_url, options) => {
      const body = JSON.parse(options.body)
      if (body.accion === 'parcelas_listar') {
        return jsonResponse({ success: true, parcelas: [{ ...parcela, id_parcela: 'P-007', usuario }, { ...parcela, id_parcela: 'norte', usuario }] })
      }
      insertOptions = options
      return jsonResponse({ success: true, message: 'Parcela registrada', id_parcela: body.id_parcela }, 201)
    },
  })
  const response = await handlers.insertar(new Request('http://localhost/api/parcelas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...datosFormulario, usuario: 'attacker@example.com', id_parcela: 'P-999', antiguedad: 'Hace 50 años' }),
  }), usuario)

  assert.equal(response.status, 201)
  assert.deepEqual(insertOptions.headers, makeHeaders)
  assert.deepEqual(JSON.parse(insertOptions.body), {
    usuario,
    id_parcela: 'P-008',
    ...datosFormulario,
    antiguedad: calcularAntiguedad(datosFormulario.fecha_instalacion),
    accion: 'parcelas_insertar',
  })
  assert.deepEqual(await response.json(), { success: true, message: 'Parcela registrada', id_parcela: 'P-008' })
})

test('la primera parcela de un usuario recibe P-001', async () => {
  let insertBody
  const handlers = createHandler({
    fetcher: async (_url, options) => {
      const body = JSON.parse(options.body)
      if (body.accion === 'parcelas_listar') return jsonResponse({ success: true, parcelas: [] })
      insertBody = body
      return jsonResponse({ success: true, id_parcela: body.id_parcela }, 201)
    },
  })
  const response = await handlers.insertar(new Request('http://localhost/api/parcelas', { method: 'POST', body: JSON.stringify(datosFormulario) }), usuario)
  assert.equal(response.status, 201)
  assert.equal(insertBody.id_parcela, 'P-001')
})

test('mapea el conflicto de ID del webhook a 409', async () => {
  const handlers = createHandler({
    fetcher: async (_url, options) => {
      const body = JSON.parse(options.body)
      if (body.accion === 'parcelas_listar') return jsonResponse({ success: true, parcelas: [] })
      return jsonResponse({ success: false, message: 'duplicate' }, 409)
    },
  })
  const response = await handlers.insertar(new Request('http://localhost/api/parcelas', { method: 'POST', body: JSON.stringify(datosFormulario) }), usuario)
  assert.equal(response.status, 409)
  assert.match((await response.json()).message, /asignar el ID/)
})

test('calcula el ID siguiente y la antigüedad', () => {
  assert.equal(siguienteIdParcela([]), 'P-001')
  assert.equal(siguienteIdParcela(['P-001', 'P-002']), 'P-003')
  assert.equal(siguienteIdParcela(['norte', 'P-009', 'P-3']), 'P-010')

  const hoy = new Date(2026, 10, 18)
  assert.equal(calcularAntiguedad('2026-11-10', hoy), 'Menos de 1 mes')
  assert.equal(calcularAntiguedad('2026-10-18', hoy), 'Hace 1 mes')
  assert.equal(calcularAntiguedad('2026-02-15', hoy), 'Hace 9 meses')
  assert.equal(calcularAntiguedad('2025-11-18', hoy), 'Hace 1 año')
  assert.equal(calcularAntiguedad('2023-10-01', hoy), 'Hace 3 años y 1 mes')
  assert.equal(calcularAntiguedad('2025-12-18', hoy), 'Hace 11 meses')
  assert.equal(calcularAntiguedad('2025-12-20', hoy), 'Hace 10 meses')
})

test('maneja el rechazo 401 o 403 del webhook', async () => {
  for (const status of [401, 403]) {
    const handlers = createHandler({ fetcher: async () => jsonResponse({ success: false }, status) })
    const response = await handlers.listar(usuario)
    assert.equal(response.status, 403)
    assert.match((await response.json()).message, /rechazó la clave/)
  }
})

test('siembra las tres parcelas de ejemplo con IDs correlativos en una cuenta sin parcelas', async () => {
  const inserted = []
  const handlers = createHandler({
    fetcher: async (_url, options) => {
      const body = JSON.parse(options.body)
      if (body.accion === 'parcelas_listar') return jsonResponse({ success: true, parcelas: [] })
      inserted.push(body)
      return jsonResponse({ success: true, id_parcela: body.id_parcela }, 201)
    },
  })

  const response = await handlers.sembrar(usuario)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { success: true, added: 3 })
  assert.deepEqual(inserted.map(({ id_parcela, nombre, tipo_sensor }) => [id_parcela, nombre, tipo_sensor]), [
    ['P-001', 'Parcela de sensor Básico', 'Básico'],
    ['P-002', 'Parcela de sensor Avanzado', '7 en 1'],
    ['P-003', 'Parcela de sensor Básico sin vincular', 'Básico'],
  ])
  assert.ok(inserted.every((item) => item.usuario === usuario))
  assert.ok(inserted.every((item) => item.antiguedad === calcularAntiguedad(item.fecha_instalacion)))
})

test('agrega las parcelas de ejemplo a una cuenta que ya tenía otras, con el siguiente ID', async () => {
  const inserted = []
  const handlers = createHandler({
    fetcher: async (_url, options) => {
      const body = JSON.parse(options.body)
      if (body.accion === 'parcelas_listar') {
        return jsonResponse({ success: true, parcelas: [{ ...parcela, id_parcela: 'P-004', usuario }] })
      }
      inserted.push(body)
      return jsonResponse({ success: true, id_parcela: body.id_parcela }, 201)
    },
  })

  assert.deepEqual(await (await handlers.sembrar(usuario)).json(), { success: true, added: 3 })
  assert.deepEqual(inserted.map(({ id_parcela }) => id_parcela), ['P-005', 'P-006', 'P-007'])
})

test('solo agrega las parcelas de ejemplo que faltan y no repite si ya están las tres', async () => {
  const inserted = []
  const existente = (nombre, id) => ({ ...parcela, id_parcela: id, nombre, usuario })
  let existentes = [existente('Parcela de sensor Básico', 'P-001')]
  const handlers = createHandler({
    fetcher: async (_url, options) => {
      const body = JSON.parse(options.body)
      if (body.accion === 'parcelas_listar') return jsonResponse({ success: true, parcelas: existentes })
      inserted.push(body)
      return jsonResponse({ success: true, id_parcela: body.id_parcela }, 201)
    },
  })

  assert.deepEqual(await (await handlers.sembrar(usuario)).json(), { success: true, added: 2 })
  assert.deepEqual(inserted.map(({ nombre, id_parcela }) => [nombre, id_parcela]), [
    ['Parcela de sensor Avanzado', 'P-002'],
    ['Parcela de sensor Básico sin vincular', 'P-003'],
  ])

  existentes = [
    existente('Parcela de sensor Básico', 'P-001'),
    existente('Parcela de sensor Avanzado', 'P-002'),
    existente('Parcela de sensor Básico sin vincular', 'P-003'),
  ]
  inserted.length = 0
  assert.deepEqual(await (await handlers.sembrar(usuario)).json(), { success: true, added: 0 })
  assert.equal(inserted.length, 0)
})

test('actualiza cultivo, hectáreas y tipo de sensor con el usuario de la sesión', async () => {
  let sent
  const handlers = createHandler({
    fetcher: async (_url, options) => {
      sent = { headers: options.headers, body: JSON.parse(options.body) }
      return jsonResponse({ success: true })
    },
  })
  const response = await handlers.actualizar(new Request('http://localhost/api/parcelas', {
    method: 'PATCH',
    body: JSON.stringify({ id_parcela: 'P-001', cultivo: 'Palta', hectareas: 2.4, tipo_sensor: '7 en 1', usuario: 'attacker@example.com', nombre: 'Otro' }),
  }), usuario)

  assert.equal(response.status, 200)
  assert.deepEqual(sent.headers, makeHeaders)
  assert.deepEqual(sent.body, { usuario, id_parcela: 'P-001', cultivo: 'Palta', hectareas: 2.4, tipo_sensor: '7 en 1', accion: 'parcelas_actualizar' })
  assert.deepEqual(await response.json(), { success: true, message: 'Parcela actualizada', id_parcela: 'P-001', cultivo: 'Palta', hectareas: 2.4, tipo_sensor: '7 en 1' })
})

test('actualizar rechaza datos inválidos sin llamar a Make y traduce 404', async (t) => {
  let fetchCount = 0
  const handlers = createHandler({ fetcher: async () => { fetchCount += 1; return jsonResponse({ success: false }, 404) } })
  const base = { id_parcela: 'P-001', cultivo: 'Palta', hectareas: 2, tipo_sensor: 'Básico' }
  for (const invalid of [
    { ...base, hectareas: 0 },
    { ...base, hectareas: '2' },
    { ...base, cultivo: ' ' },
    { ...base, tipo_sensor: 'Humedad' },
    { ...base, id_parcela: '' },
  ]) {
    await t.test(JSON.stringify(invalid), async () => {
      const response = await handlers.actualizar(new Request('http://localhost/api/parcelas', { method: 'PATCH', body: JSON.stringify(invalid) }), usuario)
      assert.equal(response.status, 400)
    })
  }
  assert.equal(fetchCount, 0)

  const response = await handlers.actualizar(new Request('http://localhost/api/parcelas', { method: 'PATCH', body: JSON.stringify(base) }), usuario)
  assert.equal(response.status, 404)
})

test('las parcelas de ejemplo muestran lecturas simuladas cuando la hoja no tiene lecturas', async () => {
  const ejemplo = (nombre, id, tipo) => ({ ...parcela, id_parcela: id, nombre, tipo_sensor: tipo, usuario })
  const handlers = createHandler({
    fetcher: async (_url, options) => {
      const body = JSON.parse(options.body)
      if (body.accion === 'lecturas_listar') return jsonResponse({ success: true, lecturas: [{}] })
      return jsonResponse({ success: true, parcelas: [
        ejemplo('Parcela de sensor Básico', 'P-001', 'Básico'),
        ejemplo('Parcela de sensor Avanzado', 'P-002', '7 en 1'),
        ejemplo('Mi parcela', 'P-003', 'Básico'),
      ] })
    },
  })

  const basico = (await (await handlers.listarLecturas(usuario, 'P-001')).json()).lecturas
  assert.equal(new Set(basico.map((l) => l.id_sensor)).size, 2)
  assert.ok(basico.every((l) => l.ph_suelo === null && l.id_parcela === 'P-001' && l.usuario === usuario))

  const avanzado = (await (await handlers.listarLecturas(usuario, 'P-002')).json()).lecturas
  assert.equal(new Set(avanzado.map((l) => l.id_sensor)).size, 3)
  assert.ok(avanzado.every((l) => l.ph_suelo !== null && l.nitrogeno !== null && l.conductividad_electrica !== null))

  const propia = (await (await handlers.listarLecturas(usuario, 'P-003')).json()).lecturas
  assert.deepEqual(propia, [])
})

test('regla de cobertura: 1 sensor por cada 0.4 ha', () => {
  assert.equal(sensoresRecomendados(0), 0)
  assert.equal(sensoresRecomendados(0.3), 1)
  assert.equal(sensoresRecomendados(0.4), 1)
  assert.equal(sensoresRecomendados(0.41), 2)
  assert.equal(sensoresRecomendados(0.8), 2)
  assert.equal(sensoresRecomendados(1.2), 3)
  assert.equal(sensoresRecomendados(2), 5)
  assert.equal(textoCoberturaSensores(1.2, 3), '')
  assert.match(textoCoberturaSensores(1.2, 1), /Hay 1 sensor, pero para 1[.,]2 ha recomendamos 3/)
  assert.match(textoCoberturaSensores(0.8, 0), /Aún no hay sensores conectados/)
  assert.match(textoSugerenciaSensores(1), /como máximo 0.4 ha/)
})

test('rechaza campos ausentes, hectáreas no positivas y fechas inválidas', async (t) => {
  let fetchCount = 0
  const handlers = createHandler({ fetcher: async () => { fetchCount += 1; return jsonResponse({}, 201) } })
  const invalidParcels = [
    { ...datosFormulario, nombre: '' },
    { ...datosFormulario, hectareas: 0 },
    { ...datosFormulario, fecha_instalacion: '2024-02-30' },
    { ...datosFormulario, tipo_sensor: 'Humedad' },
    { ...datosFormulario, cultivo: '  ' },
  ]

  for (const invalid of invalidParcels) {
    await t.test(JSON.stringify(invalid), async () => {
      const response = await handlers.insertar(new Request('http://localhost/api/parcelas', { method: 'POST', body: JSON.stringify(invalid) }), usuario)
      assert.equal(response.status, 400)
    })
  }
  assert.equal(fetchCount, 0)
})

test('no llama a Make si falta la configuración del webhook', async () => {
  let fetchCount = 0
  const handlers = createParcelasHandler({ makeConfig: null, fetcher: async () => { fetchCount += 1; return jsonResponse({}, 200) } })
  const response = await handlers.listar(usuario)
  assert.equal(response.status, 503)
  assert.equal(fetchCount, 0)
})

test('maneja errores de red del webhook', async () => {
  const handlers = createHandler({ fetcher: async () => { throw new Error('network') } })
  const response = await handlers.insertar(new Request('http://localhost/api/parcelas', { method: 'POST', body: JSON.stringify(datosFormulario) }), usuario)
  assert.equal(response.status, 502)
})

test('lista lecturas del usuario y parcela, normalizando unidades y decimales locales', async () => {
  let requestedBody
  const handlers = createHandler({
    fetcher: async (_url, options) => {
      requestedBody = JSON.parse(options.body)
      return jsonResponse({
        success: true,
        lecturas: [
          {},
          {
            id_lectura: 'LEC-001',
            usuario: ` ${usuario.toUpperCase()} `,
            id_parcela: 'Norte',
            id_sensor: 'SEN-101',
            fecha_hora: '2026-11-16 06:30:00',
            humedad: '58,5%',
            temperatura_suelo: '18,4 °C',
            temperatura_ambiente: '20,2 °C',
            ph_suelo: '5,4',
            nitrogeno: '38',
            fosforo: '22',
            potasio: '165',
            conductividad_electrica: '1,25 dS/m',
            estado_sensor: 'Activo',
          },
          { usuario: 'otro@gmail.com', id_parcela: 'norte', id_sensor: 'SEN-1', fecha_hora: '2026-11-16 06:30:00', humedad: '40%' },
          { usuario, id_parcela: 'sur', id_sensor: 'SEN-2', fecha_hora: '2026-11-16 06:30:00', humedad: '40%' },
        ],
      })
    },
  })

  const response = await handlers.listarLecturas(usuario, 'norte')
  assert.deepEqual(requestedBody, { usuario, id_parcela: 'norte', accion: 'lecturas_listar' })
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.lecturas.length, 1)
  assert.deepEqual(
    {
      humedad: body.lecturas[0].humedad,
      temperatura_suelo: body.lecturas[0].temperatura_suelo,
      ph_suelo: body.lecturas[0].ph_suelo,
      conductividad_electrica: body.lecturas[0].conductividad_electrica,
      fecha_hora: body.lecturas[0].fecha_hora,
    },
    { humedad: 58.5, temperatura_suelo: 18.4, ph_suelo: 5.4, conductividad_electrica: 1.25, fecha_hora: '2026-11-16T06:30:00' },
  )
})

test('acepta lecturas vacías y rechaza respuestas inválidas', async () => {
  const empty = createHandler({ fetcher: async () => jsonResponse({ lecturas: [{}] }) })
  assert.deepEqual(await (await empty.listarLecturas(usuario, 'norte')).json(), { success: true, lecturas: [] })

  const invalid = createHandler({ fetcher: async () => jsonResponse({ success: true }) })
  assert.equal((await invalid.listarLecturas(usuario, 'norte')).status, 502)
  assert.equal((await invalid.listarLecturas(usuario, '  ')).status, 400)
})
