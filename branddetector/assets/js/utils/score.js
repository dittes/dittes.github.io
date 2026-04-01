import { classifyColorNature, parseColor, rgbToHsl } from './color.js';

export function confidenceFromScore(score) {
  if (score >= 0.74) return 'High';
  if (score >= 0.45) return 'Medium';
  if (score > 0) return 'Low';
  return 'Blocked';
}

export function cssConfidenceClass(confidence = '') {
  const key = String(confidence).toLowerCase();
  if (key === 'high') return 'confidence-high';
  if (key === 'medium') return 'confidence-medium';
  if (key === 'blocked') return 'badge-blocked';
  return 'confidence-low';
}

export function scoreLogoCandidate(candidate) {
  let score = 0;
  const reasons = [];

  if (candidate.visible) {
    score += 0.16;
    reasons.push('visible');
  }
  if (candidate.inHomeLink) {
    score += 0.18;
    reasons.push('inside home link');
  }
  if (candidate.semanticScore) {
    score += Math.min(candidate.semanticScore, 0.24);
    reasons.push('semantic logo hints');
  }
  if (candidate.isVector) {
    score += 0.12;
    reasons.push('vector or inline SVG');
  }
  if (candidate.topLeftScore) {
    score += Math.min(candidate.topLeftScore, 0.16);
    reasons.push('top-left placement');
  }
  if (candidate.sizeScore) {
    score += Math.min(candidate.sizeScore, 0.12);
    reasons.push('reasonable size');
  }
  if (candidate.hiddenPenalty) {
    score -= candidate.hiddenPenalty;
  }
  if (candidate.repeatPenalty) {
    score -= candidate.repeatPenalty;
  }

  return {
    score: Math.max(0, Math.min(1, score)),
    reasons,
  };
}

export function scoreFontSample(sample) {
  let score = 0;
  if (sample.visible) score += 0.15;
  if (sample.role === 'heading') score += 0.24;
  if (sample.role === 'body') score += 0.18;
  if (sample.role === 'ui' || sample.role === 'nav') score += 0.2;
  score += Math.min((sample.count || 0) / 20, 0.2);
  score += Math.min((sample.fontSize || 0) / 80, 0.14);
  return Math.max(0, Math.min(1, score));
}

export function scoreAccentColor(sample) {
  const color = parseColor(sample.hex || sample.value || sample.color);
  if (!color) return 0;
  const hsl = rgbToHsl(color);
  let score = 0;
  if (sample.role === 'button-bg') score += 0.26;
  if (sample.role === 'link') score += 0.16;
  if (sample.role === 'badge' || sample.role === 'active-nav') score += 0.12;
  if (sample.role === 'focus') score += 0.08;
  if (sample.repeated) score += 0.12;
  if (sample.weight) score += Math.min(sample.weight / 50, 0.16);
  if (classifyColorNature(color) === 'accent-like') score += 0.16;
  if (hsl.s < 0.12) score -= 0.16;
  if (hsl.l > 0.9 || hsl.l < 0.08) score -= 0.12;
  return Math.max(0, Math.min(1, score));
}

export function combineConfidence(items = []) {
  if (!items.length) return 'Low';
  const map = { High: 3, Medium: 2, Low: 1, Blocked: 0 };
  const average = items.reduce((sum, item) => sum + (map[item] ?? 0), 0) / items.length;
  if (average >= 2.5) return 'High';
  if (average >= 1.5) return 'Medium';
  if (average >= 0.5) return 'Low';
  return 'Blocked';
}
