import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'quiet';

const STYLES: Record<Variant, string> = {
  // Brass is reserved for the player's own levers (end turn, sign, start).
  primary:
    'bg-brass text-white hover:bg-brass-dark disabled:bg-ink-3/40 disabled:text-white/80 shadow-[inset_0_-2px_0_rgba(0,0,0,0.15)]',
  secondary: 'border border-ink/25 bg-panel text-ink hover:border-ink/50 disabled:text-ink-3 disabled:border-rule',
  quiet: 'text-ink-2 hover:text-ink underline-offset-4 hover:underline disabled:text-ink-3',
};

export function Button({
  variant = 'secondary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${STYLES[variant]} ${className}`}
      {...props}
    />
  );
}
