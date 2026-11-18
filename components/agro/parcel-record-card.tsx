'use client'

import { ChevronRight, MessageCircle, Pencil } from 'lucide-react'
import useSWR from 'swr'
import { companyWhatsappWithMessage, COMPANY_PHONE_DISPLAY } from '@/lib/company-contact'
import { emojiDeCultivo } from '@/lib/cultivos'
import { lecturasKey, listarLecturas } from '@/lib/parcelas-service'
import type { Parcela } from '@/lib/parcelas-types'
import { formatearHectareas, sensoresRecomendados } from '@/lib/parcelas-utils'
import { cn } from '@/lib/utils'
import { Card } from './ui'

// Subtítulo de la tarjeta: verde si la parcela ya tiene sensores vinculados; carmesí con "Cotizar" y WhatsApp si no.
function SensorStatus({ parcela }: { parcela: Parcela }) {
  const { data, error } = useSWR(lecturasKey(parcela.id_parcela), () => listarLecturas(parcela.id_parcela), {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  })

  if (error) return null

  if (!data) {
    return (
      <div className="mt-0.5" aria-hidden>
        <p className="text-xs text-muted-foreground">Revisando sensores…</p>
        <span className="mt-1 block h-px w-full bg-border" />
      </div>
    )
  }

  const sensores = new Set(data.map((lectura) => lectura.id_sensor)).size

  if (sensores > 0) {
    return (
      <div className="mt-0.5">
        <p className="text-xs font-medium text-primary">
          Vinculado con {sensores} {sensores === 1 ? 'sensor' : 'sensores'}
        </p>
        <span className="mt-1 block h-px w-full bg-primary" />
      </div>
    )
  }

  const recomendados = sensoresRecomendados(parcela.hectareas)
  const mensaje = `Hola, quiero cotizar sensores AgroSensor para mi parcela "${parcela.nombre}" (${formatearHectareas(parcela.hectareas)} ha, ${recomendados} ${recomendados === 1 ? 'sensor recomendado' : 'sensores recomendados'}).`

  return (
    <div className="mt-0.5">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
        <span className="font-semibold text-[#b3122f]">Cotizar</span>
        <a
          href={companyWhatsappWithMessage(mensaje)}
          target="_blank"
          rel="noreferrer"
          aria-label={`Cotizar por WhatsApp al ${COMPANY_PHONE_DISPLAY}`}
          className="pointer-events-auto relative z-10 inline-flex items-center gap-1 rounded-md font-medium text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MessageCircle className="size-3.5" aria-hidden />
          WhatsApp {COMPANY_PHONE_DISPLAY}
        </a>
      </p>
      <span className="mt-1 block h-px w-full bg-[#dc143c]" />
    </div>
  )
}

export function ParcelRecordCard({
  parcela,
  onOpen,
  onEdit,
  showSensorStatus = false,
}: {
  parcela: Parcela
  onOpen?: () => void
  onEdit?: () => void
  showSensorStatus?: boolean
}) {
  const details = [
    ['Cultivo', parcela.cultivo],
    ['Tipo de sensor', parcela.tipo_sensor],
    ['Antigüedad', parcela.antiguedad],
    ['Instalación', parcela.fecha_instalacion],
  ] as const

  return (
    <Card className={cn('p-4', onOpen && 'relative transition-transform active:scale-[0.99]')}>
      {onOpen && (
        // Botón que cubre toda la tarjeta; el enlace de WhatsApp queda por encima para no anidar botones.
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Ver detalle de ${parcela.nombre}`}
          className="absolute inset-0 rounded-2xl outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
        />
      )}
      <div className={cn('flex items-start gap-3', onOpen && 'pointer-events-none')}>
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-2xl leading-none" role="img" aria-label={`Cultivo: ${parcela.cultivo}`}>
          {emojiDeCultivo(parcela.cultivo)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="break-words font-semibold">{parcela.nombre}</p>
          {showSensorStatus && <SensorStatus parcela={parcela} />}
        </div>
        <span className="shrink-0 rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-primary">
          {formatearHectareas(parcela.hectareas)} ha
        </span>
        {onOpen && <ChevronRight className="mt-1.5 size-4 shrink-0 text-muted-foreground" aria-hidden />}
      </div>
      <dl className={cn('mt-4 grid grid-cols-2 gap-x-3 gap-y-3 border-t border-border pt-3', onOpen && 'pointer-events-none')}>
        {details.map(([label, value]) => (
          <div className="min-w-0" key={label}>
            <dt className="text-[11px] text-muted-foreground">{label}</dt>
            <dd className="mt-0.5 break-words text-sm font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Editar ${parcela.nombre}`}
          className="mt-3 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-border text-sm font-semibold text-primary outline-none transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/40"
        >
          <Pencil className="size-4" aria-hidden />
          Editar
        </button>
      )}
    </Card>
  )
}
