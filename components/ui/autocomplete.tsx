'use client'

import * as React from 'react'
import { Autocomplete as AutocompletePrimitive } from '@base-ui/react/autocomplete'
import { ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'

// Escribir o elegir (type ahead): el valor del campo es el texto del input, venga de la lista o no.
const Autocomplete = AutocompletePrimitive.Root

function AutocompleteInput({
  className,
  ...props
}: React.ComponentProps<typeof AutocompletePrimitive.Input>) {
  return (
    <div className="relative">
      <AutocompletePrimitive.Input
        data-slot="autocomplete-input"
        autoComplete="off"
        className={cn('pr-11', className)}
        {...props}
      />
      <AutocompletePrimitive.Trigger
        data-slot="autocomplete-trigger"
        aria-label="Ver lista de cultivos"
        className="absolute top-1/2 right-1.5 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronDown className="size-4" aria-hidden />
      </AutocompletePrimitive.Trigger>
    </div>
  )
}

function AutocompleteContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AutocompletePrimitive.Popup>) {
  return (
    <AutocompletePrimitive.Portal>
      <AutocompletePrimitive.Positioner sideOffset={6} className="isolate z-50 outline-none">
        <AutocompletePrimitive.Popup
          data-slot="autocomplete-content"
          className={cn(
            'flex max-h-[min(18rem,var(--available-height))] w-(--anchor-width) min-w-48 origin-(--transform-origin) flex-col overflow-hidden rounded-xl bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/10 duration-100 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0',
            className,
          )}
          {...props}
        >
          {children}
        </AutocompletePrimitive.Popup>
      </AutocompletePrimitive.Positioner>
    </AutocompletePrimitive.Portal>
  )
}

function AutocompleteList({
  className,
  ...props
}: React.ComponentProps<typeof AutocompletePrimitive.List>) {
  return (
    <AutocompletePrimitive.List
      data-slot="autocomplete-list"
      className={cn('no-scrollbar overflow-y-auto overscroll-contain p-1.5 data-[empty]:p-0', className)}
      {...props}
    />
  )
}

function AutocompleteGroup(props: React.ComponentProps<typeof AutocompletePrimitive.Group>) {
  return <AutocompletePrimitive.Group data-slot="autocomplete-group" {...props} />
}

function AutocompleteLabel({
  className,
  ...props
}: React.ComponentProps<typeof AutocompletePrimitive.GroupLabel>) {
  return (
    <AutocompletePrimitive.GroupLabel
      data-slot="autocomplete-label"
      className={cn('sticky top-0 z-10 my-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground first:mt-0', className)}
      {...props}
    />
  )
}

function AutocompleteItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AutocompletePrimitive.Item>) {
  return (
    <AutocompletePrimitive.Item
      data-slot="autocomplete-item"
      className={cn(
        'flex min-h-10 w-full cursor-default items-center rounded-lg px-2.5 py-2 text-sm outline-hidden select-none data-[highlighted]:bg-muted data-[highlighted]:text-foreground',
        className,
      )}
      {...props}
    >
      {children}
    </AutocompletePrimitive.Item>
  )
}

function AutocompleteEmpty({
  className,
  ...props
}: React.ComponentProps<typeof AutocompletePrimitive.Empty>) {
  return (
    <AutocompletePrimitive.Empty
      data-slot="autocomplete-empty"
      className={cn('px-3 py-3 text-sm text-muted-foreground empty:hidden', className)}
      {...props}
    />
  )
}

function AutocompleteCollection(props: React.ComponentProps<typeof AutocompletePrimitive.Collection>) {
  return <AutocompletePrimitive.Collection data-slot="autocomplete-collection" {...props} />
}

export {
  Autocomplete,
  AutocompleteCollection,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteGroup,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteLabel,
  AutocompleteList,
}
