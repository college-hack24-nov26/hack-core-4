import { useEffect } from 'react';

/**
 * Deep links like /#simulate. The browser scrolls before fonts and sections have their final height, so it can land
 * in the wrong place; scroll again once the page has settled.
 */
export function useHashScroll(): void {
  useEffect(() => {
    const go = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (id) document.getElementById(id)?.scrollIntoView();
    };
    if (!window.location.hash) return;
    const timers = [setTimeout(go, 150), setTimeout(go, 700)];
    window.addEventListener('load', go);
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener('load', go);
    };
  }, []);
}

/**
 * Fades blocks in as they scroll into view. Anything marked data-reveal starts visible (so the page works without
 * JavaScript and in the server render); once running, blocks below the fold are held back and released on intersect.
 */
export function useReveal(): void {
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            (e.target as HTMLElement).dataset.reveal = 'in';
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
    );
    for (const n of nodes) {
      const top = n.getBoundingClientRect().top;
      if (top > window.innerHeight * 0.9) {
        n.dataset.reveal = 'pending';
        io.observe(n);
      } else {
        n.dataset.reveal = 'in';
      }
    }
    return () => io.disconnect();
  }, []);
}
