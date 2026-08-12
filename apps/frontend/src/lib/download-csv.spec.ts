import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadCsv } from './download-csv';

describe('downloadCsv', () => {
  const clickMock = vi.fn();

  beforeEach(() => {
    URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
      clickMock,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clickMock.mockClear();
  });

  it('creates a blob download link and clicks it', () => {
    downloadCsv('a,b\n1,2', 'test.csv');

    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(clickMock).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });
});
