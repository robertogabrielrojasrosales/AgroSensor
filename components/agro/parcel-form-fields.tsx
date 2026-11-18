'use client'

import { Info, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Autocomplete,
  AutocompleteCollection,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteGroup,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteLabel,
  AutocompleteList,
} from '@/components/ui/autocomplete'
import { CULTIVO_GROUPS, type CultivoGroup } from '@/lib/cultivos'
import { textoCoberturaSensores, textoSugerenciaSensores, type TipoSensor } from '@/lib/parcelas-utils'

export const INPUT_CLASS = 'mt-1.5 h-12 w-full rounded-xl border border-border bg-card px-3 outline-none focus:border-primary focus:ring-3 focus:ring-ring/20'

const SENSOR_OPTIONS: Array<{ value: TipoSensor; detalle: string }> = [
  { value: 'Básico', detalle: 'Humedad y temperatura del suelo' },
  { value: '7 en 1', detalle: 'Humedad, temperatura del suelo, pH, nitrógeno (N), fósforo (P), potasio (K) y conductividad eléctrica' },
]

export function Field({
  id,
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  min,
  step,
  inputMode,
}: {
  id: string
  label: string
  value: string | number
  onChange: (value: string) => void
  type?: string
  placeholder?: string
  min?: string
  step?: string
  inputMode?: 'decimal' | 'text'
}) {
  return (
    <label className="block text-sm font-semibold" htmlFor={id}>
      {label}
      <input
        id={id}
        name={id}
        className={INPUT_CLASS}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        min={min}
        step={step}
        inputMode={inputMode}
        required
      />
    </label>
  )
}

export function CultivoField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="block text-sm font-semibold">
      <label htmlFor="cultivo">Cultivo</label>
      <Autocomplete items={CULTIVO_GROUPS} value={value} onValueChange={onChange}>
        <AutocompleteInput
          id="cultivo"
          name="cultivo"
          placeholder="Escribe o elige tu cultivo"
          className={INPUT_CLASS}
          required
        />
        <AutocompleteContent>
          <AutocompleteEmpty>Sin coincidencias: se usará lo que escribiste.</AutocompleteEmpty>
          <AutocompleteList>
            {(group: CultivoGroup) => (
              <AutocompleteGroup key={group.value} items={group.items}>
                <AutocompleteLabel>{group.value}</AutocompleteLabel>
                <AutocompleteCollection>
                  {(item: string) => <AutocompleteItem key={item} value={item}>{item}</AutocompleteItem>}
                </AutocompleteCollection>
              </AutocompleteGroup>
            )}
          </AutocompleteList>
        </AutocompleteContent>
      </Autocomplete>
    </div>
  )
}

export function TipoSensorField({ value, onChange }: { value: TipoSensor; onChange: (value: TipoSensor) => void }) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold">Tipo de sensor</legend>
      <div className="mt-1.5 flex flex-col gap-2">
        {SENSOR_OPTIONS.map((option) => {
          const selected = value === option.value
          return (
            <label
              key={option.value}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors focus-within:ring-2 focus-within:ring-ring',
                selected ? 'border-primary bg-primary/[0.04]' : 'border-border bg-card hover:border-primary/40',
              )}
            >
              <input
                type="radio"
                name="tipo_sensor"
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              <span
                className={cn('mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border', selected ? 'border-primary' : 'border-muted-foreground/40')}
                aria-hidden
              >
                {selected && <span className="size-2.5 rounded-full bg-primary" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{option.value}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{option.detalle}</span>
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

/**
 * Regla de cobertura: 1 sensor por cada 0.4 ha.
 * Sin `instalados` es una sugerencia (formularios); con `instalados` avisa solo si faltan sensores.
 */
export function SensorCoverageNote({
  hectareas,
  instalados,
  className,
}: {
  hectareas: number
  instalados?: number
  className?: string
}) {
  const esAviso = instalados !== undefined
  const texto = esAviso ? textoCoberturaSensores(hectareas, instalados) : textoSugerenciaSensores(hectareas)
  if (!texto) return null

  const Icon = esAviso ? TriangleAlert : Info
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm',
        esAviso ? 'border-warning/25 bg-warning/10 text-warning' : 'border-primary/20 bg-accent text-foreground',
        className,
      )}
    >
      <Icon className={cn('mt-0.5 size-4 shrink-0', !esAviso && 'text-primary')} aria-hidden />
      <p className="leading-snug">{texto}</p>
    </div>
  )
}
