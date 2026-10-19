import * as React from 'react';
import { cn } from '@/lib/utils';
import { controlBase } from './styles';

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    data-slot="textarea"
    className={cn(controlBase, 'flex field-sizing-content min-h-20 px-3 py-2', className)}
    {...props}
  />
));
Textarea.displayName = 'Textarea';
