import React from 'react';

// Bidi-safe Arabic regex identical to Android implementation
const NUMERIC_TOKEN = /(?<![\p{L}\p{N}])\d+(?:[./:-]\d+)+(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])\d+(?![\p{L}\p{N}])/gu;

export function bidiSafeArabic(value: string): string {
  if (!value) return '';
  return value.replace(NUMERIC_TOKEN, (match) => `\u2066${match}\u2069`);
}

interface ArabicTextProps extends React.HTMLAttributes<HTMLSpanElement> {
  value: string;
  className?: string;
  as?: 'span' | 'p' | 'div' | 'h1' | 'h2' | 'h3';
}

export const ArabicText: React.FC<ArabicTextProps> = ({
  value,
  className = '',
  as = 'span',
  ...rest
}) => {
  const Component = as;
  return (
    <Component
      dir="auto"
      className={`text-right ${className}`}
      {...rest}
    >
      {bidiSafeArabic(value)}
    </Component>
  );
};
