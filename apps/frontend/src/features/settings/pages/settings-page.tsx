import { Permission } from '@casso-ledger/shared-types';
import {
  CreditCard,
  Lock,
  Mail,
  Palette,
  Server,
  Settings as SettingsIcon,
  Users,
} from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/auth-context';
import { hasPermission } from '@/lib/rbac';
import { useUrlQueryParams } from '@/lib/use-url-query-params';
import { AppearanceTab } from '../components/appearance-tab';
import { SmtpTab } from '../components/smtp-tab';

const BillingTab = lazy(() =>
  import('../components/billing-tab').then((m) => ({ default: m.BillingTab })),
);
const UsersTab = lazy(() =>
  import('../components/users-tab').then((m) => ({ default: m.UsersTab })),
);
const EmailTemplatesTab = lazy(() =>
  import('../components/email-templates-tab').then((m) => ({
    default: m.EmailTemplatesTab,
  })),
);

const TAB_SKELETON = <Skeleton className="h-48 w-full" />;

type SettingsTabConfig = {
  value: string;
  label: string;
  icon: typeof Palette;
  render: () => React.ReactNode;
  locked?: boolean;
};

function useSettingsTabs(): SettingsTabConfig[] {
  const { user } = useAuth();
  const role = user?.role;

  return useMemo(
    () => [
      {
        value: 'appearance',
        label: 'Giao diện',
        icon: Palette,
        render: () => <AppearanceTab />,
      },
      {
        value: 'billing',
        label: 'Thanh toán',
        icon: CreditCard,
        locked: !hasPermission(role, Permission.SUBSCRIPTION_MANAGE),
        render: () => (
          <Suspense fallback={TAB_SKELETON}>
            <BillingTab />
          </Suspense>
        ),
      },
      {
        value: 'users',
        label: 'Người dùng',
        icon: Users,
        locked: !hasPermission(role, Permission.USER_MANAGE),
        render: () => (
          <Suspense fallback={TAB_SKELETON}>
            <UsersTab />
          </Suspense>
        ),
      },
      {
        value: 'templates',
        label: 'Mẫu email',
        icon: Mail,
        locked: !hasPermission(role, Permission.EMAIL_TEMPLATE_READ),
        render: () => (
          <Suspense fallback={TAB_SKELETON}>
            <EmailTemplatesTab />
          </Suspense>
        ),
      },
      {
        value: 'smtp',
        label: 'Email riêng',
        icon: Server,
        locked: !hasPermission(role, Permission.ORGANIZATION_SMTP_MANAGE),
        render: () => <SmtpTab />,
      },
    ],
    [role],
  );
}

import { PendingOwnershipTransferBanner } from '../components/pending-ownership-transfer-banner';

export function SettingsPage() {
  const { user } = useAuth();
  const tabs = useSettingsTabs();
  const { searchParams, setParam } = useUrlQueryParams();
  const activeTab = searchParams.get('tab');

  const defaultTab = useMemo(
    () => tabs.find((t) => !t.locked)?.value ?? 'appearance',
    [tabs],
  );

  useEffect(() => {
    const current = tabs.find((t) => t.value === activeTab);
    if (current?.locked) {
      setParam('tab', defaultTab);
    }
  }, [activeTab, defaultTab, tabs, setParam]);

  const resolvedTab =
    tabs.find((t) => t.value === activeTab && !t.locked)?.value ?? defaultTab;

  return (
    <>
      <PageHeader
        title="Cài đặt"
        description="Quản lý tài khoản và cấu hình hệ thống"
        icon={SettingsIcon}
        tone="info"
      />
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <PendingOwnershipTransferBanner organizationId={user?.organizationId} />
        <Tabs
          value={resolvedTab}
          onValueChange={(value) => setParam('tab', value)}
        >
          <TabsList className="w-full justify-start gap-1 overflow-x-auto rounded-lg bg-muted p-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  disabled={tab.locked}
                  className="shrink-0 gap-1.5"
                  title={tab.label}
                >
                  <Icon className="size-3.5 shrink-0" />
                  <span>{tab.label}</span>
                  {tab.locked && <Lock className="size-3 opacity-50" />}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {tabs.map((tab) => (
            <TabsContent key={tab.value} value={tab.value} className="mt-4">
              {resolvedTab === tab.value ? tab.render() : null}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </>
  );
}
