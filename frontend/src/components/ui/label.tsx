import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from '@/lib/utils';

/** Label - shadcn/ui primitive. Radix Label otomatis menyambungkan `htmlFor`
 *  ke kontrol yang dilatation dengan `id`, sehingga screen reader ikut
 *  terbaca tanpa menuliskan aria-label manual. */
function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      className={cn(
        'text-[13px] font-medium leading-none text-foreground',
        'peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
        className,
      )}
      {...props}
    />
  );
}

export { Label };
