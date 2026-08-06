export interface ITemplateCompiler {
  compile(template: string, data: Record<string, unknown>): string;
}

export const TEMPLATE_COMPILER = Symbol('TEMPLATE_COMPILER');
