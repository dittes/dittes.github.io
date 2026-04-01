import {
  classifyColorNature,
  findMostContrastingColor,
  groupSimilarColors,
  isNearBlack,
  isNearWhite,
  parseColor,
  rgbaToHex,
} from '../utils/color.js';
import { confidenceFromScore, scoreAccentColor } from '../utils/score.js';

function toToken(group, label, confidence = 'Medium', source = 'heuristic') {
  return {
    hex: group.hex,
    label,
    confidence,
    weight: group.weight,
    source,
  };
}

export function summarizeColors(samples = [], extraSignals = {}) {
  const groups = groupSimilarColors(samples, 18);

  const result = {
    background: [],
    surface: [],
    text: [],
    accent: [],
    secondary: [],
    border: [],
    raw: groups.map((group) => ({
      hex: group.hex,
      weight: group.weight,
      nature: classifyColorNature(parseColor(group.hex)),
      sources: group.items.map((item) => item.source || item.role || 'sample'),
    })),
    notes: [],
  };

  const byRole = (roles) => groups.filter((group) => group.items.some((item) => roles.includes(item.role)));

  const backgroundGroup = byRole(['page-bg', 'section-bg', 'surface-bg']).find((group) => isNearWhite(parseColor(group.hex)))
    || groups.find((group) => isNearWhite(parseColor(group.hex)))
    || groups[0];

  if (backgroundGroup) {
    result.background.push(toToken(backgroundGroup, 'Background', 'High', 'visible computed backgrounds'));
  }

  const surfaceGroups = byRole(['surface-bg', 'card-bg']).filter((group) => group.hex !== backgroundGroup?.hex).slice(0, 2);
  surfaceGroups.forEach((group, index) => {
    result.surface.push(toToken(group, index === 0 ? 'Surface' : `Surface ${index + 1}`, 'Medium', 'visible surfaces'));
  });

  const textGroup = byRole(['text', 'body-text', 'heading-text']).find((group) => isNearBlack(parseColor(group.hex)))
    || groups.find((group) => isNearBlack(parseColor(group.hex)))
    || findMostContrastingColor(groups, backgroundGroup?.hex);

  if (textGroup) {
    result.text.push(toToken(textGroup, 'Text', 'High', 'visible text color'));
  }

  const accentCandidates = groups
    .map((group) => {
      const items = group.items;
      const roleBoost = items.some((item) => ['button-bg', 'link', 'active-nav', 'badge', 'focus'].includes(item.role));
      const score = Math.max(...items.map((item) => scoreAccentColor({ ...item, hex: group.hex, repeated: items.length > 1 })), roleBoost ? 0.4 : 0);
      return {
        group,
        score,
      };
    })
    .filter(({ group }) => ![backgroundGroup?.hex, textGroup?.hex].includes(group.hex))
    .sort((a, b) => b.score - a.score);

  if (extraSignals.themeColor) {
    const themeColor = rgbaToHex(parseColor(extraSignals.themeColor)) || extraSignals.themeColor;
    if (themeColor && !accentCandidates.some((entry) => entry.group.hex === themeColor)) {
      accentCandidates.unshift({
        group: { hex: themeColor, items: [{ role: 'theme-color', source: 'meta theme-color' }], weight: 12 },
        score: 0.58,
      });
    }
  }

  accentCandidates.slice(0, 2).forEach((entry, index) => {
    const confidence = confidenceFromScore(entry.score);
    const label = index === 0 ? 'Accent' : 'Secondary accent';
    if (index === 0) result.accent.push(toToken(entry.group, label, confidence, entry.group.items[0]?.source || 'interaction heuristic'));
    else result.secondary.push(toToken(entry.group, label, confidence, entry.group.items[0]?.source || 'interaction heuristic'));
  });

  const borderGroup = byRole(['border', 'divider']).find((group) => group.hex !== backgroundGroup?.hex)
    || groups.find((group) => {
      const color = parseColor(group.hex);
      return color && !isNearWhite(color) && !isNearBlack(color) && classifyColorNature(color).includes('neutral');
    });

  if (borderGroup) {
    result.border.push(toToken(borderGroup, 'Border / muted', 'Medium', 'visible borders'));
  }

  if (!result.accent.length && extraSignals.themeColor) {
    result.accent.push({
      hex: extraSignals.themeColor,
      label: 'Accent',
      confidence: 'Low',
      source: 'meta theme-color fallback',
    });
    result.notes.push('Accent color fell back to meta theme-color because strong interactive color signals were limited.');
  }

  return result;
}
