import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Injectable } from '@nestjs/common';
import type { IAttachmentStorage } from '../application/attachment-storage.port';

const DEFAULT_BASE_DIR = path.resolve('uploads/email-template-attachments');

@Injectable()
export class LocalDiskAttachmentStorage implements IAttachmentStorage {
  constructor(private readonly baseDir: string = DEFAULT_BASE_DIR) {}

  async save(
    organizationId: string,
    emailTemplateId: string,
    originalFilename: string,
    buffer: Buffer,
  ): Promise<string> {
    const dir = path.join(organizationId, emailTemplateId);
    const absoluteDir = path.join(this.baseDir, dir);
    fs.mkdirSync(absoluteDir, { recursive: true });

    const ext = path.extname(originalFilename) || '';
    const generatedName = `${randomUUID()}${ext}`;
    const storageKey = path.join(dir, generatedName);
    fs.writeFileSync(path.join(this.baseDir, storageKey), buffer);
    return storageKey;
  }

  async read(storageKey: string): Promise<Buffer> {
    return fs.readFileSync(path.join(this.baseDir, storageKey));
  }

  async exists(storageKey: string): Promise<boolean> {
    return fs.existsSync(path.join(this.baseDir, storageKey));
  }

  async delete(storageKey: string): Promise<void> {
    const absolutePath = path.join(this.baseDir, storageKey);
    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
    }
  }
}
