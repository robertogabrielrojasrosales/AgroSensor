import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

// Contraseñas con scrypt (incluido en Node, sin dependencias) y una sal aleatoria por usuario.
// Formato guardado en la hoja: scrypt$N$r$p$sal$hash (sal y hash en base64url).
const PREFIX = 'scrypt'
const COSTO_N = 16_384
const BLOQUE_R = 8
const PARALELISMO_P = 1
const LARGO_HASH = 64
const LARGO_SAL = 16

// Límites para no ejecutar parámetros absurdos si una celda de la hoja se altera.
const MAX_N = 65_536
const MAX_R = 16
const MAX_P = 4
const FORMATO = /^scrypt\$(\d+)\$(\d+)\$(\d+)\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/

function derivar(password: string, sal: Buffer, n: number, r: number, p: number, largo: number) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, sal, largo, { N: n, r, p, maxmem: 128 * n * r * 2 }, (error, clave) => {
      if (error) reject(error)
      else resolve(clave)
    })
  })
}

/** Devuelve el hash con sal listo para guardar. Se llama al registrarse. */
export async function hashPassword(password: string) {
  const sal = randomBytes(LARGO_SAL)
  const hash = await derivar(password, sal, COSTO_N, BLOQUE_R, PARALELISMO_P, LARGO_HASH)
  return `${PREFIX}$${COSTO_N}$${BLOQUE_R}$${PARALELISMO_P}$${sal.toString('base64url')}$${hash.toString('base64url')}`
}

export function isPasswordHash(valor: string) {
  return FORMATO.test(valor)
}

function igualesEnTiempoConstante(a: string, b: string) {
  // Se comparan resúmenes del mismo largo para que el tiempo no dependa del texto.
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  return timingSafeEqual(ha, hb)
}

/**
 * Convierte la contraseña escrita en el input a hash (con la sal guardada) y la compara con el hash que
 * llegó de Make. Si la celda aún tiene una contraseña antigua en texto plano, la compara tal cual y avisa
 * con legacy = true para poder migrarla.
 */
export async function verifyPassword(password: string, guardado: string): Promise<{ ok: boolean; legacy: boolean }> {
  const partes = FORMATO.exec(guardado)
  if (!partes) {
    return { ok: guardado.length > 0 && igualesEnTiempoConstante(password, guardado), legacy: true }
  }

  const [, nTexto, rTexto, pTexto, salTexto, hashTexto] = partes
  const n = Number(nTexto)
  const r = Number(rTexto)
  const p = Number(pTexto)
  const potenciaDeDos = n >= 2 && (n & (n - 1)) === 0
  if (!potenciaDeDos || n > MAX_N || r < 1 || r > MAX_R || p < 1 || p > MAX_P) return { ok: false, legacy: false }

  const esperado = Buffer.from(hashTexto, 'base64url')
  if (esperado.length < 16) return { ok: false, legacy: false }

  try {
    const calculado = await derivar(password, Buffer.from(salTexto, 'base64url'), n, r, p, esperado.length)
    return { ok: timingSafeEqual(calculado, esperado), legacy: false }
  } catch {
    return { ok: false, legacy: false }
  }
}

let hashFalso: Promise<string> | undefined

/** Trabajo equivalente a verificar una contraseña, para que un usuario inexistente no responda más rápido. */
export async function verifyAgainstDummy(password: string) {
  hashFalso ??= hashPassword('contraseña-de-relleno')
  await verifyPassword(password, await hashFalso)
}
