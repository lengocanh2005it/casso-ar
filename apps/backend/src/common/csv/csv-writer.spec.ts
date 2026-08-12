import { csvEscape, toCsv } from './csv-writer';

describe('csv-writer', () => {
  describe('csvEscape', () => {
    it.each(['=SUM(A1:A9)', '+cmd', '-1+1', '@cmd'])(
      'neutralizes formula injection for %s',
      (value) => {
        expect(csvEscape(value)).toBe(`'${value}`);
      },
    );

    it('escapes quotes and wraps fields containing commas, quotes or newlines', () => {
      expect(csvEscape('plain')).toBe('plain');
      expect(csvEscape('has,comma')).toBe('"has,comma"');
      expect(csvEscape('has"quote')).toBe('"has""quote"');
      expect(csvEscape('has\nnewline')).toBe('"has\nnewline"');
    });

    it('neutralizes formulas before quoting', () => {
      expect(csvEscape('=SUM(A1)')).toBe("'=SUM(A1)");
      expect(csvEscape('a,=b')).toBe('"a,=b"');
    });
  });

  describe('toCsv', () => {
    it('serializes rows with a header and CRLF line endings', () => {
      const csv = toCsv(
        ['STT', 'Mã hóa đơn', 'Số tiền'],
        [
          ['1', 'INV-001', '1000000'],
          ['2', 'INV-002', '500000'],
        ],
      );

      expect(csv).toBe(
        'STT,Mã hóa đơn,Số tiền\r\n1,INV-001,1000000\r\n2,INV-002,500000',
      );
    });

    it('applies escaping to every cell', () => {
      const csv = toCsv(['A', 'B'], [['=1', 'x,y']]);

      expect(csv).toBe('A,B\r\n\'=1,"x,y"');
    });
  });
});
