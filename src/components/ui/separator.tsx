import * as SeparatorPrimitive from '@radix-ui/react-separator';
import { cn } from '@/lib/utils';

export interface SeparatorProps {
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

export function Separator({ orientation = 'horizontal', className }: SeparatorProps) {
  return (
    <SeparatorPrimitive.Root
      decorative
      orientation={orientation}
      className={cn('shrink-0 bg-line', orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px', className)}
    />
  );
}
