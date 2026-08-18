import { useCallback, useEffect, useState } from 'react';
import type { CopilotConversationSummary } from '../types';
import { listCopilotConversations } from './copilot-api';

export function useCopilotConversations() {
  const [conversations, setConversations] = useState<
    CopilotConversationSummary[]
  >([]);
  const [activeConversationId, setActiveConversationId] = useState(() =>
    crypto.randomUUID(),
  );
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const page = await listCopilotConversations();
      setConversations(page.items);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function startNewConversation() {
    setActiveConversationId(crypto.randomUUID());
  }

  function selectConversation(id: string) {
    setActiveConversationId(id);
  }

  return {
    conversations,
    activeConversationId,
    isLoading,
    refresh,
    startNewConversation,
    selectConversation,
  };
}
