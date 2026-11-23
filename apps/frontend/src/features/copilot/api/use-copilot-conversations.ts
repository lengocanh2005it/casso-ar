import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { CopilotConversationSummary } from '../types';
import { listCopilotConversations } from './copilot-api';
import { COPILOT_DRAFTS_PAGE_SIZE } from './use-copilot-drafts';

const CONVERSATIONS_PAGE_SIZE = COPILOT_DRAFTS_PAGE_SIZE;

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
  // Offset paging shifts as conversations are created, so a refresh that
  // lands mid-load makes that load's rows stale.
  const generationRef = useRef(0);

  // The server returns newest first, so `base` keeps that order and `extra`
  // only contributes rows `base` is missing: a shifted page repeats rows.
  const mergeById = useCallback(
    (
      base: CopilotConversationSummary[],
      extra: CopilotConversationSummary[],
    ) => {
      const seen = new Set(base.map((item) => item.id));
      return [
        ...base,
        ...extra.filter((item) => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        }),
      ];
    },
    [],
  );

  const refresh = useCallback(async () => {
    const generation = ++generationRef.current;
    setIsLoading(true);
    try {
      const page = await listCopilotConversations(1, CONVERSATIONS_PAGE_SIZE);
      if (generation !== generationRef.current) return;
      // Page one first, then whatever later pages the user already loaded.
      setConversations((current) => mergeById(page.items, current));
      setTotal(page.total);
      // A later refresh keeps the pages already loaded; the first one seeds it.
      setLoadedPages((current) => (current < 1 ? 1 : current));
    } catch {
      // A background refresh must not surface as an unhandled rejection, and
      // the list already on screen is still the best one we have.
      toast.error('Không thể tải lịch sử chat.');
    } finally {
      if (generation === generationRef.current) setIsLoading(false);
    }
  }, [mergeById]);

  const loadMore = useCallback(async () => {
    const generation = generationRef.current;
    setIsLoadingMore(true);
    try {
      const page = await listCopilotConversations(
        loadedPages + 1,
        CONVERSATIONS_PAGE_SIZE,
      );
      if (generation !== generationRef.current) return;
      setConversations((current) => mergeById(current, page.items));
      setTotal(page.total);
      setLoadedPages((current) => current + 1);
    } catch {
      toast.error('Không thể tải lịch sử chat.');
    } finally {
      if (generation === generationRef.current) setIsLoadingMore(false);
    }
  }, [loadedPages, mergeById]);

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
