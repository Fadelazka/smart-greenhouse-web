import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils';

/** Tooltip - shadcn/ui primitive di atas Radix Tooltip.
 *
 *  Radix sudah menangani dua hal yang mudah terlewat saat membuat tooltip
 *  sendiri: tooltip hanya muncul saat pengguna keyboard benar-benar fokus
 *  ke elemen, dan tooltip menutup lagi saat ESC ditekan atau pointer
 *  meninggalkan elemen.
 *
 *  Dipakai untuk label tambahan pada tombol ikon dan untuk hover bed 3D.
 */

function TooltipProvider({ delayDuration = 200, ...props }: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider delayDuration={delayDuration} {...props} />;
}

const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

function TooltipContent({
  className,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 rounded-[var(--radius-control)] border border-border bg-popover px-2.5 py-1.5',
          'text-[12px] text-popover-foreground shadow-[0_8px_24px_-8px_rgba(0,0,0,0.6)]',
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
