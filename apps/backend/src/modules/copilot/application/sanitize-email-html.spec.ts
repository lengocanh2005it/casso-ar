import { sanitizeEmailHtml } from './sanitize-email-html';

describe('sanitizeEmailHtml', () => {
  it('strips script tags entirely', () => {
    const result = sanitizeEmailHtml('<p>Hello</p><script>alert(1)</script>');
    expect(result).not.toContain('<script');
    expect(result).not.toContain('alert(1)');
    expect(result).toContain('<p>Hello</p>');
  });

  it('strips event-handler attributes', () => {
    const result = sanitizeEmailHtml('<img src="x" onerror="alert(1)">');
    expect(result).not.toContain('onerror');
  });

  it('strips javascript: URLs from links', () => {
    const result = sanitizeEmailHtml('<a href="javascript:alert(1)">click</a>');
    expect(result).not.toContain('javascript:');
  });

  it('keeps http(s) and mailto links intact', () => {
    const result = sanitizeEmailHtml(
      '<a href="https://example.com">site</a> <a href="mailto:a@b.com">mail</a>',
    );
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('href="mailto:a@b.com"');
  });

  it('keeps common email-safe formatting tags', () => {
    const result = sanitizeEmailHtml(
      '<p>Kính gửi,</p><p>Số tiền: <strong>1.000.000 VND</strong></p><ul><li>Mục 1</li></ul>',
    );
    expect(result).toContain('<strong>1.000.000 VND</strong>');
    expect(result).toContain('<li>Mục 1</li>');
  });

  it('strips style and iframe tags', () => {
    const result = sanitizeEmailHtml(
      '<style>body{color:red}</style><iframe src="https://evil.example"></iframe><p>ok</p>',
    );
    expect(result).not.toContain('<style');
    expect(result).not.toContain('<iframe');
    expect(result).toContain('<p>ok</p>');
  });
});
