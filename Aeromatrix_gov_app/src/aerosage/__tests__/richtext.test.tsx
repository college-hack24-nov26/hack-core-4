import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RichText } from '../RichText';

const html = (t: string) => renderToStaticMarkup(<RichText text={t} />);

describe('RichText', () => {
  it('renders bold, bullets and line breaks', () => {
    expect(html('**PM2.5**: 40.1')).toBe('<p class="my-1 first:mt-0 last:mb-0"><span><strong>PM2.5</strong>: 40.1</span></p>');
    expect(html('- one\n- two')).toContain('<ul');
    expect(html('- one\n- two').match(/<li>/g)).toHaveLength(2);
    expect(html('a\nb')).toContain('<br/>');
    expect(html('a\n\nb').match(/<p /g)).toHaveLength(2);
  });

  it('never produces markup from text', () => {
    const out = html('<script>alert(1)</script> <img src=x onerror=alert(1)> [link](javascript:alert(1))');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('<img');
    expect(out).not.toContain('<a ');
    expect(out).toContain('&lt;script&gt;');
  });

  it('handles empty text', () => {
    expect(html('')).toBe('');
    expect(html('   \n\n  ')).toBe('');
  });
});
