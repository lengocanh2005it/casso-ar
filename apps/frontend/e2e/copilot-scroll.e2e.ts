import { expect, type Page, test } from '@playwright/test';
import { stubApi } from './fixtures/stub-api';
import { openRoute } from './layout-invariants';

const USER = {
  id: 'user-1',
  email: 'owner@example.test',
  name: 'Nguyễn Văn A',
  avatarUrl: null,
  role: 'OWNER',
  organizationId: 'org-1',
  organizationName: 'Công ty ABC',
  subscriptionPlan: 'BUSINESS',
  bankingLinked: true,
};

const CONVERSATION_ID = '00000000-0000-4000-8000-000000000001';

const FILLER =
  'Khoản phải thu của khách hàng đã quá hạn mười hai ngày và cần được nhắc thanh toán trong tuần này. ';

const historyMessage = (index: number) => ({
  id: `history-${index}`,
  role: index % 2 === 0 ? 'USER' : 'ASSISTANT',
  content: `Tin nhắn lịch sử ${index}. ${FILLER.repeat(2)}`,
  createdAt: '2026-10-06T10:00:00.000Z',
});

const HISTORY_COUNT = 40;
const NEWEST_HISTORY_TEXT = `Tin nhắn lịch sử ${HISTORY_COUNT}. ${FILLER.repeat(2)}`;

const sse = (events: Array<{ event: string; data: unknown }>) =>
  events
    .map(
      (event) =>
        `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`,
    )
    .join('');

const answerEvents = (text: string) => [
  { event: 'delta', data: { text } },
  {
    event: 'done',
    data: {
      message: {
        id: 'answer-1',
        role: 'ASSISTANT',
        content: text,
        createdAt: '2026-10-06T10:05:00.000Z',
      },
      pendingAction: null,
    },
  },
];

function deferred() {
  let release: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release: () => release() };
}

async function openCopilotHistory(page: Page) {
  await page.addInitScript((conversationId) => {
    localStorage.setItem('casso:has-session', '1');
    crypto.randomUUID = () =>
      conversationId as ReturnType<typeof crypto.randomUUID>;
  }, CONVERSATION_ID);
  await stubApi(page, {
    user: USER,
    routes: {
      'v1/alerts': { body: { items: [], total: 0, unreadCount: 0 } },
      'v1/bank-transactions/pending-review-count': { body: { count: 0 } },
      'v1/alerts/stream': async (route) => {
        await route.abort();
      },
      'v1/copilot/usage': {
        body: {
          turnsUsed: 2,
          turnsLimit: 50,
          periodStart: '2026-10-01',
          periodEnd: '2026-10-31',
        },
      },
      'v1/copilot/conversations': {
        body: {
          items: [
            {
              id: CONVERSATION_ID,
              title: 'Cuộc trò chuyện cũ',
              createdAt: '2026-10-01T10:00:00.000Z',
              lastMessageAt: '2026-10-06T10:00:00.000Z',
            },
          ],
          total: 1,
        },
      },
      [`v1/copilot/conversations/${CONVERSATION_ID}/messages`]: {
        body: {
          items: Array.from({ length: HISTORY_COUNT }, (_, index) =>
            historyMessage(index + 1),
          ),
        },
      },
      'v1/copilot/drafts': { body: { items: [], total: 0 } },
    },
  });
  await openRoute(page, '/copilot', 'h1');
  await expect(page.getByText(NEWEST_HISTORY_TEXT)).toBeVisible();
}

function scroller(page: Page) {
  return page.getByTestId('copilot-scroll');
}

async function scrollToTop(page: Page) {
  await scroller(page).evaluate((element) => {
    element.scrollTop = 0;
  });
}

// A scroll event is dispatched on the next frame, so a bare scrollTop write
// has not reached the page's stick-to-bottom listener when it returns.
async function settleScrollEvents(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function sendQuestion(page: Page, question: string) {
  await page.getByLabel('Nhập câu hỏi').fill(question);
  await page.getByRole('button', { name: 'Gửi' }).click();
}

test.describe('copilot scroll', () => {
  test('opens an overflowing conversation at its newest message', async ({
    page,
  }) => {
    await openCopilotHistory(page);
    expect(
      await scroller(page).evaluate(
        (element) => element.scrollHeight > element.clientHeight,
      ),
    ).toBe(true);
    await expect(
      page.getByText(NEWEST_HISTORY_TEXT, { exact: true }),
    ).toBeInViewport();
  });

  test('shows the streamed answer and keeps the composer usable', async ({
    page,
  }) => {
    await openCopilotHistory(page);
    const answer = 'Câu trả lời đã chạy xong và nằm ở cuối cuộc trò chuyện.';
    await page.route(
      `**/api/v1/copilot/conversations/${CONVERSATION_ID}/messages/stream`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body: sse(answerEvents(answer)),
        });
      },
    );

    await sendQuestion(page, 'Tóm tắt công nợ');
    await expect(page.getByText(answer, { exact: true })).toBeVisible();
    await expect(page.getByText(answer, { exact: true })).toBeInViewport();
    await expect(page.getByLabel('Nhập câu hỏi')).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Gửi' })).toBeVisible();
  });

  test('leaves the reader where they scrolled when the reply lands', async ({
    page,
  }) => {
    await openCopilotHistory(page);
    const gate = deferred();
    const answer = 'Phản hồi đến sau khi người đọc đã cuộn lên.';
    await page.route(
      `**/api/v1/copilot/conversations/${CONVERSATION_ID}/messages/stream`,
      async (route) => {
        await gate.promise;
        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body: sse(answerEvents(answer)),
        });
      },
    );

    await sendQuestion(page, 'Tóm tắt công nợ');
    await expect(page.getByRole('button', { name: 'Dừng' })).toBeVisible();
    // The sent question scrolls the list to its bottom in an effect that may
    // still be pending; scrolling up before it lands gets overridden.
    await expect
      .poll(() =>
        scroller(page).evaluate(
          (element) =>
            element.scrollHeight - element.scrollTop - element.clientHeight,
        ),
      )
      .toBeLessThan(80);
    await scrollToTop(page);
    await expect
      .poll(() => scroller(page).evaluate((element) => element.scrollTop))
      .toBeLessThan(40);
    await settleScrollEvents(page);

    gate.release();
    await expect(page.getByText(answer, { exact: true })).toBeAttached();
    // The reply must not drag a reader who is re-reading older messages.
    await expect
      .poll(() => scroller(page).evaluate((element) => element.scrollTop))
      .toBeLessThan(40);
  });

  test('follows a question the reader sends from partway up', async ({
    page,
  }) => {
    await openCopilotHistory(page);
    await scrollToTop(page);
    await page.route(
      `**/api/v1/copilot/conversations/${CONVERSATION_ID}/messages/stream`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body: sse(answerEvents('Đã ghi nhận câu hỏi mới.')),
        });
      },
    );

    await sendQuestion(page, 'Tóm tắt công nợ');
    // Sending is an explicit request for the answer, unlike an incoming token.
    await expect
      .poll(() =>
        scroller(page).evaluate(
          (element) =>
            element.scrollHeight - element.scrollTop - element.clientHeight,
        ),
      )
      .toBeLessThan(80);
    await expect(page.getByText('Đã ghi nhận câu hỏi mới.')).toBeInViewport();
  });
});
