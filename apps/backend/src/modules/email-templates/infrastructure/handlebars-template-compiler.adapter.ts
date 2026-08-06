import { Injectable } from '@nestjs/common';
import * as Handlebars from 'handlebars';
import type { ITemplateCompiler } from '../application/template-compiler.port';

@Injectable()
export class HandlebarsTemplateCompiler implements ITemplateCompiler {
  compile(template: string, data: Record<string, unknown>): string {
    return Handlebars.compile(template)(data);
  }
}
