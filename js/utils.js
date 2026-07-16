import { state } from './state.js';

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function numOr(v, fallback) {
  const n = parseFloat(v);
  return isFinite(n) ? n : fallback;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

export function fmtTimestamp(iso) {
  try {
    const d = new Date(iso);
    const date = d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' });
    const time = d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
    return `${date} ${time}`;
  } catch (e) {
    return iso;
  }
}

export function getTeamName(idx) {
  if (typeof idx === 'string') return idx;
  const t = state.teams[idx];
  return t && t.name ? t.name : `Equipa ${idx + 1}`;
}

export function getTeamDisplay(idx) {
  if (typeof idx === 'string') {
    return `<span style="color:var(--ink-faint); font-style:italic; font-size:12px;">${escapeHtml(idx)}</span>`;
  }
  const t = state.teams[idx] || { name: `Equipa ${idx + 1}`, color: '#2F7A4F' };
  const name = escapeHtml(t.name || `Equipa ${idx + 1}`);
  const colorBadge = `<span style="display:inline-block; width:10px; height:10px; border-radius:50%; background-color:${escapeHtml(t.color)}; margin-right:6px; box-shadow:0 0 2px rgba(0,0,0,0.3);"></span>`;
  return `<span style="display:inline-flex; align-items:center; white-space:nowrap;">${colorBadge}${name}</span>`;
}

export function getActiveTeamNames() {
  const arr = [];
  for (let i = 0; i < state.scheduleTeamCount; i++) {
    arr.push(getTeamName(i));
  }
  return arr;
}
