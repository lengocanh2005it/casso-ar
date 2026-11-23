import { CircleAlert, FilePenLine, LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  COPILOT_DRAFTS_PAGE_SIZE,
  useConfirmCopilotDraft,
  useCopilotDrafts,
  useDeleteCopilotDraft,
  useReopenCopilotDraft,
} from '../api/use-copilot-drafts';
import type { CopilotDraft, CopilotDraftStatus } from '../types';
import { DraftEditDialog } from './draft-edit-dialog';
import { EmailDraftPreview } from './email-draft-preview';

const STATUS_LABEL: Record<CopilotDraftStatus, string> = {
  DRAFTED: 'Chưa gửi đề xuất',
  PENDING: 'Chờ xác nhận',
  CONFIRMED: 'Đã gửi',
  CANCELLED: 'Đã hủy',
  EXPIRED: 'Đã hết hạn',
};

// Reopen, edit, and delete share the same eligibility rule (#171):
// a draft is mutable only when it has no live/sent pending action.
const MUTABLE_STATUSES: CopilotDraftStatus[] = [
  'DRAFTED',
  'CANCELLED',
  'EXPIRED',
];

export function DraftsList({ canSendManual }: { canSendManual: boolean }) {
  const [page, setPage] = useState(1);
  const { data, isError, isLoading, refetch } = useCopilotDrafts(page);
  const reopen = useReopenCopilotDraft();
  const confirm = useConfirmCopilotDraft();
  const deleteDraft = useDeleteCopilotDraft();
  const [editingDraft, setEditingDraft] = useState<CopilotDraft | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogDraftId, setDeleteDialogDraftId] = useState<string | null>(
    null,
  );
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null);
  const totalPages = Math.max(
    1,
    Math.ceil((data?.total ?? 0) / COPILOT_DRAFTS_PAGE_SIZE),
  );
  const isEmptyPage = (data?.items ?? []).length === 0;

  // Deleting the last row of a trailing page (or any page drifting out of
  // range) leaves an empty page: step back instead of stranding the panel.
  useEffect(() => {
    if (isEmptyPage && page > 1) setPage(Math.min(page - 1, totalPages));
  }, [isEmptyPage, page, totalPages]);

  if (isLoading) {
    return (
      <div
        aria-label="Đang tải bản nháp email"
        className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground"
        role="status"
      >
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        Đang tải…
      </div>
    );
  }

  if (isError) {
    return (
      <div
        aria-label="Không thể tải bản nháp email"
        className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        role="alert"
      >
        <span className="flex items-center gap-2">
          <CircleAlert aria-hidden="true" className="size-4" />
          Không thể tải bản nháp email.
        </span>
        <Button size="sm" variant="outline" onClick={() => void refetch()}>
          Thử lại
        </Button>
      </div>
    );
  }

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  if (items.length === 0) {
    return (
      <div
        className="rounded-lg border border-dashed bg-muted/20 p-4 text-center text-sm text-muted-foreground"
        aria-label="Chưa có bản nháp email nào"
        role="status"
      >
        <FilePenLine
          aria-hidden="true"
          className="mx-auto mb-2 size-4 text-primary"
        />
        Chưa có bản nháp email nào.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((draft) => {
        const isDeleting = deletingDraftId === draft.id;

        return (
          <Card key={draft.id} className="gap-3 p-4 shadow-none">
            <CardHeader className="flex flex-col items-start gap-2 px-0 pb-0">
              <div className="min-w-0">
                <CardTitle className="break-words text-base leading-snug">
                  {draft.subject}
                </CardTitle>
                <p className="mt-1 break-all text-sm text-muted-foreground">
                  {draft.recipientEmail}
                </p>
              </div>
              <Badge variant="secondary">{STATUS_LABEL[draft.status]}</Badge>
            </CardHeader>
            <CardContent className="space-y-3 px-0 pt-0 text-sm">
              <EmailDraftPreview
                subject={draft.subject}
                recipientEmail={draft.recipientEmail}
                bodyHtml={draft.bodyHtml}
                compact
              />
              {canSendManual && (
                <div className="flex flex-wrap gap-2">
                  {draft.status === 'PENDING' && draft.pendingActionId && (
                    <Button
                      size="sm"
                      disabled={confirm.isPending}
                      onClick={() => {
                        if (!draft.pendingActionId) return;
                        confirm.mutate(draft.pendingActionId, {
                          onSuccess: () =>
                            toast.success('Đã gửi email nhắc thanh toán.'),
                          onError: () =>
                            toast.error(
                              'Không thể gửi email nhắc thanh toán. Vui lòng thử lại.',
                            ),
                        });
                      }}
                    >
                      Xác nhận gửi
                    </Button>
                  )}
                  {MUTABLE_STATUSES.includes(draft.status) && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={reopen.isPending}
                      onClick={() => {
                        reopen.mutate(draft.id, {
                          onError: () =>
                            toast.error(
                              'Không thể mở lại bản nháp này. Vui lòng thử lại.',
                            ),
                        });
                      }}
                    >
                      Mở lại
                    </Button>
                  )}
                  {MUTABLE_STATUSES.includes(draft.status) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingDraft(draft);
                        setEditDialogOpen(true);
                      }}
                    >
                      Sửa
                    </Button>
                  )}
                  {MUTABLE_STATUSES.includes(draft.status) && (
                    <AlertDialog
                      open={deleteDialogDraftId === draft.id}
                      onOpenChange={(open) => {
                        if (deletingDraftId !== null) return;
                        setDeleteDialogDraftId(open ? draft.id : null);
                      }}
                    >
                      <AlertDialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={deletingDraftId !== null}
                          onClick={() => setDeleteDialogDraftId(draft.id)}
                        >
                          Xóa
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="overscroll-contain">
                        <AlertDialogHeader>
                          <AlertDialogTitle>Xóa bản nháp?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Thao tác này không thể hoàn tác.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Hủy</AlertDialogCancel>
                          <AlertDialogAction
                            disabled={isDeleting}
                            onClick={(event) => {
                              event.preventDefault();
                              setDeletingDraftId(draft.id);
                              deleteDraft.mutate(draft.id, {
                                onSuccess: () => {
                                  setDeletingDraftId(null);
                                  setDeleteDialogDraftId(null);
                                  toast.success('Đã xóa bản nháp.');
                                  // The last row of a trailing page leaves the
                                  // page empty; step back to a page with rows.
                                  if (items.length === 1 && page > 1) {
                                    setPage(page - 1);
                                  }
                                },
                                onError: () => {
                                  setDeletingDraftId(null);
                                  toast.error(
                                    'Không thể xóa bản nháp. Vui lòng thử lại.',
                                  );
                                },
                              });
                            }}
                          >
                            {isDeleting ? 'Đang xóa…' : 'Xác nhận'}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
      {total > COPILOT_DRAFTS_PAGE_SIZE && (
        <nav
          aria-label="Phân trang bản nháp"
          className="flex items-center justify-between gap-2"
        >
          <p className="tabular-nums text-xs text-muted-foreground">
            Trang {page}/{totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage(Math.max(1, page - 1))}
            >
              Trước
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              Sau
            </Button>
          </div>
        </nav>
      )}
      <DraftEditDialog
        draft={editingDraft}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
      />
    </div>
  );
}
