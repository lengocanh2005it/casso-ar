# `@axe-core/playwright` for viewport contrast checks

Date: 2026-10-07
Scope: Suitability for the agreed WCAG AA contrast thresholds in issue #457's Playwright browser suite.

## Finding

`@axe-core/playwright` is a good automated check for WCAG 1.4.3 text contrast, but it cannot enforce the full agreed bar by itself. Its `color-contrast` rule checks normal text at 4.5:1 and large text at 3:1; it does not cover WCAG 1.4.11's 3:1 UI-component and meaningful-graphic contrast. SVG chart text is a known coverage gap, and canvas-rendered labels are outside DOM text scanning. Keep axe as the general text/accessibility scan, and cover the chart/UI non-text contrast with separate checks or review.

## Package and API

As of this note, npm's `latest` tag is **4.13.0**. The package depends on `axe-core ~4.13.0`; the published wrapper is **47,180 bytes (~47 KB) unpacked**, and `axe-core@4.13.0` is **3,113,323 bytes (~3.11 MB) unpacked**. The registry shows prerelease builds published through 2026-10-06, so the package is maintained, though 4.13.0 remains the latest stable release. ([npm versions](https://www.npmjs.com/package/%40axe-core/playwright?activeTab=versions), [npm package metadata](https://registry.npmjs.org/%40axe-core%2fplaywright), [axe-core 4.13.0 metadata](https://registry.npmjs.org/axe-core/4.13.0))

The supported pattern is `new AxeBuilder({ page }).analyze()`, then assert on `results.violations`; `.withTags()`, `.include()`, and `.exclude()` are available for scope. Playwright's guide documents a default-import form and WCAG-tagged example. `analyze()` scans the page's current state, so reveal menus/dialogs before scanning them. ([Playwright accessibility testing](https://playwright.dev/docs/accessibility-testing), [Deque package README](https://github.com/dequelabs/axe-core-npm/blob/develop/packages/playwright/README.md))

## Coverage limits

- **Text:** Deque's `color-contrast` rule maps to WCAG 1.4.3 and specifies 4.5:1 for small text / 3:1 for large text. The rule can return *incomplete* where contrast cannot be determined (for example, text over images/gradients or overlap), which needs review. ([Deque rule](https://dequeuniversity.com/rules/axe/4.13/color-contrast?application=axeAPI))
- **UI borders and chart graphics:** WCAG 1.4.11 requires 3:1 for relevant UI component states and graphical objects. Axe's rule catalogue has `color-contrast` for 1.4.3 but no rule tagged for 1.4.11; an earlier proposed component-border contrast rule is parked. Therefore an axe pass does not prove this 3:1 requirement. ([W3C SC 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html), [axe rule catalogue](https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md), [parked rule proposal](https://github.com/dequelabs/axe-core/issues/854))
- **SVG labels:** An upstream axe-core issue remains open for color contrast support for SVG `<text>`; it reports that SVG is treated as an image by the contrast rule. Treat SVG chart labels as uncovered unless the app's exact markup is independently verified. ([axe-core issue #1819](https://github.com/dequelabs/axe-core/issues/1819))
- **Canvas labels:** The rule targets text elements and does not report images of text; the HTML canvas renders a bitmap. Thus canvas-drawn labels have no DOM text for this rule to measure (inference from the rule scope and canvas model). Deque's checklist recommends considering SVG when a graphic needs text. ([Deque rule](https://dequeuniversity.com/rules/axe/4.13/color-contrast?application=axeAPI), [HTML canvas standard](https://html.spec.whatwg.org/multipage/canvas.html), [Deque canvas/SVG checklist](https://media.dequeuniversity.com/courses/generic/testing-basic-method-and-tools/2.0/en/docs/module-images-checklist.pdf))

## Recommendation

Add `@axe-core/playwright` as a test-only dependency for automated page scans and the 4.5:1 / 3:1 text thresholds. Do not present its green result as enforcement of UI/chart 3:1 contrast; that part needs app-specific assertions or manual visual verification. Playwright also cautions that automated accessibility scans detect only some issues and should be paired with manual assessment. ([Playwright accessibility testing](https://playwright.dev/docs/accessibility-testing))
