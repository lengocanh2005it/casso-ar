import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { LocalDiskAttachmentStorage } from './local-disk-attachment-storage.adapter';

describe('LocalDiskAttachmentStorage', () => {
  let baseDir: string;
  let storage: LocalDiskAttachmentStorage;

  beforeEach(() => {
    baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'attachment-storage-'));
    storage = new LocalDiskAttachmentStorage(baseDir);
  });

  afterEach(() => {
    fs.rmSync(baseDir, { recursive: true, force: true });
  });

  it('saves the file under an org/template-scoped path with a random filename, not the original', async () => {
    const storageKey = await storage.save(
      'org-1',
      'tpl-1',
      'invoice.pdf',
      Buffer.from('pdf-bytes'),
    );

    expect(storageKey.startsWith(path.join('org-1', 'tpl-1'))).toBe(true);
    expect(storageKey.endsWith('.pdf')).toBe(true);
    expect(storageKey).not.toContain('invoice.pdf');
    expect(fs.existsSync(path.join(baseDir, storageKey))).toBe(true);
  });

  it('round-trips content through save/read', async () => {
    const storageKey = await storage.save(
      'org-1',
      'tpl-1',
      'logo.png',
      Buffer.from('png-bytes'),
    );

    const read = await storage.read(storageKey);

    expect(read.toString()).toBe('png-bytes');
  });

  it('reports exists() correctly before and after delete()', async () => {
    const storageKey = await storage.save(
      'org-1',
      'tpl-1',
      'logo.png',
      Buffer.from('png-bytes'),
    );

    expect(await storage.exists(storageKey)).toBe(true);
    await storage.delete(storageKey);
    expect(await storage.exists(storageKey)).toBe(false);
  });
});
