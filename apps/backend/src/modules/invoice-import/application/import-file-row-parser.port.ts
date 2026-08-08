export interface ParsedImportFile {
  rows: Record<string, unknown>[];
  totalRows: number;
}

export interface ImportFileRowParser {
  parseFileToRows(buffer: Buffer, originalFilename: string): ParsedImportFile;
}

export const IMPORT_FILE_ROW_PARSER = Symbol('IMPORT_FILE_ROW_PARSER');
