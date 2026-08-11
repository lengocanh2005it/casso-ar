export enum SmtpConfigStatus {
  CONNECTED = 'CONNECTED',
  FAILED = 'FAILED',
}

export interface OrganizationSmtpConfigProps {
  id: string;
  organizationId: string;
  host: string;
  port: number;
  username: string;
  encryptedPassword: string;
  fromAddress: string;
  status: SmtpConfigStatus;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export class OrganizationSmtpConfig {
  readonly id: string;
  readonly organizationId: string;
  readonly host: string;
  readonly port: number;
  readonly username: string;
  readonly encryptedPassword: string;
  readonly fromAddress: string;
  readonly status: SmtpConfigStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;

  constructor(props: OrganizationSmtpConfigProps) {
    this.id = props.id;
    this.organizationId = props.organizationId;
    this.host = props.host;
    this.port = props.port;
    this.username = props.username;
    this.encryptedPassword = props.encryptedPassword;
    this.fromAddress = props.fromAddress;
    this.status = props.status;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    this.version = props.version;
  }

  isConnected(): boolean {
    return this.status === SmtpConfigStatus.CONNECTED;
  }

  /** CONNECTED -> FAILED on a real send exhausting its retries. */
  markFailed(): OrganizationSmtpConfig {
    if (this.status === SmtpConfigStatus.FAILED) return this;
    return new OrganizationSmtpConfig({
      ...this,
      status: SmtpConfigStatus.FAILED,
      updatedAt: new Date(),
    });
  }
}
