import { confidenceFromScore, scoreLogoCandidate } from '../utils/score.js';

export function rankLogoCandidates(candidates = []) {
  const ranked = candidates
    .map((candidate) => {
      const scored = scoreLogoCandidate(candidate);
      return {
        ...candidate,
        score: candidate.score ?? scored.score,
        reasons: [...new Set([...(candidate.reasons || []), ...scored.reasons])],
        confidence: candidate.confidence || confidenceFromScore(candidate.score ?? scored.score),
      };
    })
    .sort((a, b) => b.score - a.score);

  return ranked;
}

export function summarizeLogo(candidates = [], fallbackNotes = []) {
  const ranked = rankLogoCandidates(candidates);
  const selected = ranked[0] || null;
  return {
    candidates: ranked.slice(0, 3),
    selected,
    confidence: selected?.confidence || 'Low',
    notes: fallbackNotes,
  };
}
