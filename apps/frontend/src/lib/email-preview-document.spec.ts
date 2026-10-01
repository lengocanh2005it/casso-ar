import { describe, expect, it } from 'vitest';
import { createEmailPreviewDocument } from './email-preview-document';

describe('createEmailPreviewDocument', () => {
  it('wraps the body with readable typography', () => {
    const doc = createEmailPreviewDocument('<p>Xin chào</p>');

    expect(doc).toContain('<p>Xin chào</p>');
    expect(doc).toContain('16px/1.65');
  });

  it('stays neutral so a template that ships its own shell is not double-wrapped', () => {
    const doc = createEmailPreviewDocument('<p>x</p>');

    expect(doc).not.toContain('background:#f1f5f9');
    expect(doc).not.toContain('box-shadow');
  });

  it('blocks network access but keeps inline styles and data images', () => {
    const doc = createEmailPreviewDocument('<p style="color:#111">x</p>');

    expect(doc).toContain("default-src 'none'");
    expect(doc).toContain('img-src data:');
    expect(doc).toContain("style-src 'unsafe-inline'");
    expect(doc).toContain('color:#111');
  });

  it('falls back to a placeholder when the body is blank', () => {
    expect(createEmailPreviewDocument('   ')).toContain(
      'Nội dung email sẽ hiển thị ở đây.',
    );
  });
});
