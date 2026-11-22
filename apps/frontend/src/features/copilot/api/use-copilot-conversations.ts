import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { CopilotConversationSummary } from '../types';
import { listCopilotConversations } from './copilot-api';

const CONVERSATIONS_PAGE_SIZE = 20;

export function useCopilotConversations() {
  const [conversations, setConversations] = useState<
    CopilotConversationSummary[]
  >([]);
  const [activeConversationId, setActiveConversationId] = useState<string>(() =>
    crypto.randomUUID(),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [loadedPages, setLoadedPages] = useState(0);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const page = await listCopilotConversations(1, CONVERSATIONS_PAGE_SIZE);
      setConversations(page.items);
      setTotal(page.total);
      setLoadedPages(1);
    } catch {
      // A background refresh must not surface as an unhandled rejection, and
      // the list already on screen is still the best one we have.
      toast.error('Không thể tải lịch sử chat.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    setIsLoadingMore(true);
    try {
      const page = await listCopilotConversations(
        loadedPages + 1,
        CONVERSATIONS_PAGE_SIZE,
      );
      setConversations((current) => [...current, ...page.items]);
      setTotal(page.total);
      setLoadedPages((current) => current + 1);
    } catch {
      toast.error('Không thể tải lịch sử chat.');
    } finally {
      setIsLoadingMore(false);
    }
  }, [loadedPages]);

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
    isLoadingMore,
    hasMore: conversations.length < total,
    refresh,
    loadMore,
    startNewConversation,
    selectConversation,
  };
}
