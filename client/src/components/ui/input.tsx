import * as React from 'react';
import { cn } from '@/lib/utils';
import { controlBase } from './styles';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    data-slot="input"
    className={cn(
      controlBase,
      'flex h-10 px-3 py-1 md:h-9',
      'file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';
