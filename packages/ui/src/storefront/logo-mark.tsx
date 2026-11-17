import { cn } from '../lib/utils';

/** Default brand emblem (brands upload their own later). Spins on the Y axis like the reference header logo. */
export function LogoMark({ className, spin = true }: { className?: string; spin?: boolean }) {
  return (
    <span className={cn('inline-block [perspective:400px]', className)}>
      <svg
        viewBox="0 0 48 48"
        aria-hidden
        className={cn('size-full [transform-style:preserve-3d]', spin && 'animate-spin-y')}
      >
        <path
          fill="currentColor"
          d="M24 2C25.6 14.5 28.8 19.4 46 24C28.8 28.6 25.6 33.5 24 46C22.4 33.5 19.2 28.6 2 24C19.2 19.4 22.4 14.5 24 2Z"
        />
        <circle cx="24" cy="24" r="3.2" fill="var(--background)" />
      </svg>
    </span>
  );
}
