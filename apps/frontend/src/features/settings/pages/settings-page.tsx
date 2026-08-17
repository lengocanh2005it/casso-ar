import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUrlQueryParams } from '@/lib/use-url-query-params';
import { BillingTab } from '../components/billing-tab';
import { EmailTemplatesTab } from '../components/email-templates-tab';
import { SmtpTab } from '../components/smtp-tab';
import { UsersTab } from '../components/users-tab';

const TABS = ['billing', 'users', 'templates', 'smtp'] as const;

export function SettingsPage() {
  const { searchParams, setParam } = useUrlQueryParams();
  const activeTab = searchParams.get('tab');
  const tab = TABS.includes(activeTab as (typeof TABS)[number])
    ? (activeTab as (typeof TABS)[number])
    : 'billing';

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-primary">QUẢN TRỊ</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Cài đặt</h1>
      </div>
      <Tabs value={tab} onValueChange={(value) => setParam('tab', value)}>
        <TabsList>
          <TabsTrigger value="billing">Thanh toán</TabsTrigger>
          <TabsTrigger value="users">Người dùng</TabsTrigger>
          <TabsTrigger value="templates">Mẫu email</TabsTrigger>
          <TabsTrigger value="smtp">Email server riêng</TabsTrigger>
        </TabsList>
        <TabsContent value="billing" className="pt-4">
          <BillingTab />
        </TabsContent>
        <TabsContent value="users" className="pt-4">
          <UsersTab />
        </TabsContent>
        <TabsContent value="templates" className="pt-4">
          <EmailTemplatesTab />
        </TabsContent>
        <TabsContent value="smtp" className="pt-4">
          <SmtpTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
