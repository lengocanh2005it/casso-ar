import { Camera, KeyRound, LogOut } from 'lucide-react';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { UserAvatar } from '@/components/shared/user-avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/auth-context';
import { useUpdateProfile } from '@/features/profile/api/use-update-profile';
import { useUploadAvatar } from '@/features/profile/api/use-upload-avatar';
import { ChangePasswordForm } from '@/features/profile/components/change-password-form';

function getPlanLabel(plan: string): string {
  const labels: Record<string, string> = {
    FREE: 'Free',
    STARTER: 'Starter',
    GROWTH: 'Growth',
    ENTERPRISE: 'Enterprise',
  };
  return labels[plan] ?? plan;
}

function getRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    OWNER: 'Chủ sở hữu',
    ADMIN: 'Quản trị viên',
    MEMBER: 'Thành viên',
  };
  return labels[role] ?? role;
}

interface ProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProfileDialog({ open, onOpenChange }: ProfileDialogProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [name, setName] = useState(user?.name ?? '');
  const [organizationName, setOrganizationName] = useState(
    user?.organizationName ?? '',
  );
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [pendingAvatarPreview, setPendingAvatarPreview] = useState<
    string | null
  >(null);

  const updateProfile = useUpdateProfile();
  const uploadAvatar = useUploadAvatar();

  if (!user) return null;

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File quá lớn (tối đa 5MB)');
      return;
    }
    if (
      !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(
        file.type,
      )
    ) {
      toast.error('Định dạng file không hợp lệ');
      return;
    }

    setPendingAvatarFile(file);
    setPendingAvatarPreview(URL.createObjectURL(file));
  }

  async function handleSave() {
    const promises: Promise<unknown>[] = [];

    if (
      name !== user.name ||
      (user.role === 'OWNER' && organizationName !== user.organizationName)
    ) {
      promises.push(
        updateProfile.mutateAsync({
          name,
          organizationName:
            user.role === 'OWNER' ? organizationName : undefined,
        }),
      );
    }

    if (pendingAvatarFile) {
      promises.push(uploadAvatar.mutateAsync(pendingAvatarFile));
    }

    if (promises.length === 0) {
      onOpenChange(false);
      return;
    }

    await Promise.all(promises);
    setPendingAvatarFile(null);
    setPendingAvatarPreview(null);
    onOpenChange(false);
  }

  async function handleLogout() {
    onOpenChange(false);
    await logout();
    toast.success('Đã đăng xuất.');
    navigate('/login');
  }

  const isOwner = user.role === 'OWNER';
  const isSaving = updateProfile.isPending || uploadAvatar.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Thông tin tài khoản</DialogTitle>
        </DialogHeader>

        {changePasswordOpen ? (
          <ChangePasswordForm
            onBack={() => setChangePasswordOpen(false)}
            onSuccess={() => {
              setChangePasswordOpen(false);
              onOpenChange(false);
            }}
          />
        ) : (
          <>
            <Tabs defaultValue="personal">
              <TabsList className="w-full justify-start gap-1 overflow-x-auto rounded-lg bg-muted p-1">
                <TabsTrigger value="personal" className="gap-1.5">
                  Cá nhân
                </TabsTrigger>
                {isOwner && (
                  <TabsTrigger value="business" className="gap-1.5">
                    Doanh nghiệp
                  </TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="personal" className="space-y-4 pt-4">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <UserAvatar
                      name={user.name}
                      avatarUrl={pendingAvatarPreview ?? user.avatarUrl}
                      size="lg"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute bottom-0 right-0 flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md hover:bg-primary/90"
                    >
                      <Camera className="size-4" />
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      onChange={handleAvatarChange}
                    />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <p className="truncate font-medium">{user.name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {user.email}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        {getRoleLabel(user.role)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {getPlanLabel(user.subscriptionPlan)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="profile-name">Họ và tên</Label>
                  <Input
                    id="profile-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="profile-email">Email</Label>
                  <Input id="profile-email" value={user.email} disabled />
                </div>

                <Button
                  variant="link"
                  className="h-auto p-0 text-sm"
                  onClick={() => setChangePasswordOpen(true)}
                >
                  <KeyRound className="mr-1 size-3" />
                  Đổi mật khẩu
                </Button>
              </TabsContent>

              {isOwner && (
                <TabsContent value="business" className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="org-name">Tên doanh nghiệp</Label>
                    <Input
                      id="org-name"
                      value={organizationName}
                      onChange={(e) => setOrganizationName(e.target.value)}
                    />
                  </div>
                </TabsContent>
              )}
            </Tabs>

            <DialogFooter className="flex-row items-center gap-2 sm:flex-row-reverse">
              <Button onClick={() => void handleSave()} disabled={isSaving}>
                {isSaving ? 'Đang lưu…' : 'Lưu thay đổi'}
              </Button>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Đóng
              </Button>
            </DialogFooter>
          </>
        )}

        {!changePasswordOpen && (
          <Button
            variant="outline"
            className="w-full justify-start gap-2 text-destructive hover:bg-destructive/5 hover:text-destructive"
            onClick={() => void handleLogout()}
          >
            <LogOut className="size-4" />
            Đăng xuất
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
