import type { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const Input = ({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) => {
  return (
    <input
      className={cn('outline-none focus-visible:ring-1 focus-visible:ring-ring', className)}
      {...props}
    />
  );
};

export { Input };
