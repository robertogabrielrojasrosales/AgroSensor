export type Parcela = {
  id_parcela: string
  nombre: string
  hectareas: number
  cultivo: string
  tipo_sensor: string
  antiguedad: string
  fecha_instalacion: string
}

// Lo que envía el formulario: el ID se asigna solo y la antigüedad se calcula desde la fecha de instalación.
export type NuevaParcela = Omit<Parcela, 'id_parcela' | 'antiguedad'>

// Lo que se puede cambiar de una parcela ya registrada.
export type ActualizarParcela = Pick<Parcela, 'id_parcela' | 'cultivo' | 'hectareas' | 'tipo_sensor'>

export type ParcelasResponse = {
  success: true
  parcelas: Parcela[]
}

export type Lectura = {
  id_lectura: string
  usuario: string
  id_parcela: string
  id_sensor: string
  fecha_hora: string
  humedad: number
  temperatura_suelo: number | null
  temperatura_ambiente: number | null
  ph_suelo: number | null
  nitrogeno: number | null
  fosforo: number | null
  potasio: number | null
  conductividad_electrica: number | null
  estado_sensor: string
}

export type LecturasResponse = {
  success: true
  lecturas: Lectura[]
}

export type InsertarParcelaResponse = {
  success: true
  message: string
  id_parcela: string
}
