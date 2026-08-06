import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

/**
 * Closed list of Handlebars variables allowed in email template subject/body.
 * Must stay in sync with EmailTemplateRenderData
 * (application/render-email-template.usecase.ts).
 */
export const ALLOWED_EMAIL_TEMPLATE_VARIABLES = [
  'customerName',
  'invoiceNumber',
  'originalAmount',
  'remainingAmount',
  'dueDate',
  'daysOverdue',
  'organizationName',
] as const;

const HANDLEBARS_TOKEN_PATTERN = /\{\{\{?\s*([^{}]*?)\s*\}?\}\}/g;

export function hasDisallowedHandlebarsVariable(value: string): boolean {
  if (value.includes('{{{')) {
    return true;
  }

  const allowed = new Set<string>(ALLOWED_EMAIL_TEMPLATE_VARIABLES);
  for (const match of value.matchAll(HANDLEBARS_TOKEN_PATTERN)) {
    const name = match[1].trim();
    if (!allowed.has(name)) {
      return true;
    }
  }

  return false;
}

export function IsAllowedEmailTemplateVariables(
  validationOptions?: ValidationOptions,
) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isAllowedEmailTemplateVariables',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string') {
            return true;
          }
          return !hasDisallowedHandlebarsVariable(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} chỉ được sử dụng các biến: ${ALLOWED_EMAIL_TEMPLATE_VARIABLES.join(', ')}, và không được dùng cú pháp {{{ }}}`;
        },
      },
    });
  };
}
