import { validate } from 'class-validator';
import { PostCopilotMessageDto } from './post-copilot-message.dto';

describe('PostCopilotMessageDto', () => {
  it('rejects content longer than 10000 characters', async () => {
    const dto = Object.assign(new PostCopilotMessageDto(), {
      content: 'x'.repeat(10_001),
    });

    await expect(validate(dto)).resolves.not.toHaveLength(0);
  });
});
