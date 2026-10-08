'use client'

import * as D from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'

export const Dialog = D.Root
export const DialogTrigger = D.Trigger
export const DialogClose = D.Close

/** Centered dialog on desktop, bottom sheet on mobile. */
export function DialogContent({
  title,
  description,
  children,
  className,
  wide,
}: {
  title: string
  description?: string
  children: React.ReactNode
  className?: string
  wide?: boolean
}) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]" />
      <D.Content
        className={cn(
          'fixed z-50 flex max-h-[92dvh] flex-col border border-line-strong bg-surface shadow-2xl focus:outline-none',
          'inset-x-0 bottom-0 rounded-t-2xl sm:inset-auto sm:left-1/2 sm:top-[12vh] sm:-translate-x-1/2 sm:rounded-2xl',
          wide ? 'sm:w-[min(760px,94vw)]' : 'sm:w-[min(520px,94vw)]',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <D.Title className="text-base font-semibold text-fg">{title}</D.Title>
            {description ? (
              <D.Description className="mt-1 text-sm text-muted">{description}</D.Description>
            ) : (
              <D.Description className="sr-only">{title}</D.Description>
            )}
          </div>
          <D.Close className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Schließen">
            <X className="size-5" />
          </D.Close>
        </div>
        <div className="overflow-y-auto px-5 py-4 pb-safe">{children}</div>
      </D.Content>
    </D.Portal>
  )
}
