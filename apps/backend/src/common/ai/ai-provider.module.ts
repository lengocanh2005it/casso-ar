import { Module } from '@nestjs/common';
import { AI_CHAT_PROVIDER } from './ai-chat-provider.port';
import { OpenAiChatProviderAdapter } from './openai-chat-provider.adapter';

@Module({
  providers: [
    { provide: AI_CHAT_PROVIDER, useClass: OpenAiChatProviderAdapter },
  ],
  exports: [AI_CHAT_PROVIDER],
})
export class AIProviderModule {}
