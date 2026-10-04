import { useCallback } from 'react';
import { cn } from '@/lib/utils';

/**
 * Menambahkan ripple visual pada elemen yang diklik.
 * Host diambil dari `event.currentTarget`, jadi setiap elemen punya
 * ripple sendiri tanpa perlu ref terpisah.
 */
export function useRipple() {
  const onPointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const host = event.currentTarget;
    if (host.dataset.rippleDisabled === 'true') return;

    const rect = host.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;
    const x = event.clientX - rect.left - size / 2;
    const y = event.clientY - rect.top - size / 2;

    const dot = document.createElement('span');
    dot.className = 'ripple-dot';
    dot.style.width = `${size}px`;
    dot.style.height = `${size}px`;
    dot.style.left = `${x}px`;
    dot.style.top = `${y}px`;

    host.appendChild(dot);
    dot.addEventListener('animationend', () => dot.remove());
  }, []);

  return { onPointerDown };
}

export function rippleHost(className?: string) {
  return cn('ripple-host', className);
}