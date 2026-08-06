import { HandlebarsTemplateCompiler } from './handlebars-template-compiler.adapter';

describe('HandlebarsTemplateCompiler', () => {
  it('substitutes {{variable}} placeholders with the given data', () => {
    const compiler = new HandlebarsTemplateCompiler();

    const result = compiler.compile('Hello {{name}}', { name: 'World' });

    expect(result).toBe('Hello World');
  });
});
