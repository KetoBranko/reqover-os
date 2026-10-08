import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

const field =
  'w-full rounded-lg border border-line bg-surface-2 px-3 text-sm text-fg placeholder:text-faint transition-colors hover:border-line-strong focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 aria-[invalid=true]:border-danger disabled:opacity-60'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(field, 'h-10', className)} {...props} />
))
Input.displayName = 'Input'

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(field, 'min-h-24 py-2 leading-relaxed', className)} {...props} />
))
Textarea.displayName = 'Textarea'

// Native select: accessible, keyboard- and mobile-friendly by default.
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...props }, ref) => (
  <select ref={ref} className={cn(field, 'h-10 appearance-none bg-[length:16px] pr-8', className)} {...props} />
))
Select.displayName = 'Select'

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-[13px] font-medium text-muted', className)} {...props} />
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
  className,
}: {
  label: string
  htmlFor: string
  error?: string
  hint?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-[13px] text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[12px] text-faint">{hint}</p>
      ) : null}
    </div>
  )
}
