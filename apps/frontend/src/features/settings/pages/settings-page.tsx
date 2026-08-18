import { CreditCard, Mail, Palette, Server, Users } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUrlQueryParams } from '@/lib/use-url-query-params';
import { AppearanceTab } from '../components/appearance-tab';
import { BillingTab } from '../components/billing-tab';
import { EmailTemplatesTab } from '../components/email-templates-tab';
import { SmtpTab } from '../components/smtp-tab';
import { UsersTab } from '../components/users-tab';

const TABS = [
  { value: 'appearance', label: 'Giao diện', icon: Palette },
  { value: 'billing', label: 'Thanh toán', icon: CreditCard },
  { value: 'users', label: 'Người dùng', icon: Users },
  { value: 'templates', label: 'Mẫu email', icon: Mail },
  { value: 'smtp', label: 'Email riêng', icon: Server },
] as const;

type TabValue = (typeof TABS)[number]['value'];

export function SettingsPage() {
  const { searchParams, setParam } = useUrlQueryParams();
  const activeTab = searchParams.get('tab');
  const tab = TABS.some((t) => t.value === activeTab)
    ? (activeTab as TabValue)
    : 'appearance';

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-primary">QUẢN TRỊ</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Cài đặt</h1>
      </div>
      <Tabs value={tab} onValueChange={(value) => setParam('tab', value)}>
        <TabsList className="w-full justify-start gap-1 overflow-x-auto rounded-lg bg-muted p-1">
          {TABS.map(({ value, label, icon: Icon }) => (
            <TabsTrigger key={value} value={value} className="gap-1.5">
              <Icon className="size-3.5 shrink-0" />
              <span className="hidden sm:inline">{label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="appearance" className="pt-4">
          <AppearanceTab />
        </TabsContent>
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
