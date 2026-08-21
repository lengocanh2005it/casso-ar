import sanitizeHtml from 'sanitize-html';

// AI-generated (and user-edited) email bodies are free-form HTML that gets
// rendered in a preview iframe and, eventually, in a real recipient's email
// client — this is the single sanitize path both write sites (the
// draftReminderEmail tool and manual draft edits) route through.
export function sanitizeEmailHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      'p',
      'br',
      'strong',
      'b',
      'em',
      'i',
      'u',
      'ul',
      'ol',
      'li',
      'a',
      'table',
      'thead',
      'tbody',
      'tr',
      'td',
      'th',
      'h1',
      'h2',
      'h3',
      'span',
      'div',
    ],
    allowedAttributes: {
      a: ['href'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    disallowedTagsMode: 'discard',
  });
}
