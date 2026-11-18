'use client'

import { useState, type FormEvent } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { CalendarDays, LoaderCircle, Plus, RefreshCw, Ruler, Save, Sprout } from 'lucide-react'
import { cn } from '@/lib/utils'
import { calcularAntiguedad, normalizarTipoSensor, type TipoSensor } from '@/lib/parcelas-utils'
import { actualizarParcela, insertarParcela, lecturasKey, listarParcelas, PARCELAS_API_KEY } from '@/lib/parcelas-service'
import type { NuevaParcela } from '@/lib/parcelas-types'
import { useAgro } from '../app-store'
import { CultivoField, Field, INPUT_CLASS, SensorCoverageNote, TipoSensorField } from '../parcel-form-fields'
import { ParcelRecordCard } from '../parcel-record-card'
import { AppButton, Card, ScreenHeader } from '../ui'

export function ParcelListScreen() {
  const { back, push, parcelMessage, setParcelMessage, openEditParcel } = useAgro()
  const { data, error, isLoading, isValidating, mutate } = useSWR(PARCELAS_API_KEY, listarParcelas, {
    dedupingInterval: 0,
  })

  const returnToPreviousScreen = () => {
    setParcelMessage('')
    back()
  }

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader title="Parcelas registradas" onBack={returnToPreviousScreen} />
      <div className="flex-1 overflow-y-auto px-4 py-5 pb-6 no-scrollbar">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">Tus parcelas</h2>
            <p className="mt-1 text-sm text-muted-foreground">Datos sincronizados con AgroSensor.</p>
          </div>
          <button
            type="button"
            onClick={() => { void mutate() }}
            disabled={isValidating}
            aria-label={isValidating ? 'Actualizando parcelas' : 'Actualizar parcelas'}
            aria-busy={isValidating}
            className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <RefreshCw className={cn('size-4', isValidating && 'animate-spin')} aria-hidden />
          </button>
        </div>

        {parcelMessage && <p role="status" className="mb-3 rounded-xl border border-success/25 bg-success/10 px-3 py-2 text-sm font-medium text-success">{parcelMessage}</p>}

        {isLoading && (
          <div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <LoaderCircle className="size-5 animate-spin" aria-hidden />
            Cargando parcelas…
          </div>
        )}

        {error && (
          <Card className="border-danger/25 bg-danger/5 text-center">
            <p role="alert" className="text-sm text-danger">{error instanceof Error ? error.message : 'No se pudieron cargar las parcelas. Inténtalo otra vez.'}</p>
            <AppButton className="mt-4" variant="outline" onClick={() => mutate()}>Reintentar</AppButton>
          </Card>
        )}

        {!isLoading && !error && data?.length === 0 && (
          <Card className="py-8 text-center">
            <Sprout className="mx-auto size-8 text-primary" aria-hidden />
            <p className="mt-3 font-semibold">Aún no hay parcelas</p>
            <p className="mt-1 text-sm text-muted-foreground">Agrega la primera para empezar a gestionarlas.</p>
          </Card>
        )}

        {!isLoading && !error && Boolean(data?.length) && (
          <ul className="flex flex-col gap-3">
            {data?.map((parcela) => (
              <li key={parcela.id_parcela}>
                <ParcelRecordCard parcela={parcela} onEdit={() => { setParcelMessage(''); openEditParcel(parcela) }} />
              </li>
            ))}
          </ul>
        )}

        <AppButton
          className="mt-4"
          onClick={() => {
            setParcelMessage('')
            push('add-parcel')
          }}
        >
          <Plus aria-hidden />Agregar parcela
        </AppButton>
      </div>
    </div>
  )
}

const EMPTY_FORM: NuevaParcela = {
  nombre: '',
  hectareas: 0,
  cultivo: '',
  tipo_sensor: 'Básico',
  fecha_instalacion: '',
}

function hoyIso() {
  const ahora = new Date()
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`
}

export function RegisterParcelScreen() {
  const { back, setParcelMessage } = useAgro()
  const { mutate } = useSWRConfig()
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const antiguedadCalculada = form.fecha_instalacion ? calcularAntiguedad(form.fecha_instalacion) : ''

  const updateField = (field: keyof NuevaParcela, value: string) => {
    setForm((current) => ({
      ...current,
      [field]: field === 'hectareas' ? (value === '' ? 0 : Number(value)) : value,
    }))
    setError('')
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const rawForm = event.currentTarget
    const formData = new FormData(rawForm)
    const hectaresValue = String(formData.get('hectareas') ?? '').trim()
    const hectares = Number(hectaresValue)
    const date = String(formData.get('fecha_instalacion') ?? '')
    const requiredFields = ['nombre', 'cultivo']
    const hasMissingText = requiredFields.some((field) => !String(formData.get(field) ?? '').trim())

    if (hasMissingText || !hectaresValue || !Number.isFinite(hectares) || hectares <= 0 || !date) {
      setError('Completa todos los campos y verifica que las hectáreas sean mayores que 0.')
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError('La fecha debe tener el formato YYYY-MM-DD.')
      return
    }

    const parcela: NuevaParcela = { ...form, hectareas: hectares, fecha_instalacion: date }
    setIsSaving(true)
    setError('')
    try {
      await insertarParcela(parcela)
      void mutate(PARCELAS_API_KEY)
      setParcelMessage('Parcela registrada correctamente.')
      setIsSaving(false)
      back()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar la parcela. Inténtalo de nuevo.')
      setIsSaving(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader title="Nueva parcela" onBack={back} />
      <form onSubmit={submit} className="flex-1 overflow-y-auto px-4 py-4 pb-6 no-scrollbar">
        <p className="text-sm text-muted-foreground">Completa los datos que aparecerán en la lista de parcelas.</p>
        <div className="mt-4 flex flex-col gap-3">
          <Field id="nombre" label="Nombre" value={form.nombre} onChange={(value) => updateField('nombre', value)} placeholder="Parcela Norte" />
          <Field id="hectareas" label="Hectáreas" value={form.hectareas || ''} onChange={(value) => updateField('hectareas', value)} type="number" min="0" step="any" inputMode="decimal" placeholder="12.5" />
          <CultivoField value={form.cultivo} onChange={(value) => updateField('cultivo', value)} />
          <TipoSensorField value={normalizarTipoSensor(form.tipo_sensor)} onChange={(value) => updateField('tipo_sensor', value)} />
          <SensorCoverageNote hectareas={form.hectareas} />
          <label className="block text-sm font-semibold" htmlFor="fecha_instalacion">
            Fecha de instalación
            <span className="relative mt-1.5 block">
              <input
                id="fecha_instalacion"
                name="fecha_instalacion"
                className={cn(INPUT_CLASS, 'mt-0 pr-10')}
                type="date"
                max={hoyIso()}
                value={form.fecha_instalacion}
                onChange={(event) => updateField('fecha_instalacion', event.target.value)}
                required
              />
              <CalendarDays className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            </span>
          </label>
          <div className="text-sm font-semibold">
            Antigüedad
            <p className="mt-1.5 flex h-12 w-full items-center rounded-xl border border-dashed border-border bg-muted/40 px-3 font-normal text-muted-foreground" aria-live="polite">
              {antiguedadCalculada || 'Se calcula con la fecha de instalación'}
            </p>
          </div>
        </div>
        {error && <p id="parcel-form-error" role="alert" className="mt-3 text-sm font-medium text-danger">{error}</p>}
        <AppButton className="mt-4" type="submit" disabled={isSaving} aria-busy={isSaving}>
          {isSaving ? <><LoaderCircle className="animate-spin" aria-hidden />Guardando…</> : <><Ruler aria-hidden />Guardar parcela</>}
        </AppButton>
      </form>
    </div>
  )
}

// Edita lo que puede cambiar en cualquier parcela (también las de ejemplo): cultivo, hectáreas y tipo de sensor.
export function EditParcelScreen() {
  const { back, setParcelMessage, editingParcel, applyParcelaChanges } = useAgro()
  const { mutate } = useSWRConfig()
  const [cultivo, setCultivo] = useState(editingParcel?.cultivo ?? '')
  const [hectareas, setHectareas] = useState(editingParcel ? String(editingParcel.hectareas) : '')
  const [tipoSensor, setTipoSensor] = useState<TipoSensor>(normalizarTipoSensor(editingParcel?.tipo_sensor ?? ''))
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  if (!editingParcel) {
    return (
      <div className="flex h-full flex-col">
        <ScreenHeader title="Editar parcela" onBack={back} />
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">No hay una parcela seleccionada.</div>
      </div>
    )
  }

  const hectareasNumero = Number(hectareas.replace(',', '.'))

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!cultivo.trim() || !hectareas.trim() || !Number.isFinite(hectareasNumero) || hectareasNumero <= 0) {
      setError('Indica el cultivo y unas hectáreas mayores que 0.')
      return
    }

    setIsSaving(true)
    setError('')
    try {
      const cambios = await actualizarParcela({
        id_parcela: editingParcel.id_parcela,
        cultivo: cultivo.trim(),
        hectareas: hectareasNumero,
        tipo_sensor: tipoSensor,
      })
      applyParcelaChanges({ ...editingParcel, ...cambios })
      void mutate(PARCELAS_API_KEY)
      void mutate(lecturasKey(editingParcel.id_parcela))
      setParcelMessage('Cambios guardados.')
      setIsSaving(false)
      back()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron guardar los cambios. Inténtalo de nuevo.')
      setIsSaving(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader title="Editar parcela" onBack={back} />
      <form onSubmit={submit} className="flex-1 overflow-y-auto px-4 py-4 pb-6 no-scrollbar">
        <p className="text-sm text-muted-foreground">Cambia el cultivo, las hectáreas o el tipo de sensor de esta parcela.</p>
        <div className="mt-4 flex flex-col gap-3">
          <div className="text-sm font-semibold">
            Nombre
            <p className="mt-1.5 flex h-12 w-full items-center rounded-xl border border-dashed border-border bg-muted/40 px-3 font-normal text-muted-foreground">
              {editingParcel.nombre}
            </p>
          </div>
          <Field id="hectareas" label="Hectáreas" value={hectareas} onChange={(value) => { setHectareas(value); setError('') }} type="number" min="0" step="any" inputMode="decimal" placeholder="12.5" />
          <CultivoField value={cultivo} onChange={(value) => { setCultivo(value); setError('') }} />
          <TipoSensorField value={tipoSensor} onChange={(value) => { setTipoSensor(value); setError('') }} />
          <SensorCoverageNote hectareas={hectareasNumero} />
        </div>
        {error && <p role="alert" className="mt-3 text-sm font-medium text-danger">{error}</p>}
        <AppButton className="mt-4" type="submit" disabled={isSaving} aria-busy={isSaving}>
          {isSaving ? <><LoaderCircle className="animate-spin" aria-hidden />Guardando…</> : <><Save aria-hidden />Guardar cambios</>}
        </AppButton>
      </form>
    </div>
  )
}
