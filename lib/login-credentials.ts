import { callMakeApi, isTimeoutError, readMakeApiConfig, type MakeApiConfig } from './make-api.ts'
import { verifyAgainstDummy, verifyPassword } from './password-hash.ts'

export type LoginResult =
  | { ok: true; usuario: string; nombre: string; correo: string; legacy: boolean }
  | { ok: false; status: number; message: string; badCredentials: boolean }

const CREDENCIALES_INCORRECTAS = 'Usuario o contraseña incorrectos.'

const fallo = (status: number, message: string, badCredentials = false): LoginResult => ({ ok: false, status, message, badCredentials })

function texto(cuerpo: Record<string, unknown>, clave: string, max: number) {
  const valor = cuerpo[clave]
  return typeof valor === 'string' ? valor.trim().slice(0, max) : ''
}

/**
 * Login con hash: Make solo devuelve el hash guardado en la hoja (nunca recibe la contraseña escrita) y la
 * aplicación convierte la contraseña del input en hash para compararlo.
 */
export async function authenticateUser(
  usuario: string,
  password: string,
  { fetcher = fetch, makeConfig }: { fetcher?: typeof fetch; makeConfig?: MakeApiConfig | null } = {},
): Promise<LoginResult> {
  let respuesta
  try {
    respuesta = await callMakeApi('login_hash', { usuario }, { fetcher, config: makeConfig === undefined ? readMakeApiConfig() : makeConfig })
  } catch (error) {
    const agotado = isTimeoutError(error)
    return fallo(
      agotado ? 504 : 502,
      agotado ? 'El servicio de acceso tardó demasiado. Inténtalo de nuevo.' : 'No se pudo conectar con el servicio de acceso.',
    )
  }
  if (!respuesta) return fallo(503, 'La integración con Make no está configurada en el servidor.')

  // Usuario inexistente: se hace el mismo trabajo de hash para no delatar si el usuario existe.
  if (respuesta.status === 401 || respuesta.status === 404) {
    await verifyAgainstDummy(password)
    return fallo(401, CREDENCIALES_INCORRECTAS, true)
  }

  const cuerpo = respuesta.body
  const valido =
    respuesta.status >= 200 && respuesta.status < 300 &&
    cuerpo !== null && typeof cuerpo === 'object' &&
    (cuerpo as Record<string, unknown>).success === true
  if (!valido) return fallo(502, 'El servicio de acceso no está disponible. Inténtalo más tarde.')

  const datos = cuerpo as Record<string, unknown>
  const usuarioGuardado = texto(datos, 'usuario', 151)
  const guardado = typeof datos.password_hash === 'string' ? datos.password_hash.trim() : ''
  if (!usuarioGuardado || usuarioGuardado.length > 150 || !guardado) {
    return fallo(502, 'El servicio de acceso no está disponible. Inténtalo más tarde.')
  }

  const { ok, legacy } = await verifyPassword(password, guardado)
  if (!ok) return fallo(401, CREDENCIALES_INCORRECTAS, true)

  return { ok: true, usuario: usuarioGuardado, nombre: texto(datos, 'nombre', 100), correo: texto(datos, 'correo', 254), legacy }
}
