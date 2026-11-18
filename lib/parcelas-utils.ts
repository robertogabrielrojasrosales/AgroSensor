export const TIPOS_SENSOR = ['Básico', '7 en 1'] as const
export type TipoSensor = (typeof TIPOS_SENSOR)[number]

/** Hectáreas máximas que puede cubrir un sensor sin perder confiabilidad. */
export const HECTAREAS_POR_SENSOR = 0.4

/** Sensores recomendados para una superficie: 1 por cada 0.4 ha (mínimo 1). */
export function sensoresRecomendados(hectareas: number) {
  if (!Number.isFinite(hectareas) || hectareas <= 0) return 0
  // En milésimas de hectárea para evitar errores de coma flotante (1.2 / 0.4 no debe dar 4).
  return Math.max(1, Math.ceil(Math.round(hectareas * 1000) / (HECTAREAS_POR_SENSOR * 1000)))
}

export function textoSugerenciaSensores(hectareas: number) {
  const n = sensoresRecomendados(hectareas)
  if (n === 0) return ''
  return `Un sensor cubre como máximo ${HECTAREAS_POR_SENSOR} ha. Para ${formatearHectareas(hectareas)} ha recomendamos ${n} ${n === 1 ? 'sensor' : 'sensores'}; con menos aumenta la posibilidad de lecturas incorrectas.`
}

/** Aviso cuando la parcela tiene menos sensores de los recomendados. Vacío si cumple la regla. */
export function textoCoberturaSensores(hectareas: number, instalados: number) {
  const n = sensoresRecomendados(hectareas)
  if (n === 0 || instalados >= n) return ''
  const actual = instalados === 0
    ? 'Aún no hay sensores conectados'
    : `Hay ${instalados} ${instalados === 1 ? 'sensor' : 'sensores'}`
  return `${actual}, pero para ${formatearHectareas(hectareas)} ha recomendamos ${n} (1 por cada ${HECTAREAS_POR_SENSOR} ha). Con menos sensores aumenta la posibilidad de lecturas incorrectas.`
}

export function formatearHectareas(hectareas: number) {
  return new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(hectareas)
}

/** Parcelas de ejemplo que tiene toda cuenta (existente o nueva). */
export const PARCELA_EJEMPLO_BASICO = 'Parcela de sensor Básico'
export const PARCELA_EJEMPLO_AVANZADO = 'Parcela de sensor Avanzado'
// Tercer ejemplo: sensor Básico sin vincular (no tiene lecturas; en el home muestra "Cotizar").
export const PARCELA_EJEMPLO_SIN_VINCULAR = 'Parcela de sensor Básico sin vincular'
export const NOMBRES_PARCELAS_EJEMPLO: readonly string[] = [
  PARCELA_EJEMPLO_BASICO,
  PARCELA_EJEMPLO_AVANZADO,
  PARCELA_EJEMPLO_SIN_VINCULAR,
]

/** Siguiente ID correlativo del usuario con formato P-001, P-002… (ignora IDs que no sigan ese formato). */
export function siguienteIdParcela(idsExistentes: readonly string[]) {
  let maximo = 0
  for (const id of idsExistentes) {
    const coincidencia = /^P-(\d+)$/i.exec(id.trim())
    if (coincidencia) maximo = Math.max(maximo, Number(coincidencia[1]))
  }
  return `P-${String(maximo + 1).padStart(3, '0')}`
}

/** Antigüedad legible calculada a partir de la fecha de instalación (YYYY-MM-DD). */
export function calcularAntiguedad(fechaInstalacion: string, ahora = new Date()) {
  const coincidencia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fechaInstalacion.trim())
  if (!coincidencia) return ''

  const [, anio, mes, dia] = coincidencia.map(Number) as [number, number, number, number]
  let meses = (ahora.getFullYear() - anio) * 12 + (ahora.getMonth() + 1 - mes)
  if (ahora.getDate() < dia) meses -= 1
  if (meses < 1) return 'Menos de 1 mes'

  if (meses < 12) return `Hace ${meses} ${meses === 1 ? 'mes' : 'meses'}`

  const anios = Math.floor(meses / 12)
  const restantes = meses % 12
  const parteAnios = `${anios} ${anios === 1 ? 'año' : 'años'}`
  return restantes === 0
    ? `Hace ${parteAnios}`
    : `Hace ${parteAnios} y ${restantes} ${restantes === 1 ? 'mes' : 'meses'}`
}

/** Los datos antiguos usan "Humedad", "Avanzado", etc.; todo lo que no sea sensor avanzado se muestra como Básico. */
export function normalizarTipoSensor(valor: string): TipoSensor {
  const texto = valor.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  return /avanz|7\s*en\s*1/.test(texto) ? '7 en 1' : 'Básico'
}
