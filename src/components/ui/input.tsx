import type { InputHTMLAttributes } from 'react';

const Input = ({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) => {
  return <input className={className} {...props} />;
};

export { Input };
