// Cliente del escenario "AgroSensor API" de Make (reemplaza a los webhooks de n8n).
// Un solo webhook recibe { accion, ...datos } y responde con el código HTTP y el JSON de cada acción.

const MAKE_TIMEOUT_MS = 20_000

export type MakeApiAction =
  | 'login'
  | 'registro'
  | 'parcelas_listar'
  | 'parcelas_insertar'
  | 'parcelas_actualizar'
  | 'lecturas_listar'

export type MakeApiConfig = { url: string; apiKey: string }

export type MakeApiResult = { status: number; body: unknown }

export function readMakeApiConfig(): MakeApiConfig | null {
  const url = process.env.MAKE_API_URL?.trim() ?? ''
  const apiKey = process.env.MAKE_API_KEY?.trim() ?? ''
  if (!url || !apiKey) return null

  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.make.com')) return null
  } catch {
    return null
  }

  return { url, apiKey }
}

export function isTimeoutError(error: unknown) {
  return error instanceof Error && error.name === 'TimeoutError'
}

/**
 * Llama al webhook de Make. Devuelve null si falta la configuración del servidor.
 * Lanza el error de red (incluido TimeoutError) para que cada ruta lo traduzca a su mensaje.
 */
export async function callMakeApi(
  accion: MakeApiAction,
  data: Record<string, unknown>,
  { fetcher = fetch, config = readMakeApiConfig() }: { fetcher?: typeof fetch; config?: MakeApiConfig | null } = {},
): Promise<MakeApiResult | null> {
  if (!config) return null

  const response = await fetcher(config.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-make-apikey': config.apiKey,
    },
    body: JSON.stringify({ ...data, accion }),
    cache: 'no-store',
    signal: AbortSignal.timeout(MAKE_TIMEOUT_MS),
  })

  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    body = null
  }

  return { status: response.status, body }
}
