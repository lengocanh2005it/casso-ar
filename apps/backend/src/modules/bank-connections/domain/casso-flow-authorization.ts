export interface CassoFlowAuthorizationProps {
  id: string;
  organizationId: string;
  businessId: string | null;
  encryptedApiKey: string;
  encryptedSecureToken: string;
  createdAt: Date;
}

export class CassoFlowAuthorization {
  readonly id: string;
  readonly organizationId: string;
  readonly businessId: string | null;
  readonly encryptedApiKey: string;
  readonly encryptedSecureToken: string;
  readonly createdAt: Date;

  constructor(props: CassoFlowAuthorizationProps) {
    Object.assign(this, props);
  }

  rotate(input: {
    businessId: string;
    encryptedApiKey: string;
    encryptedSecureToken: string;
  }): CassoFlowAuthorization {
    return new CassoFlowAuthorization({ ...this, ...input });
  }
}
