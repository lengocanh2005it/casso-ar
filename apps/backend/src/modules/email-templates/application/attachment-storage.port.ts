export interface IAttachmentStorage {
  save(
    organizationId: string,
    emailTemplateId: string,
    originalFilename: string,
    buffer: Buffer,
  ): Promise<string>;
  read(storageKey: string): Promise<Buffer>;
  exists(storageKey: string): Promise<boolean>;
  delete(storageKey: string): Promise<void>;
}

export const ATTACHMENT_STORAGE = Symbol('ATTACHMENT_STORAGE');
