import {
  ALLOWED_EMAIL_TEMPLATE_VARIABLES,
  hasDisallowedHandlebarsVariable,
} from '../../modules/email-templates/presentation/dto/email-template-variables.validator';
import { buildSeedEmailTemplatePlans } from './seed-dataset';

describe('buildSeedEmailTemplatePlans', () => {
  const plans = buildSeedEmailTemplatePlans();

  it('names every template in Vietnamese', () => {
    for (const plan of plans) {
      expect(plan.name).toMatch(
        /[ăâđêôơưĂÂĐÊÔƠƯàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/,
      );
    }
  });

  it('only uses variables the create/update DTO would accept', () => {
    for (const plan of plans) {
      expect(hasDisallowedHandlebarsVariable(plan.subject)).toBe(false);
      expect(hasDisallowedHandlebarsVariable(plan.bodyHtml)).toBe(false);
    }
  });

  it('stays within the seven allowed variables', () => {
    expect(ALLOWED_EMAIL_TEMPLATE_VARIABLES).toHaveLength(7);
  });
});
