'use client'

import * as T from '@radix-ui/react-tabs'
import { cn } from '@/lib/cn'

export const Tabs = T.Root
export const TabsContent = T.Content

export function TabsList({ className, ...props }: T.TabsListProps) {
  return <T.List className={cn('flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]', className)} {...props} />
}

export function TabsTrigger({ className, ...props }: T.TabsTriggerProps) {
  return (
    <T.Trigger
      className={cn(
        '-mb-px whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-sm text-muted transition-colors hover:text-fg data-[state=active]:border-accent data-[state=active]:text-fg',
        className,
      )}
      {...props}
    />
  )
}
