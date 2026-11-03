import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-colors focus-visible:outline-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-cherry-500 text-cream-50 hover:bg-cherry-400',
        dark: 'bg-cherry-900 text-cream-100 hover:bg-cherry-700',
        outline: 'border border-cherry-900/25 text-cherry-900 hover:bg-cherry-900/5',
        light: 'bg-cream-100 text-cherry-900 hover:bg-cream-50',
        ghost: 'text-cherry-500 hover:bg-cherry-500/10',
      },
      size: {
        md: 'h-11 px-6 text-sm',
        lg: 'h-14 px-8 text-base',
        sm: 'h-9 px-4 text-sm',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
Button.displayName = 'Button';

export { buttonVariants };
