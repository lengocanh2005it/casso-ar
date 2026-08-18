import { deriveConversationTitle } from './derive-conversation-title';

describe('deriveConversationTitle', () => {
  it('returns a short message unchanged', () => {
    expect(deriveConversationTitle('Công nợ khách ABC?')).toBe(
      'Công nợ khách ABC?',
    );
  });

  it('truncates a long message at a word boundary with an ellipsis', () => {
    const long =
      'Tóm tắt toàn bộ công nợ và lịch sử thanh toán của khách hàng ABC Company trong quý này';
    const title = deriveConversationTitle(long);
    expect(title.length).toBeLessThanOrEqual(41);
    expect(title.endsWith('…')).toBe(true);
    expect(title).not.toMatch(/\s…$/);
  });

  it('collapses internal whitespace before measuring length', () => {
    expect(deriveConversationTitle('  Xin   chào   ')).toBe('Xin chào');
  });
});
