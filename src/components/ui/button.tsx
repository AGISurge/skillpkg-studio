import type { ButtonHTMLAttributes } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'ghost' | 'primary';
  size?: 'default' | 'icon';
};

const Button = ({
  className = '',
  variant = 'ghost',
  size = 'default',
  type = 'button',
  ...props
}: ButtonProps) => {
  const variantClass = variant === 'primary' ? 'btn primary' : 'btn ghost';
  const sizeClass = size === 'icon' ? 'input-icon-btn' : variantClass;

  return <button type={type} className={`${sizeClass} ${className}`.trim()} {...props} />;
};

export { Button };
