import type { TextareaHTMLAttributes } from 'react';

const Textarea = ({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) => {
  return <textarea className={className} {...props} />;
};

export { Textarea };
