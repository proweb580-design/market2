import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@repo/ui/lib/utils';
import { Slot } from 'radix-ui';

// Reference style: small bold uppercase labels, tight radius, solid black primary.
const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md text-[11px] font-bold uppercase tracking-[0.08em] whitespace-nowrap transition-[color,background-color,border-color,opacity,transform] outline-none select-none active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-40 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/85',
        destructive: 'bg-destructive text-white hover:bg-destructive/90',
        outline: 'border border-border bg-transparent hover:border-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'h-auto px-0 underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-11 px-5',
        xs: 'h-6 gap-1 px-2',
        sm: 'h-8 gap-1.5 px-3',
        lg: 'h-12 px-6',
        icon: 'size-9 tracking-normal',
        'icon-xs': 'size-6',
        'icon-sm': 'size-8',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : 'button';

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
