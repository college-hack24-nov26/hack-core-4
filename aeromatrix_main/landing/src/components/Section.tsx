import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { deepLink, type AppSection } from '@/lib/links';

export function Section({ id, tone = 'cream', className, children }: { id: string; tone?: 'cream' | 'sand' | 'dark'; className?: string; children: ReactNode }) {
  return (
    <section
      id={id}
      className={cn(
        'py-20 sm:py-28',
        tone === 'cream' && 'bg-cream-100 text-cherry-950',
        tone === 'sand' && 'bg-cream-200 text-cherry-950',
        tone === 'dark' && 'bg-cherry-900 text-cream-100',
        className,
      )}
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">{children}</div>
    </section>
  );
}

export function Eyebrow({ children, dark }: { children: ReactNode; dark?: boolean }) {
  return <p className={cn('mb-3 text-xs font-bold uppercase tracking-[0.2em]', dark ? 'text-cherry-300' : 'text-cherry-500')}>{children}</p>;
}

export function H2({ children, dark }: { children: ReactNode; dark?: boolean }) {
  return <h2 className={cn('font-display text-4xl font-semibold leading-tight sm:text-5xl', dark ? 'text-cream-50' : 'text-cherry-950')}>{children}</h2>;
}

/** "Model in AeroMatrix ->" : opens the web app on the matching panel. */
export function ModelLink({ section, children = 'Model in AeroMatrix', dark }: { section: AppSection; children?: ReactNode; dark?: boolean }) {
  return (
    <a
      href={deepLink(section)}
      className={cn('group inline-flex items-center gap-2 font-semibold', dark ? 'text-cherry-200 hover:text-cream-50' : 'text-cherry-500 hover:text-cherry-700')}
    >
      {children}
      <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
    </a>
  );
}

export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <div data-reveal="in" style={{ ['--reveal-delay' as string]: `${delay}ms` }} className={className}>
      {children}
    </div>
  );
}
