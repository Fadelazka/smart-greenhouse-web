import * as React from 'react';
import { cn } from '@/lib/utils';

/** Input - shadcn/ui primitive.
 *
 *  `aria-invalid` sengaja diberi style berbeda (border-destructive + ring)
 *  supaya galat validasi tidak hanya mengandalkan warna teks.
 *
 *  Spinner bawaan `type="number"` bisa membingungkan, jadi `step` tetap
 *  dipakai agar nilai kalibrasi hanya masuk dalam kelipatan yang wajar (0.1).
 */
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      className={cn(
        'flex h-10 w-full rounded-[var(--radius-control)] border border-input bg-transparent',
        'px-3 text-[14px] text-foreground transition-colors',
        'placeholder:text-muted-foreground',
        'focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring focus-visible:border-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-destructive aria-invalid:focus-visible:outline-destructive',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
