import { AUDITED_METADATA_KEY } from '../../../common/audit/audited.decorator';
import { RemindersController } from '../../reminders/presentation/reminders.controller';
import { BankConnectionsController } from './bank-connections.controller';

describe('audited metadata on write handlers (issue #104)', () => {
  it('audits reminder-policy update as REMINDER_POLICY_UPDATE', () => {
    const metadata = Reflect.getMetadata(
      AUDITED_METADATA_KEY,
      RemindersController.prototype.update,
    );
    expect(metadata).toEqual({
      actionType: 'REMINDER_POLICY_UPDATE',
      entityType: 'ReminderPolicy',
    });
  });

  it('audits bank-connection token exchange as BANK_CONNECTION_CREATE', () => {
    const metadata = Reflect.getMetadata(
      AUDITED_METADATA_KEY,
      BankConnectionsController.prototype.exchange,
    );
    expect(metadata).toEqual({
      actionType: 'BANK_CONNECTION_CREATE',
      entityType: 'BankConnection',
    });
  });
});
