import { buildCassoEmail } from './casso-email-template';

describe('buildCassoEmail', () => {
  it('renders a formal Vietnamese system email with a CID logo and plain-text fallback', () => {
    const email = buildCassoEmail({
      title: 'Xác thực địa chỉ email',
      greeting: 'Kính chào Quý khách,',
      paragraphs: ['Vui lòng xác thực địa chỉ email để tiếp tục.'],
      action: {
        label: 'Xác thực email',
        url: 'https://app.casso.vn/verify?token=abc',
      },
    });

    expect(email.html).toContain('lang="vi"');
    expect(email.html).toContain('cid:casso-ledger-logo');
    expect(email.html).toContain('Xác thực email');
    expect(email.text).toContain('Kính chào Quý khách');
    expect(email.text).toContain('https://app.casso.vn/verify?token=abc');
    expect(email.attachments).toEqual([
      expect.objectContaining({
        filename: 'casso-ledger-logo.png',
        contentId: 'casso-ledger-logo',
        contentType: 'image/png',
      }),
    ]);
  });

  it('escapes dynamic HTML and URL values', () => {
    const email = buildCassoEmail({
      title: 'Thông báo',
      greeting: 'Kính chào <Doanh nghiệp>,',
      paragraphs: ['Tên "đối tác" & thông tin cần kiểm tra.'],
      action: {
        label: 'Mở liên kết',
        url: 'https://app.casso.vn/?a=1&b=2',
      },
    });

    expect(email.html).toContain('&lt;Doanh nghiệp&gt;');
    expect(email.html).toContain('&quot;đối tác&quot; &amp;');
    expect(email.html).toContain('a=1&amp;b=2');
  });
});
