import { useState } from 'react';
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
  const { data, isLoading } = useCopilotDrafts(1);
  const reopen = useReopenCopilotDraft();
  const confirm = useConfirmCopilotDraft();
  const deleteDraft = useDeleteCopilotDraft();
  const [editingDraft, setEditingDraft] = useState<CopilotDraft | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogDraftId, setDeleteDialogDraftId] = useState<string | null>(
    null,
  );
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Đang tải…</p>;
  }

  const items = data?.items ?? [];
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Chưa có bản nháp email nào.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((draft) => {
        const isDeleting = deletingDraftId === draft.id;

        return (
          <Card key={draft.id}>
            <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle className="min-w-0 break-words text-sm">
                Bản nháp
              </CardTitle>
              <Badge variant="secondary">{STATUS_LABEL[draft.status]}</Badge>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <EmailDraftPreview
                subject={draft.subject}
                recipientEmail={draft.recipientEmail}
                bodyHtml={draft.bodyHtml}
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
                      Confirm
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
                      Reopen
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
      <DraftEditDialog
        draft={editingDraft}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
      />
    </div>
  );
}
