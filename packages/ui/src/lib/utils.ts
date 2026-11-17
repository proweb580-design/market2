import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Teach tailwind-merge our type-scale utilities so `label-xs` overrides shadcn's `text-sm` instead of losing to it.
const twMerge = extendTailwindMerge({
  extend: { classGroups: { 'font-size': ['label-xs'] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
