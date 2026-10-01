// Neutral page wrapper for email previews: typography + breathing room only.
// Branding (background, card, borders, tables) lives in the template's own
// bodyHtml, so a template that already ships its own shell must not get a
// second one stacked underneath it.
const PREVIEW_STYLES = `
*{box-sizing:border-box}
body{margin:0;padding:20px;color:#0f172a;
  font:16px/1.65 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,
  'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased}
.email-content{overflow-wrap:anywhere}
.email-content img{max-width:100%;height:auto}
.email-content p{margin:0 0 14px}
.email-content h1{font-size:20px;line-height:1.3;margin:0 0 14px}
.email-content h2{font-size:17px;line-height:1.3;margin:20px 0 8px}
.email-content h3{font-size:15px;line-height:1.4;margin:18px 0 6px}
.email-content ul,.email-content ol{margin:0 0 14px;padding-left:24px}
.email-content li{margin:0 0 4px}
@media (max-width:520px){body{padding:14px 10px}}`.trim();

const PREVIEW_CSP = [
  "default-src 'none'",
  'img-src data:',
  "style-src 'unsafe-inline'",
  'font-src data:',
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
].join('; ');

/**
 * Wraps rendered email HTML in a self-contained document so every preview
 * surface (template editor, template preview, copilot draft) renders the same
 * way. The CSP keeps template HTML from phoning home to the network.
 */
export function createEmailPreviewDocument(bodyHtml: string): string {
  const content = bodyHtml.trim()
    ? bodyHtml
    : '<p style="color:#64748b">Nội dung email sẽ hiển thị ở đây.</p>';

  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}"><style>${PREVIEW_STYLES}</style></head><body><div class="email-content">${content}</div></body></html>`;
}
