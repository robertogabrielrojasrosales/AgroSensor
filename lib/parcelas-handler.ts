import { callMakeApi, isTimeoutError, readMakeApiConfig, type MakeApiConfig } from './make-api.ts'
import { esParcelaEjemplo, generarLecturasEjemplo } from './lecturas-ejemplo.ts'
import type { ActualizarParcela, Lectura, NuevaParcela, Parcela } from './parcelas-types'
import {
  calcularAntiguedad,
  normalizarTipoSensor,
  PARCELA_EJEMPLO_AVANZADO,
  PARCELA_EJEMPLO_BASICO,
  PARCELA_EJEMPLO_SIN_VINCULAR,
  siguienteIdParcela,
  TIPOS_SENSOR,
} from './parcelas-utils.ts'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

// Toda cuenta (existente o nueva) tiene estas tres parcelas de ejemplo; se agregan al iniciar sesión si faltan.
const PARCELAS_EJEMPLO: NuevaParcela[] = [
  { nombre: PARCELA_EJEMPLO_BASICO, hectareas: 0.8, cultivo: 'Maíz', tipo_sensor: 'Básico', fecha_instalacion: '2026-06-01' },
  { nombre: PARCELA_EJEMPLO_AVANZADO, hectareas: 1.2, cultivo: 'Tomate', tipo_sensor: '7 en 1', fecha_instalacion: '2026-07-01' },
  { nombre: PARCELA_EJEMPLO_SIN_VINCULAR, hectareas: 2, cultivo: 'Papa', tipo_sensor: 'Básico', fecha_instalacion: '2026-09-01' },
]

function jsonResponse(body: Record<string, unknown>, status: number) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isValidDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function normalizeUsuario(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function normalizeParcela(value: unknown, usuario: string): Parcela | null {
  if (!isRecord(value) || normalizeUsuario(value.usuario) !== normalizeUsuario(usuario)) return null

  const idParcela = value.id_parcela ?? value['id parcela']
  const tipoSensor = value.tipo_sensor ?? value['tipo sensor']
  const fechaInstalacion = value.fecha_instalacion ?? value['fecha instalacion']
  const hectareasValue = value.hectareas
  const hectareas = typeof hectareasValue === 'string'
    ? Number(hectareasValue.trim().replace(',', '.'))
    : hectareasValue

  if (
    typeof idParcela !== 'string' || !idParcela.trim() ||
    typeof value.nombre !== 'string' || !value.nombre.trim() ||
    typeof hectareas !== 'number' || !Number.isFinite(hectareas) || hectareas <= 0 ||
    typeof value.cultivo !== 'string' || !value.cultivo.trim() ||
    typeof tipoSensor !== 'string' || !tipoSensor.trim() ||
    typeof fechaInstalacion !== 'string' || !isValidDate(fechaInstalacion)
  ) {
    return null
  }

  return {
    id_parcela: idParcela.trim(),
    nombre: value.nombre.trim(),
    hectareas,
    cultivo: value.cultivo.trim(),
    tipo_sensor: normalizarTipoSensor(tipoSensor),
    // La antigüedad siempre se calcula desde la fecha de instalación, no se lee del texto guardado en la hoja.
    antiguedad: calcularAntiguedad(fechaInstalacion),
    fecha_instalacion: fechaInstalacion,
  }
}

function normalizeKey(key: string) {
  return key
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function parseMetric(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const match = value.replace(/\s/g, '').match(/-?\d+(?:[.,]\d+)?/)
  if (!match) return null
  const parsed = Number(match[0].replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

function parseFechaHora(value: unknown) {
  if (typeof value !== 'string') return null
  const normalized = value.trim().replace(' ', 'T')
  return normalized && Number.isFinite(Date.parse(normalized)) ? normalized : null
}

function textValue(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
}

function normalizeLectura(value: unknown, usuario: string, idParcela: string): Lectura | null {
  if (!isRecord(value)) return null
  const row = Object.fromEntries(Object.entries(value).map(([key, entry]) => [normalizeKey(key), entry]))

  if (normalizeUsuario(row.usuario) !== normalizeUsuario(usuario)) return null
  if (textValue(row.id_parcela).toLowerCase() !== idParcela.trim().toLowerCase()) return null

  const idSensor = textValue(row.id_sensor)
  const fechaHora = parseFechaHora(row.fecha_hora)
  const humedad = parseMetric(row.humedad)
  if (!idSensor || !fechaHora || humedad === null) return null

  return {
    id_lectura: textValue(row.id_lectura),
    usuario: textValue(row.usuario),
    id_parcela: textValue(row.id_parcela),
    id_sensor: idSensor,
    fecha_hora: fechaHora,
    humedad,
    temperatura_suelo: parseMetric(row.temperatura_suelo),
    temperatura_ambiente: parseMetric(row.temperatura_ambiente),
    ph_suelo: parseMetric(row.ph_suelo ?? row.ph),
    nitrogeno: parseMetric(row.nitrogeno),
    fosforo: parseMetric(row.fosforo),
    potasio: parseMetric(row.potasio),
    conductividad_electrica: parseMetric(row.conductividad_electrica),
    estado_sensor: textValue(row.estado_sensor),
  }
}

function parseNuevaParcela(value: unknown): NuevaParcela | null {
  if (!isRecord(value)) return null
  const { nombre, hectareas, cultivo, tipo_sensor, fecha_instalacion } = value
  if (
    typeof nombre !== 'string' || !nombre.trim() || nombre.length > 160 ||
    typeof hectareas !== 'number' || !Number.isFinite(hectareas) || hectareas <= 0 ||
    typeof cultivo !== 'string' || !cultivo.trim() || cultivo.length > 100 ||
    typeof tipo_sensor !== 'string' || !(TIPOS_SENSOR as readonly string[]).includes(tipo_sensor) ||
    typeof fecha_instalacion !== 'string' || !isValidDate(fecha_instalacion)
  ) {
    return null
  }

  return {
    nombre: nombre.trim(),
    hectareas,
    cultivo: cultivo.trim(),
    tipo_sensor,
    fecha_instalacion,
  }
}

function parseActualizarParcela(value: unknown): ActualizarParcela | null {
  if (!isRecord(value)) return null
  const { id_parcela, hectareas, cultivo, tipo_sensor } = value
  if (
    typeof id_parcela !== 'string' || !id_parcela.trim() || id_parcela.length > 100 ||
    typeof hectareas !== 'number' || !Number.isFinite(hectareas) || hectareas <= 0 || hectareas > 100_000 ||
    typeof cultivo !== 'string' || !cultivo.trim() || cultivo.length > 100 ||
    typeof tipo_sensor !== 'string' || !(TIPOS_SENSOR as readonly string[]).includes(tipo_sensor)
  ) {
    return null
  }

  return { id_parcela: id_parcela.trim(), hectareas, cultivo: cultivo.trim(), tipo_sensor }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function safeMessage(value: unknown, fallback: string) {
  if (!isRecord(value) || typeof value.message !== 'string') return fallback
  const message = value.message.trim().slice(0, 240)
  return message || fallback
}

function networkErrorResponse(action: 'listar' | 'insertar' | 'lecturas' | 'actualizar', error: unknown) {
  const timedOut = isTimeoutError(error)
  const message = action === 'listar'
    ? timedOut ? 'La carga de parcelas tardó demasiado. Inténtalo otra vez.' : 'No se pudieron cargar las parcelas por un error de conexión.'
    : action === 'lecturas'
      ? timedOut ? 'La carga de lecturas tardó demasiado. Inténtalo otra vez.' : 'No se pudieron cargar las lecturas por un error de conexión.'
      : action === 'actualizar'
        ? timedOut ? 'Guardar los cambios tardó demasiado. Inténtalo otra vez.' : 'No se pudieron guardar los cambios por un error de conexión.'
        : timedOut ? 'El registro tardó demasiado. Inténtalo otra vez.' : 'No se pudo registrar la parcela por un error de conexión.'
  return jsonResponse({ success: false, message }, timedOut ? 504 : 502)
}

type ParcelasHandler = {
  listar: (usuario: string) => Promise<Response>
  listarLecturas: (usuario: string, idParcela: string) => Promise<Response>
  sembrar: (usuario: string) => Promise<Response>
  insertar: (request: Request, usuario: string) => Promise<Response>
  actualizar: (request: Request, usuario: string) => Promise<Response>
}

const NOT_CONFIGURED = 'La integración de parcelas no está configurada en el servidor.'
const KEY_REJECTED = 'Make rechazó la clave del webhook. Revisa su configuración en el servidor.'

export function createParcelasHandler({
  fetcher = fetch,
  makeConfig,
}: {
  fetcher?: typeof fetch
  makeConfig?: MakeApiConfig | null
} = {}) {
  const callMake = (accion: Parameters<typeof callMakeApi>[0], data: Record<string, unknown>) =>
    callMakeApi(accion, data, { fetcher, config: makeConfig === undefined ? readMakeApiConfig() : makeConfig })
  const isOk = (status: number) => status >= 200 && status < 300

  // Parcelas ya registradas por el usuario. Devuelve la Response de error si no se pudo consultar.
  const obtenerParcelas = async (usuario: string): Promise<Parcela[] | Response> => {
    const response = await handlers.listar(usuario)
    if (!response.ok) return response

    const result = await readJson(response)
    if (!isRecord(result) || result.success !== true || !Array.isArray(result.parcelas)) {
      return jsonResponse({ success: false, message: 'No se pudieron revisar las parcelas existentes.' }, 502)
    }

    return result.parcelas.filter((parcela): parcela is Parcela => isRecord(parcela) && typeof parcela.id_parcela === 'string')
  }

  const crearParcela = async (usuario: string, parcela: NuevaParcela, idParcela: string): Promise<Response> => {
    let upstream
    try {
      upstream = await callMake('parcelas_insertar', {
        usuario,
        id_parcela: idParcela,
        ...parcela,
        antiguedad: calcularAntiguedad(parcela.fecha_instalacion),
      })
    } catch (error) {
      return networkErrorResponse('insertar', error)
    }
    if (!upstream) return jsonResponse({ success: false, message: NOT_CONFIGURED }, 503)

    const result = upstream.body
    if (upstream.status === 400) {
      return jsonResponse({ success: false, message: safeMessage(result, 'Revisa los datos de la parcela.') }, 400)
    }
    if (upstream.status === 401 || upstream.status === 403) {
      return jsonResponse({ success: false, message: KEY_REJECTED }, 403)
    }
    if (upstream.status === 409) {
      return jsonResponse({ success: false, message: 'No se pudo asignar el ID de la parcela. Inténtalo de nuevo.' }, 409)
    }
    if (
      upstream.status !== 201 || !isRecord(result) || result.success !== true ||
      ('id_parcela' in result && typeof result.id_parcela !== 'string')
    ) {
      return jsonResponse({ success: false, message: 'Make no pudo registrar la parcela.' }, 502)
    }

    const idDevuelto = typeof result.id_parcela === 'string' && result.id_parcela.trim()
      ? result.id_parcela.trim()
      : idParcela
    return jsonResponse({ success: true, message: 'Parcela registrada', id_parcela: idDevuelto }, 201)
  }

  const handlers: ParcelasHandler = {
    async listar(usuario: string) {
      let upstream
      try {
        upstream = await callMake('parcelas_listar', { usuario })
      } catch (error) {
        return networkErrorResponse('listar', error)
      }
      if (!upstream) return jsonResponse({ success: false, message: NOT_CONFIGURED }, 503)

      const result = upstream.body
      if (upstream.status === 400) {
        return jsonResponse({ success: false, message: safeMessage(result, 'El usuario enviado no es válido.') }, 400)
      }
      if (upstream.status === 401 || upstream.status === 403) {
        return jsonResponse({ success: false, message: KEY_REJECTED }, 403)
      }
      if (!isOk(upstream.status) || !isRecord(result) || result.success !== true || !Array.isArray(result.parcelas)) {
        return jsonResponse({ success: false, message: 'Make devolvió una respuesta no válida al cargar las parcelas.' }, 502)
      }

      const normalizedUsuario = normalizeUsuario(usuario)
      const ownedRows = result.parcelas.filter(
        (row) => isRecord(row) && normalizeUsuario(row.usuario) === normalizedUsuario,
      )
      const parcelas = ownedRows.map((row) => normalizeParcela(row, usuario))
      if (parcelas.some((parcela) => parcela === null)) {
        return jsonResponse({ success: false, message: 'Make devolvió datos de parcelas no válidos.' }, 502)
      }

      return jsonResponse({ success: true, parcelas }, 200)
    },

    async listarLecturas(usuario: string, idParcela: string) {
      const parcelaId = idParcela.trim()
      if (!parcelaId || parcelaId.length > 100) {
        return jsonResponse({ success: false, message: 'La parcela indicada no es válida.' }, 400)
      }

      let upstream
      try {
        upstream = await callMake('lecturas_listar', { usuario, id_parcela: parcelaId })
      } catch (error) {
        return networkErrorResponse('lecturas', error)
      }
      if (!upstream) return jsonResponse({ success: false, message: NOT_CONFIGURED }, 503)

      const result = upstream.body
      if (upstream.status === 400) {
        return jsonResponse({ success: false, message: safeMessage(result, 'La consulta de lecturas no es válida.') }, 400)
      }
      if (upstream.status === 401 || upstream.status === 403) {
        return jsonResponse({ success: false, message: KEY_REJECTED }, 403)
      }
      if (!isOk(upstream.status) || !isRecord(result) || result.success === false || !Array.isArray(result.lecturas)) {
        return jsonResponse({ success: false, message: 'Make devolvió una respuesta no válida al cargar las lecturas.' }, 502)
      }

      const lecturas = result.lecturas
        .map((row) => normalizeLectura(row, usuario, parcelaId))
        .filter((lectura): lectura is Lectura => lectura !== null)

      // Las parcelas de ejemplo no tienen sensores reales: mientras no haya lecturas en la hoja se simulan.
      if (lecturas.length === 0) {
        const parcelas = await obtenerParcelas(usuario)
        if (!(parcelas instanceof Response)) {
          const ejemplo = parcelas.find((parcela) => parcela.id_parcela.toLowerCase() === parcelaId.toLowerCase())
          if (ejemplo && esParcelaEjemplo(ejemplo.nombre)) {
            return jsonResponse({ success: true, lecturas: generarLecturasEjemplo(usuario, ejemplo), simulado: true }, 200)
          }
        }
      }

      return jsonResponse({ success: true, lecturas }, 200)
    },

    async sembrar(usuario: string) {
      const existentes = await obtenerParcelas(usuario)
      if (existentes instanceof Response) return existentes

      const ids = existentes.map((parcela) => parcela.id_parcela)
      const nombres = new Set(existentes.map((parcela) => parcela.nombre))
      const faltantes = PARCELAS_EJEMPLO.filter((parcela) => !nombres.has(parcela.nombre))

      // Una por una para que cada ejemplo reciba el siguiente ID correlativo (P-001, P-002…).
      let added = 0
      for (const parcela of faltantes) {
        const id = siguienteIdParcela(ids)
        const result = await crearParcela(usuario, parcela, id)
        if (!result.ok && result.status !== 409) {
          return jsonResponse({ success: false, message: 'No se pudieron agregar las parcelas de ejemplo.' }, result.status)
        }
        if (result.status === 201) added += 1
        ids.push(id)
      }

      return jsonResponse({ success: true, added }, 200)
    },

    async actualizar(request: Request, usuario: string) {
      let body: unknown
      try {
        body = await request.json()
      } catch {
        return jsonResponse({ success: false, message: 'Revisa los datos de la parcela.' }, 400)
      }

      const cambios = parseActualizarParcela(body)
      if (!cambios) return jsonResponse({ success: false, message: 'Revisa los datos de la parcela.' }, 400)

      let upstream
      try {
        upstream = await callMake('parcelas_actualizar', { usuario, ...cambios })
      } catch (error) {
        return networkErrorResponse('actualizar', error)
      }
      if (!upstream) return jsonResponse({ success: false, message: NOT_CONFIGURED }, 503)

      const result = upstream.body
      if (upstream.status === 400) {
        return jsonResponse({ success: false, message: safeMessage(result, 'Revisa los datos de la parcela.') }, 400)
      }
      if (upstream.status === 401 || upstream.status === 403) {
        return jsonResponse({ success: false, message: KEY_REJECTED }, 403)
      }
      if (upstream.status === 404) {
        return jsonResponse({ success: false, message: 'No encontramos esa parcela en tu cuenta.' }, 404)
      }
      if (!isOk(upstream.status) || !isRecord(result) || result.success !== true) {
        return jsonResponse({ success: false, message: 'No se pudieron guardar los cambios de la parcela.' }, 502)
      }

      return jsonResponse({ success: true, message: 'Parcela actualizada', ...cambios }, 200)
    },

    async insertar(request: Request, usuario: string) {
      let body: unknown
      try {
        body = await request.json()
      } catch {
        return jsonResponse({ success: false, message: 'Revisa los datos de la parcela.' }, 400)
      }

      const parcela = parseNuevaParcela(body)
      if (!parcela) {
        return jsonResponse({ success: false, message: 'Revisa los datos de la parcela.' }, 400)
      }

      const existentes = await obtenerParcelas(usuario)
      if (existentes instanceof Response) return existentes

      return crearParcela(usuario, parcela, siguienteIdParcela(existentes.map((item) => item.id_parcela)))
    },
  }

  return handlers
}
