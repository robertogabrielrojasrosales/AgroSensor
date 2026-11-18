import type { Lectura, Parcela } from './parcelas-types'
import { normalizarTipoSensor, PARCELA_EJEMPLO_AVANZADO, PARCELA_EJEMPLO_BASICO } from './parcelas-utils.ts'

// Lecturas de ejemplo para las parcelas de ejemplo (no se guardan en la hoja): una semana de datos, cada 4 horas.
const PASO_MS = 4 * 60 * 60 * 1000
const DIAS = 7
export const PREFIJO_LECTURA_EJEMPLO = 'EJ-'

export function esParcelaEjemplo(nombre: string) {
  return nombre === PARCELA_EJEMPLO_BASICO || nombre === PARCELA_EJEMPLO_AVANZADO
}

function ruido(semilla: number) {
  // Pseudoaleatorio determinista en [-1, 1] para que los datos de ejemplo sean estables entre cargas.
  const x = Math.sin(semilla * 12.9898) * 43758.5453
  return (x - Math.floor(x)) * 2 - 1
}

function redondear(valor: number, decimales = 1) {
  return Number(valor.toFixed(decimales))
}

export function generarLecturasEjemplo(usuario: string, parcela: Pick<Parcela, 'id_parcela' | 'nombre' | 'hectareas' | 'tipo_sensor'>, ahora = new Date()): Lectura[] {
  const avanzado = normalizarTipoSensor(parcela.tipo_sensor) === '7 en 1'
  // Los sensores de ejemplo cumplen la regla de cobertura (1 sensor cada 0.4 ha) para la superficie original de cada ejemplo.
  const cantidadSensores = avanzado ? 3 : 2
  const fin = Math.floor(ahora.getTime() / PASO_MS) * PASO_MS
  const pasos = (DIAS * 24 * 60 * 60 * 1000) / PASO_MS
  const lecturas: Lectura[] = []

  for (let paso = pasos; paso >= 0; paso--) {
    const instante = fin - paso * PASO_MS
    const fecha = new Date(instante)
    const horaDelDia = (fecha.getUTCHours() + 24 + OFFSET_LIMA_MS / 3_600_000) % 24 + fecha.getUTCMinutes() / 60
    const ciclo = Math.sin(((horaDelDia - 8) / 24) * Math.PI * 2)
    const momentoLectura = paso === 0 ? ahora : fecha

    for (let sensor = 1; sensor <= cantidadSensores; sensor++) {
      const semilla = instante / 1_000_000 + sensor * 7.3
      const humedad = 55 + 9 * Math.sin((instante / 86_400_000) * 1.7 + sensor) - 4 * ciclo + 3 * ruido(semilla)
      const base = {
        id_lectura: `${PREFIJO_LECTURA_EJEMPLO}${parcela.id_parcela}-${sensor}-${instante}`,
        usuario,
        id_parcela: parcela.id_parcela,
        id_sensor: `${avanzado ? 'SEN-A' : 'SEN-B'}0${sensor}`,
        fecha_hora: formatoLocal(momentoLectura),
        humedad: redondear(Math.min(85, Math.max(28, humedad))),
        temperatura_suelo: redondear(20.5 + 3 * ciclo + ruido(semilla + 1) * 0.6),
        temperatura_ambiente: redondear(22 + 5 * ciclo + ruido(semilla + 2) * 0.8),
        estado_sensor: 'Activo',
      }
      lecturas.push(
        avanzado
          ? {
              ...base,
              ph_suelo: redondear(6.2 + ruido(semilla + 3) * 0.25),
              nitrogeno: Math.round(42 + ruido(semilla + 4) * 6),
              fosforo: Math.round(24 + ruido(semilla + 5) * 3),
              potasio: Math.round(180 + ruido(semilla + 6) * 12),
              conductividad_electrica: redondear(1.3 + ruido(semilla + 7) * 0.15, 2),
            }
          : { ...base, ph_suelo: null, nitrogeno: null, fosforo: null, potasio: null, conductividad_electrica: null },
      )
    }
  }

  return lecturas
}

// La hoja guarda las fechas en hora de Lima (UTC-5), sin zona; así las lecturas de ejemplo no dependen de la zona del servidor.
const OFFSET_LIMA_MS = -5 * 60 * 60 * 1000

function formatoLocal(fecha: Date) {
  const lima = new Date(fecha.getTime() + OFFSET_LIMA_MS)
  const dos = (n: number) => String(n).padStart(2, '0')
  return `${lima.getUTCFullYear()}-${dos(lima.getUTCMonth() + 1)}-${dos(lima.getUTCDate())}T${dos(lima.getUTCHours())}:${dos(lima.getUTCMinutes())}:00`
}
