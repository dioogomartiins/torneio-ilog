import { flashError, flashSaved, flashBackup, showToast, openConfirm, renderAll } from './ui.js';
import { generateSchedule } from './algorithms.js';
import { pushStateToFirebase } from './firebase.js';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------
export const SNAPSHOT_VERSION = 5;
export const MAX_TEAMS = 32;
const DEFAULT_COLOR = '#2F7A4F';

// ---------------------------------------------------------------------------
// Tema (dark mode)
// ---------------------------------------------------------------------------
export let currentTheme = localStorage.getItem('torneio_theme') || 'light';
export function setCurrentTheme(t) { currentTheme = t; }

// ---------------------------------------------------------------------------
// Estrutura de dados por defeito
// ---------------------------------------------------------------------------
export function defaultConfig() {
  return {
    nome: 'Futebol ILOG',
    numEquipas: 8,
    numGrupos: 1,
    numVoltas: 2,
    pontosVitoria: 3,
    pontosEmpate: 1,
    pontosDerrota: 0,
    bonusGoleada: 1,
    golosGoleada: 3,
    mataMata: false,
    numPlayoffTeams: 4,
  };
}

export function ensureTeamsStructure(arr) {
  const out = (arr || []).slice(0, MAX_TEAMS).map((t, i) => {
    if (typeof t === 'object' && t !== null && t.name !== undefined) {
      const obj = { name: t.name, color: t.color || DEFAULT_COLOR };
      if (t.group !== undefined) obj.group = t.group;
      return obj;
    }
    return { name: (typeof t === 'string' ? t : `Equipa ${i + 1}`), color: DEFAULT_COLOR };
  });

  while (out.length < MAX_TEAMS) {
    out.push({ name: '', color: DEFAULT_COLOR });
  }

  return out;
}

export function defaultTeams() { return ensureTeamsStructure([]); }

export function defaultSquads() {
  const arr = [];
  for (let i = 0; i < MAX_TEAMS; i++) arr.push([]);
  return arr;
}

export function ensureSquadsLength(arr) {
  const out = (arr || []).map((s) => Array.isArray(s) ? s : []).slice(0, MAX_TEAMS);
  while (out.length < MAX_TEAMS) out.push([]);
  return out;
}

// ---------------------------------------------------------------------------
// Estado global da aplicação
// ---------------------------------------------------------------------------
export const state = {
  config: null,
  teams: null,
  squads: null,
  schedule: [],
  roundsMeta: [],
  scheduleTeamCount: 0,
  scheduleVoltas: 0,
  results: {},
  players: [],          // Base de dados global de jogadores
  jogosSingulares: [],  // Histórico de jogos singulares
};

// ---------------------------------------------------------------------------
// Camada de persistência (localStorage com fallback em memória)
// ---------------------------------------------------------------------------
const memoryFallback = {};
let storageWarned = false;
const noStorage = (typeof window.localStorage === 'undefined');
const STORAGE_PREFIX = 'torneio_ilog_';

export function warnNoStorage() {
  if (storageWarned) return;
  storageWarned = true;
  showToast('O teu navegador bloqueia a gravação — os dados não serão guardados.', 'error');
}

/** Nota: marcado como async para facilitar futura migração para IndexedDB sem quebrar a API. */
export async function storageGet(key) {
  if (noStorage) {
    warnNoStorage();
    return (key in memoryFallback) ? { value: memoryFallback[key] } : null;
  }
  try {
    const result = window.localStorage.getItem(STORAGE_PREFIX + key);
    return result !== null ? { value: result } : null;
  } catch (e) {
    return null;
  }
}

/** Nota: marcado como async para facilitar futura migração para IndexedDB sem quebrar a API. */
export async function storageSet(key, value) {
  if (noStorage) {
    warnNoStorage();
    memoryFallback[key] = value;
    return { value };
  }
  try {
    window.localStorage.setItem(STORAGE_PREFIX + key, value);
    return { value };
  } catch (e) {
    flashError();
    return null;
  }
}

// ---------------------------------------------------------------------------
// Snapshot — serialização / deserialização completa do estado
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Jogadores — helpers de normalização
// ---------------------------------------------------------------------------
export function defaultPlayerAttrs() {
  return { velocidade: 0, finalizacao: 0, passe: 0, drible: 0, defesa: 0, fisico: 0 };
}

export function normalizePlayer(p) {
  if (!p || typeof p !== 'object') return null;
  return {
    id: p.id || crypto.randomUUID(),
    nome: p.nome || '',
    teamIdx: (p.teamIdx !== undefined && p.teamIdx !== null) ? p.teamIdx : null,
    atributos: Object.assign(defaultPlayerAttrs(), p.atributos || {}),
  };
}

export function buildSnapshot() {
  return {
    version: SNAPSHOT_VERSION,
    exportedAt: new Date().toISOString(),
    config: JSON.parse(JSON.stringify(state.config)),
    teams: JSON.parse(JSON.stringify(state.teams)),
    squads: JSON.parse(JSON.stringify(state.squads)),
    schedule: state.schedule.slice(),
    roundsMeta: state.roundsMeta.slice(),
    scheduleTeamCount: state.scheduleTeamCount,
    scheduleVoltas: state.scheduleVoltas,
    results: JSON.parse(JSON.stringify(state.results)),
    players: JSON.parse(JSON.stringify(state.players)),
    jogosSingulares: JSON.parse(JSON.stringify(state.jogosSingulares)),
  };
}

export function validateSnapshot(s) {
  if (!s || typeof s !== 'object') return false;
  if (!s.config || !Array.isArray(s.teams) || !Array.isArray(s.schedule)) return false;
  if (!s.results || typeof s.results !== 'object') return false;
  return true;
}

export function applySnapshot(s) {
  state.config = Object.assign(defaultConfig(), s.config);
  state.teams = ensureTeamsStructure(s.teams);
  state.squads = ensureSquadsLength(s.squads);
  state.schedule = s.schedule || [];
  state.roundsMeta = s.roundsMeta || [];
  state.scheduleTeamCount = s.scheduleTeamCount || state.config.numEquipas;
  state.scheduleVoltas = s.scheduleVoltas || state.config.numVoltas;
  state.results = s.results || {};
  state.players = (s.players || []).map(normalizePlayer).filter(Boolean);
  state.jogosSingulares = s.jogosSingulares || [];
}

// ---------------------------------------------------------------------------
// Persistência por camada (config, calendário, resultados, backup)
// ---------------------------------------------------------------------------
export async function persistBackup() {
  const snap = buildSnapshot();
  await storageSet('backup', JSON.stringify(snap));
  flashBackup(snap.exportedAt);
  pushStateToFirebase(snap);
}

export async function persistConfigTeams() {
  await storageSet('config-teams', JSON.stringify({
    config: state.config,
    teams: state.teams,
    squads: state.squads,
  }));
  flashSaved();
  await persistBackup();
}

export async function persistSchedule() {
  await storageSet('schedule', JSON.stringify({
    schedule: state.schedule,
    roundsMeta: state.roundsMeta,
    scheduleTeamCount: state.scheduleTeamCount,
    scheduleVoltas: state.scheduleVoltas,
  }));
  flashSaved();
  await persistBackup();
}

export async function persistResults() {
  await storageSet('results', JSON.stringify(state.results));
  flashSaved();
  await persistBackup();
}

export async function persistPlayers() {
  await storageSet('players', JSON.stringify(state.players));
  flashSaved();
  await persistBackup();
}

export async function persistJogosSingulares() {
  await storageSet('jogos-singulares', JSON.stringify(state.jogosSingulares));
  flashSaved();
  await persistBackup();
}

// ---------------------------------------------------------------------------
// Geração de calendário e atribuição de grupos
// ---------------------------------------------------------------------------
export function applyGeneratedSchedule(numEquipas, numVoltas, randomizeGroups) {
  const nGrupos = state.config.numGrupos || 1;
  let indices = [];
  for (let i = 0; i < numEquipas; i++) indices.push(i);

  if (randomizeGroups) {
    // Fisher-Yates shuffle
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
  } else {
    const byGroup = {};
    for (let i = 0; i < numEquipas; i++) {
      let g = state.teams[i].group || 0;
      if (g >= nGrupos) g = nGrupos - 1;
      if (!byGroup[g]) byGroup[g] = [];
      byGroup[g].push(i);
    }
    indices = [];
    for (let g = 0; g < nGrupos; g++) {
      if (byGroup[g]) indices = indices.concat(byGroup[g]);
    }
  }

  const teamsPerGroup = Math.ceil(numEquipas / nGrupos);
  const groupsIndices = [];

  for (let g = 0; g < nGrupos; g++) {
    const chunk = indices.slice(g * teamsPerGroup, (g + 1) * teamsPerGroup);
    groupsIndices.push(chunk);
    chunk.forEach((idx) => {
      if (state.teams[idx]) state.teams[idx].group = g;
    });
  }

  const out = generateSchedule(groupsIndices, numVoltas);
  state.schedule = out.schedule;
  state.roundsMeta = out.roundsMeta;
  state.scheduleTeamCount = numEquipas;
  state.scheduleVoltas = numVoltas;
}

// ---------------------------------------------------------------------------
// Carregamento do estado a partir do localStorage
// ---------------------------------------------------------------------------
export async function loadState() {
  let ct = null;
  let sc = null;
  let rs = null;
  let bk = null;
  let pl = null;
  let js = null;

  try { const r = await storageGet('config-teams'); ct = r ? JSON.parse(r.value) : null; } catch { ct = null; }
  try { const r = await storageGet('schedule'); sc = r ? JSON.parse(r.value) : null; } catch { sc = null; }
  try { const r = await storageGet('results'); rs = r ? JSON.parse(r.value) : null; } catch { rs = null; }
  try { const r = await storageGet('backup'); bk = r ? JSON.parse(r.value) : null; } catch { bk = null; }
  try { const r = await storageGet('players'); pl = r ? JSON.parse(r.value) : null; } catch { pl = null; }
  try { const r = await storageGet('jogos-singulares'); js = r ? JSON.parse(r.value) : null; } catch { js = null; }

  const hasIndividualData = ct && ct.config && ct.teams;

  if (hasIndividualData) {
    state.config = Object.assign(defaultConfig(), ct.config);
    state.teams = ensureTeamsStructure(ct.teams);
    state.squads = ensureSquadsLength(ct.squads);

    if (sc && sc.schedule && sc.schedule.length) {
      state.schedule = sc.schedule;
      state.roundsMeta = sc.roundsMeta || [];
      state.scheduleTeamCount = sc.scheduleTeamCount || state.config.numEquipas;
      state.scheduleVoltas = sc.scheduleVoltas || state.config.numVoltas;
    } else {
      applyGeneratedSchedule(state.config.numEquipas, state.config.numVoltas, false);
    }

    state.results = rs || {};
    state.players = (pl || []).map(normalizePlayer).filter(Boolean);
    state.jogosSingulares = js || [];
  } else if (validateSnapshot(bk)) {
    applySnapshot(bk);
    await storageSet('config-teams', JSON.stringify({ config: state.config, teams: state.teams, squads: state.squads }));
    await storageSet('schedule', JSON.stringify({ schedule: state.schedule, roundsMeta: state.roundsMeta, scheduleTeamCount: state.scheduleTeamCount, scheduleVoltas: state.scheduleVoltas }));
    await storageSet('results', JSON.stringify(state.results));
    await storageSet('players', JSON.stringify(state.players));
    await storageSet('jogos-singulares', JSON.stringify(state.jogosSingulares));
    showToast('Estado restaurado a partir do backup automático.', 'ok');
    flashBackup(bk.exportedAt);
  } else {
    state.config = defaultConfig();
    state.teams = defaultTeams();
    state.squads = defaultSquads();
    state.players = [];
    state.jogosSingulares = [];
    applyGeneratedSchedule(state.config.numEquipas, state.config.numVoltas, false);
  }

  if (bk && bk.exportedAt) flashBackup(bk.exportedAt);
}

// ---------------------------------------------------------------------------
// Exportação / Importação JSON
// ---------------------------------------------------------------------------
export function exportJSON() {
  const snap = buildSnapshot();
  const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const safeName = (state.config.nome || 'torneio').replace(/[^a-z0-9_\-]/gi, '_').toLowerCase();
  const ts = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');

  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName}_${ts}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast('Torneio exportado com sucesso!', 'ok');
}

export function importJSON(file) {
  if (!file) return;
  const reader = new FileReader();

  reader.onload = (e) => {
    let snap;
    try {
      snap = JSON.parse(e.target.result);
    } catch {
      showToast('Ficheiro inválido.', 'error');
      return;
    }

    if (!validateSnapshot(snap)) {
      showToast('Estrutura inválida.', 'error');
      return;
    }

    openConfirm('Importar torneio', 'Isto vai substituir TODO o estado atual. Continuar?', async () => {
      applySnapshot(snap);
      await storageSet('config-teams', JSON.stringify({ config: state.config, teams: state.teams, squads: state.squads }));
      await storageSet('schedule', JSON.stringify({ schedule: state.schedule, roundsMeta: state.roundsMeta, scheduleTeamCount: state.scheduleTeamCount, scheduleVoltas: state.scheduleVoltas }));
      await storageSet('results', JSON.stringify(state.results));
      await persistBackup();
      renderAll();
      showToast('Torneio importado com sucesso!', 'ok');
    });
  };

  reader.readAsText(file);
}
