import { resolveRelativeUrl, safeJsonParse } from '../utils/dom.js';

export function extractMetaContent(doc, selector) {
  return doc.querySelector(selector)?.getAttribute('content')?.trim() || null;
}

export function extractJsonLd(doc) {
  return Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))
    .flatMap((script) => {
      const parsed = safeJsonParse(script.textContent, null);
      if (!parsed) return [];
      return Array.isArray(parsed) ? parsed : [parsed];
    })
    .filter(Boolean);
}

function visitSchemaNode(node, matches) {
  if (!node || typeof node !== 'object') return;
  const type = Array.isArray(node['@type']) ? node['@type'].join(',') : node['@type'];
  if (/organization|brand|corporation|webpage|website/i.test(type || '')) {
    if (node.logo) matches.push(node.logo);
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((item) => visitSchemaNode(item, matches));
    else if (value && typeof value === 'object') visitSchemaNode(value, matches);
  }
}

export function extractBrandSignalsFromDocument(doc, baseUrl) {
  const themeColor = extractMetaContent(doc, 'meta[name="theme-color"]');
  const ogImage = extractMetaContent(doc, 'meta[property="og:image"], meta[name="og:image"]');
  const title = doc.title || extractMetaContent(doc, 'meta[property="og:title"]') || null;

  const iconLinks = Array.from(doc.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="mask-icon"]'))
    .map((link) => ({
      rel: link.getAttribute('rel'),
      sizes: link.getAttribute('sizes') || null,
      type: link.getAttribute('type') || null,
      url: resolveRelativeUrl(link.getAttribute('href'), baseUrl),
      source: 'link rel icon',
    }))
    .filter((item) => item.url);

  const manifestHref = doc.querySelector('link[rel="manifest"]')?.getAttribute('href') || null;
  const manifestUrl = resolveRelativeUrl(manifestHref, baseUrl);

  const jsonLdMatches = [];
  extractJsonLd(doc).forEach((node) => visitSchemaNode(node, jsonLdMatches));
  const schemaLogoRaw = jsonLdMatches[0] || null;
  const schemaLogo = typeof schemaLogoRaw === 'string'
    ? { url: resolveRelativeUrl(schemaLogoRaw, baseUrl), source: 'schema.org logo' }
    : schemaLogoRaw?.url
      ? { url: resolveRelativeUrl(schemaLogoRaw.url, baseUrl), source: 'schema.org logo' }
      : null;

  const obviousLogo = Array.from(doc.querySelectorAll('img, svg')).find((node) => {
    const hint = [
      node.getAttribute('alt'),
      node.getAttribute('title'),
      node.getAttribute('aria-label'),
      node.getAttribute('class'),
      node.getAttribute('id'),
    ]
      .filter(Boolean)
      .join(' ');
    return /logo|brand|mark/i.test(hint);
  });

  return {
    title,
    themeColor: themeColor ? { value: themeColor, source: 'meta theme-color', confidence: 'High' } : null,
    favicon: iconLinks[0] || null,
    icons: iconLinks,
    ogImage: ogImage ? { url: resolveRelativeUrl(ogImage, baseUrl), source: 'Open Graph image', confidence: 'Medium' } : null,
    manifestUrl,
    manifestIcons: [],
    schemaLogo,
    obviousLogo: obviousLogo
      ? {
          selector: obviousLogo.tagName.toLowerCase(),
          source: 'HTML logo hint',
          url: obviousLogo.tagName.toLowerCase() === 'img' ? resolveRelativeUrl(obviousLogo.getAttribute('src'), baseUrl) : null,
        }
      : null,
    cssVariables: [],
  };
}
