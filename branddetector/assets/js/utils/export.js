import { slugify } from './dom.js';

function firstHex(list) {
  return Array.isArray(list) && list.length ? list[0].hex || list[0].value || null : null;
}

export function buildExports(result) {
  const headingFont = result?.fonts?.heading?.family || result?.fonts?.heading?.stack || null;
  const bodyFont = result?.fonts?.body?.family || result?.fonts?.body?.stack || null;
  const uiFont = result?.fonts?.ui?.family || result?.fonts?.ui?.stack || null;
  const tokens = {
    'brand-bg': firstHex(result?.colors?.background),
    'brand-surface': firstHex(result?.colors?.surface),
    'brand-text': firstHex(result?.colors?.text),
    'brand-accent': firstHex(result?.colors?.accent),
    'brand-accent-2': firstHex(result?.colors?.secondary),
    'brand-border': firstHex(result?.colors?.border),
    'brand-heading-font': headingFont,
    'brand-body-font': bodyFont,
    'brand-ui-font': uiFont,
  };

  const css = Object.entries(tokens)
    .filter(([, value]) => value)
    .map(([key, value]) => `--${key}: ${value};`)
    .join('\n');

  const designTokens = {
    $schema: 'https://brand-identity-detector.local/design-tokens.schema.json',
    brand: {
      name: result?.page?.title || 'Unknown brand',
      mode: result?.mode,
      colors: {
        background: firstHex(result?.colors?.background),
        surface: firstHex(result?.colors?.surface),
        text: firstHex(result?.colors?.text),
        accent: firstHex(result?.colors?.accent),
        secondary: firstHex(result?.colors?.secondary),
        border: firstHex(result?.colors?.border),
      },
      fonts: {
        heading: headingFont,
        body: bodyFont,
        ui: uiFont,
        mono: result?.fonts?.mono?.family || result?.fonts?.mono?.stack || null,
      },
      signals: {
        favicon: result?.brandSignals?.favicon?.url || null,
        ogImage: result?.brandSignals?.ogImage?.url || null,
        themeColor: result?.brandSignals?.themeColor?.value || null,
        schemaLogo: result?.brandSignals?.schemaLogo?.url || null,
      },
    },
  };

  const summaryLines = [
    `Mode: ${result?.mode || 'unknown'}`,
    `Page: ${result?.page?.title || 'Unknown'}${result?.page?.url ? ` (${result.page.url})` : ''}`,
    `Logo: ${result?.logo?.selected?.source || 'Not confidently detected'} [${result?.logo?.confidence || 'Low'}]`,
    `Heading font: ${headingFont || 'Unknown'}`,
    `Body font: ${bodyFont || 'Unknown'}`,
    `Accent: ${firstHex(result?.colors?.accent) || 'Unknown'} [${result?.colors?.accent?.[0]?.confidence || 'Low'}]`,
    `Background: ${firstHex(result?.colors?.background) || 'Unknown'}`,
    `Theme color: ${result?.brandSignals?.themeColor?.value || 'None detected'}`,
    `Blocked steps: ${(result?.blocked || []).length}`,
  ];

  const filenameBase = slugify(result?.page?.title || result?.mode || 'brand-identity') || 'brand-identity';

  return {
    json: JSON.stringify(result, null, 2),
    css,
    designTokens: JSON.stringify(designTokens, null, 2),
    summary: summaryLines.join('\n'),
    filenames: {
      json: `${filenameBase}.brand-identity.json`,
      css: `${filenameBase}.tokens.css`,
      tokens: `${filenameBase}.design-tokens.json`,
    },
  };
}
