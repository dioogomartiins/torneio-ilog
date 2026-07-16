import { state } from './state.js';
import { getTeamName, getTeamDisplay, escapeHtml, fmtTimestamp, clamp } from './utils.js';
import { computeStandings, GAME_STATUS } from './algorithms.js';
import { onStatusBtnClick, onScoreBtnClick, onResultCommit, onTeamPropChange, onSquadListClick } from './main.js';

// ---------------------------------------------------------------------------
// Estado local do módulo UI (não exportado — privado)
// ---------------------------------------------------------------------------
export var confirmCallback = null;
let flashSavedTimer = null;

// ---------------------------------------------------------------------------
// Cache de elementos DOM
// ---------------------------------------------------------------------------
export const dom = {};

export function cacheDom() {
  [
    'tournamentTitle', 'savePill', 'backupPill', 'marqueeTicker',
    'btnGerarCalendario', 'btnNovoTorneio', 'btnAtualizar', 'btnDarkMode', 'btnExportar', 'btnImportar', 'inputImportar',
    'btnMobileMenu', 'tabs',
    'btnAdicionarVolta', 'btnGerarEliminatorias', 'calendarActions',
    'dashboardPodium', 'dashboardStandings', 'dashboardStats', 'dashboardScorers',
    'cfgNome', 'cfgNumEquipas', 'cfgNumGrupos', 'cfgNumVoltas', 'cfgVitoria', 'cfgEmpate', 'cfgDerrota', 'cfgBonus', 'cfgGoleada', 'scheduleHint',
    'cfgMataMata', 'cfgNumPlayoffTeams',
    'teamsList', 'squadTeamSelect', 'squadPlayerNum', 'squadPlayerName', 'btnAddPlayer', 'squadList',
    'calendarList', 'resultsList', 'standingsWrapper', 'statsGrid',
    'modalOverlay', 'modalTitle', 'modalBody', 'modalCancel', 'modalConfirm', 'toastRoot',
  ].forEach((id) => { dom[id] = document.getElementById(id); });

  dom.panels = Array.from(document.querySelectorAll('.panel'));
}

// ---------------------------------------------------------------------------
// Render de topo — redesenha toda a UI
// ---------------------------------------------------------------------------
export function renderAll() {
  populateConfigForm();
  renderTeams();
  renderSquadsDropdown();
  renderCalendar();
  renderResults();
  refreshComputed();
}

export function refreshComputed() {
  const summary = computeStatsSummary();
  renderStandingsWrapper(summary.groupsData);
  renderStatsGrid(summary);
  renderDashboard(summary);
  updateTicker(summary);
  renderScheduleHint();

  // Esconde "Adicionar Volta Extra" quando o torneio usa grupos (apenas Liga Única suportada)
  if (dom.btnAdicionarVolta) {
    const isLeague = (state.config.numGrupos || 1) === 1;
    dom.btnAdicionarVolta.style.display = isLeague ? '' : 'none';
  }

  if (state.config.mataMata && dom.btnGerarEliminatorias) {
    let leagueTotal = 0;
    let leaguePlayed = 0;
    let hasPlayoffs = false;

    state.schedule.forEach((g, gi) => {
      if (g.isPlayoff) { hasPlayoffs = true; return; }
      leagueTotal++;
      const res = state.results[gi];
      if (res && typeof res === 'object' && res.status === GAME_STATUS.TERMINADO) leaguePlayed++;
    });

    const leagueFinished = leagueTotal > 0 && leagueTotal === leaguePlayed;
    dom.btnGerarEliminatorias.style.display = (leagueFinished && !hasPlayoffs) ? 'inline-flex' : 'none';
  }
}


// ---------------------------------------------------------------------------
// Formulário de configuração
// ---------------------------------------------------------------------------
export function populateConfigForm() {
  dom.cfgNome.value = state.config.nome;
  dom.cfgNumEquipas.value = state.config.numEquipas;
  dom.cfgNumGrupos.value = state.config.numGrupos || 1;
  dom.cfgNumVoltas.value = state.config.numVoltas;
  dom.cfgVitoria.value = state.config.pontosVitoria;
  dom.cfgEmpate.value = state.config.pontosEmpate;
  dom.cfgDerrota.value = state.config.pontosDerrota;
  dom.cfgBonus.value = state.config.bonusGoleada;
  dom.cfgGoleada.value = state.config.golosGoleada;
  dom.cfgMataMata.checked = state.config.mataMata || false;
  dom.cfgNumPlayoffTeams.value = state.config.numPlayoffTeams || 4;
}

export function renderScheduleHint() {
  const confN = clamp(parseInt(dom.cfgNumEquipas.value, 10) || state.config.numEquipas, 2, 32);
  const confV = clamp(parseInt(dom.cfgNumVoltas.value, 10) || state.config.numVoltas, 1, 20);
  let live = `Calendário atual: <strong>${state.scheduleTeamCount} equipas / ${state.scheduleVoltas} volta(s)</strong> · ${state.schedule.length} jogos.`;

  if (confN !== state.scheduleTeamCount || confV !== state.scheduleVoltas) {
    live += ` Configurado agora: ${confN} equipas / ${confV} volta(s) — clica em 🔄 Gerar Calendário para aplicar.`;
  }

  dom.scheduleHint.innerHTML = live;
}

// ---------------------------------------------------------------------------
// Render — equipas
// ---------------------------------------------------------------------------
export function renderTeams() {
  const html = [];
  for (let i = 0; i < 32; i++) {
    const active = i < state.scheduleTeamCount;
    const t = state.teams[i] || { name: '', color: '#2F7A4F' };
    const groupTag = (active && state.config.numGrupos > 1 && t.group !== undefined)
      ? `<span class="team-tag" style="background:var(--pitch-800); color:#fff; border:none; margin-left: 8px;">Grupo ${String.fromCharCode(65 + t.group)}</span>`
      : '';

    html.push(
      `<div class="team-row${active ? '' : ' team-row-inactive'}">` +
      `<span class="team-num">${i + 1}</span>` +
      `<input type="color" class="team-color-picker team-prop" data-prop="color" data-idx="${i}" value="${escapeHtml(t.color)}" title="Cor da Equipa">` +
      `<input type="text" class="input team-prop" data-prop="name" data-idx="${i}" value="${escapeHtml(t.name)}" placeholder="Equipa ${i + 1}">` +
      groupTag +
      (active ? '' : '<span class="team-tag">fora do calendário atual</span>') +
      '</div>'
    );
  }

  dom.teamsList.innerHTML = html.join('');

  Array.from(dom.teamsList.querySelectorAll('.team-prop')).forEach((inp) => {
    inp.addEventListener('blur', onTeamPropChange);
    inp.addEventListener('change', (e) => { if (e.target.type === 'color') onTeamPropChange(e); });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
  });
}

// ---------------------------------------------------------------------------
// Render — plantéis
// ---------------------------------------------------------------------------
export function renderSquadsDropdown() {
  const sel = dom.squadTeamSelect.value;
  const html = [];
  for (let i = 0; i < state.scheduleTeamCount; i++) {
    html.push(`<option value="${i}">${escapeHtml(getTeamName(i))}</option>`);
  }
  dom.squadTeamSelect.innerHTML = html.join('');

  if (sel && dom.squadTeamSelect.querySelector(`option[value="${sel}"]`)) {
    dom.squadTeamSelect.value = sel;
  }

  renderSquadList();
}

export function renderSquadList() {
  const tIdx = dom.squadTeamSelect.value;
  if (!tIdx) {
    dom.squadList.innerHTML = '<p class="empty">Nenhuma equipa selecionada.</p>';
    return;
  }

  const squad = state.squads[tIdx] || [];
  if (!squad.length) {
    dom.squadList.innerHTML = '<p class="empty" style="padding-top:20px;">Sem jogadores. Adiciona o primeiro acima!</p>';
    return;
  }

  const sortedSquad = squad.slice().sort((a, b) => a.num - b.num);
  const html = sortedSquad.map((p) =>
    `<div class="player-row">` +
    `<div class="player-info"><span class="player-num">${p.num}</span><span style="font-weight:600;">${escapeHtml(p.name)}</span></div>` +
    `<div style="display:flex; gap:6px;">` +
    `<button class="btn btn-ghost player-stats-btn" data-idx="${tIdx}" data-pid="${p.id}" style="color:var(--pitch-800); background:var(--paper); border:1px solid var(--line); padding:4px 8px; font-size:12px;">📊 Ficha</button>` +
    `<button class="player-del" data-idx="${tIdx}" data-pid="${p.id}" title="Remover jogador">×</button>` +
    `</div></div>`
  ).join('');

  dom.squadList.innerHTML = `<div style="margin-top:20px;">${html}</div>`;
}

// ---------------------------------------------------------------------------
// Render — calendário
// ---------------------------------------------------------------------------
export function getStatusBadge(status, gi) {
  const labels = {
    [GAME_STATUS.AGENDADO]: '📅 Agendado',
    [GAME_STATUS.DECORRER]: '⏳ A Decorrer',
    [GAME_STATUS.TERMINADO]: '✅ Terminado',
  };
  const lbl = labels[status] || labels[GAME_STATUS.AGENDADO];
  return `<button class="status-badge status-${status}" data-gi="${gi}" title="Clique para mudar estado">${lbl}</button>`;
}

export function renderCalendar() {
  const hasSchedule = state.schedule.length > 0;
  dom.calendarActions.style.display = hasSchedule ? 'block' : 'none';

  if (!hasSchedule) {
    dom.calendarList.innerHTML = '<p class="empty">Ainda não há calendário. Vai a Configuração e clica em 🔄 Gerar Calendário.</p>';
    return;
  }

  const byRound = {};
  state.schedule.forEach((g, gi) => {
    if (!byRound[g.jornada]) byRound[g.jornada] = [];
    byRound[g.jornada].push({ g, gi });
  });

  const byeMap = {};
  state.roundsMeta.forEach((r) => {
    if (r.bye !== null && r.bye !== undefined) byeMap[r.jornada] = r.bye;
  });

  const parts = [];
  state.roundsMeta.forEach((rm) => {
    const j = rm.jornada;
    const games = byRound[j] || [];
    parts.push(`<div class="round-card"><div class="round-head">Jornada ${j}</div><div class="round-games">`);

    games.forEach(({ g, gi }) => {
      const val = state.results[gi];
      const status = val && val.status ? val.status : GAME_STATUS.AGENDADO;
      parts.push(
        `<div class="fixture"><span class="fx-home">${getTeamDisplay(g.home)}</span>` +
        `<span class="fx-vs">${getStatusBadge(status, gi)} VS</span>` +
        `<span class="fx-away">${getTeamDisplay(g.away)}</span></div>`
      );
    });

    if (byeMap[j] !== undefined) {
      parts.push(`<div class="fixture fixture-bye">💤 ${getTeamDisplay(byeMap[j])} — folga esta jornada</div>`);
    }

    parts.push('</div></div>');
  });

  dom.calendarList.innerHTML = parts.join('');

  Array.from(dom.calendarList.querySelectorAll('.status-badge')).forEach((btn) => {
    btn.addEventListener('click', onStatusBtnClick);
  });
}

// ---------------------------------------------------------------------------
// Render — resultados
// ---------------------------------------------------------------------------
export function renderResults() {
  if (!state.schedule.length) {
    dom.resultsList.innerHTML = '<p class="empty">Sem jogos agendados.</p>';
    return;
  }

  const byRound = {};
  state.schedule.forEach((g, gi) => {
    if (!byRound[g.jornada]) byRound[g.jornada] = [];
    byRound[g.jornada].push({ g, gi });
  });

  const parts = [];

  state.roundsMeta.forEach((rm) => {
    const j = rm.jornada;
    const games = byRound[j] || [];
    if (!games.length) return;

    parts.push(`<div class="round-card"><div class="round-head">Jornada ${j}</div><div class="round-games">`);

    games.forEach(({ g, gi }) => {
      const val = state.results[gi];
      let vHome = '', vAway = '';
      let pHome = '', pAway = '';
      let status = GAME_STATUS.AGENDADO;

      if (val) {
        status = val.status || GAME_STATUS.AGENDADO;
        const scoreStr = typeof val === 'object' ? val.score : String(val);
        const m = /^(\d+)-(\d+)$/.exec(scoreStr);
        if (m) { vHome = m[1]; vAway = m[2]; }

        if (val.penalties) {
          const mp = /^(\d+)-(\d+)$/.exec(val.penalties);
          if (mp) { pHome = mp[1]; pAway = mp[2]; }
        }
      }

      const isTie = vHome !== '' && vAway !== '' && vHome === vAway;
      const isTerminado = status === GAME_STATUS.TERMINADO;
      const isPlayoff = g.isPlayoff;

      let penaltiesHtml = '';
      if (isTerminado && isTie && isPlayoff) {
        penaltiesHtml =
          `<div class="penalties-split">` +
          `<span class="pen-label">Penáltis</span>` +
          `<input type="number" class="input pen-box" data-gi="${gi}" data-side="home" value="${escapeHtml(pHome)}" min="0" max="99" inputmode="numeric">` +
          `<span class="res-sep">-</span>` +
          `<input type="number" class="input pen-box" data-gi="${gi}" data-side="away" value="${escapeHtml(pAway)}" min="0" max="99" inputmode="numeric">` +
          `</div>`;
      }

      parts.push(
        `<div class="fixture fixture-input">` +
        `<span class="fx-home">${getTeamDisplay(g.home)}</span>` +
        `<div class="result-split">` +
        `<button class="score-btn" data-gi="${gi}" data-side="home" data-action="sub">-</button>` +
        `<input type="number" class="input res-box" data-gi="${gi}" data-side="home" value="${escapeHtml(vHome)}" min="0" max="99" inputmode="numeric">` +
        `<button class="score-btn" data-gi="${gi}" data-side="home" data-action="add">+</button>` +
        `<span class="res-sep">-</span>` +
        `<button class="score-btn" data-gi="${gi}" data-side="away" data-action="sub">-</button>` +
        `<input type="number" class="input res-box" data-gi="${gi}" data-side="away" value="${escapeHtml(vAway)}" min="0" max="99" inputmode="numeric">` +
        `<button class="score-btn" data-gi="${gi}" data-side="away" data-action="add">+</button>` +
        `</div>` +
        `<span class="fx-away">${getTeamDisplay(g.away)}</span>` +
        penaltiesHtml +
        `<div style="grid-column: 1 / span 3; text-align: center; margin-top: 10px;">${getStatusBadge(status, gi)}</div>` +
        `</div>`
      );
    });

    parts.push('</div></div>');
  });

  dom.resultsList.innerHTML = parts.join('');

  Array.from(dom.resultsList.querySelectorAll('.res-box, .pen-box')).forEach((inp) => {
    inp.addEventListener('blur', onResultCommit);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
  });

  Array.from(dom.resultsList.querySelectorAll('.score-btn')).forEach((btn) => {
    btn.addEventListener('click', onScoreBtnClick);
  });

  Array.from(dom.resultsList.querySelectorAll('.status-badge')).forEach((btn) => {
    btn.addEventListener('click', onStatusBtnClick);
  });
}

// ---------------------------------------------------------------------------
// Render — classificação
// ---------------------------------------------------------------------------
export function renderStandingsWrapper(groupsData) {
  if (!groupsData || !groupsData.length || !groupsData[0].standings.length) {
    dom.standingsWrapper.innerHTML = '<table class="standings-table"><tr><td colspan="10" class="empty">Sem equipas configuradas.</td></tr></table>';
    return;
  }

  const html = groupsData.map((group) => {
    const rows = group.standings.map((s, i) => {
      const cls = i === 0 ? 'pos-gold' : i === 1 ? 'pos-silver' : i === 2 ? 'pos-bronze' : '';
      const dgTxt = (s.DG > 0 ? '+' : '') + s.DG;
      return (
        `<tr class="${cls}">` +
        `<td><span class="pos-badge">${i + 1}</span></td>` +
        `<td class="team-cell">${getTeamDisplay(s.idx)}</td>` +
        `<td class="num">${s.J}</td><td class="num">${s.V}</td><td class="num">${s.E}</td><td class="num">${s.D}</td>` +
        `<td class="num">${s.GM}</td><td class="num">${s.GS}</td><td class="num">${dgTxt}</td>` +
        `<td class="num pts-cell">${s.Pts}</td>` +
        `</tr>`
      );
    });

    const titleHtml = groupsData.length > 1
      ? `<h3 style="margin-top:20px; margin-bottom:10px; color:var(--pitch-800); font-weight:600;">${group.name}</h3>`
      : '';

    return (
      titleHtml +
      `<table class="standings-table">` +
      `<thead><tr>` +
      `<th>Pos</th><th style="text-align:left;">Equipa</th>` +
      `<th>J</th><th>V</th><th>E</th><th>D</th><th>GM</th><th>GS</th><th>DG</th><th>Pts</th>` +
      `</tr></thead>` +
      `<tbody>${rows.join('')}</tbody>` +
      `</table>`
    );
  });

  dom.standingsWrapper.innerHTML = html.join('');
}

// ---------------------------------------------------------------------------
// Estatísticas — marcadores
// ---------------------------------------------------------------------------

/**
 * Constrói um índice pId → { name, team } percorrendo os plantéis uma única vez,
 * evitando a busca O(n²) anterior.
 */
function buildPlayerIndex() {
  const index = {};
  state.squads.forEach((squad, teamIndex) => {
    squad.forEach((player) => {
      index[player.id] = { name: player.name, team: getTeamName(teamIndex) };
    });
  });
  return index;
}

export function computeScorerStats() {
  const playerIndex = buildPlayerIndex();
  const stats = {};

  Object.keys(state.results).forEach((gi) => {
    const res = state.results[gi];
    if (!res || typeof res !== 'object' || !res.scorers) return;

    ['home', 'away'].forEach((side) => {
      if (!res.scorers[side]) return;
      res.scorers[side].forEach((pId) => {
        if (pId === 'auto') return;
        if (!stats[pId]) {
          const info = playerIndex[pId] || { name: 'Jogador Desconhecido', team: 'Sem Equipa' };
          stats[pId] = { name: info.name, team: info.team, count: 0 };
        }
        stats[pId].count++;
      });
    });
  });

  return Object.values(stats).sort((a, b) => b.count - a.count);
}

export function statCardsHtml(summary) {
  const cards = [
    ['Jogos realizados', `${summary.played} / ${summary.total}`],
    ['Jogos em falta', String(summary.pendentes)],
    ['Golos marcados', String(summary.totalGoals)],
    ['Média de golos / jogo', summary.media.toFixed(2)],
    ['🔥 Melhor ataque', summary.bestAtkLabel],
    ['🧱 Melhor defesa', summary.bestDefLabel],
    ['Maior goleada', summary.biggestWinLabel],
    ['Mais vitórias', summary.mostWinsLabel],
    ['Mais empates', summary.mostDrawsLabel],
  ];

  return cards.map(([label, value]) =>
    `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value">${escapeHtml(value)}</div></div>`
  ).join('');
}

export function renderStatsGrid(summary) {
  const scorers = computeScorerStats().slice(0, 10);
  let html = statCardsHtml(summary);

  const scorerRows = scorers.length
    ? scorers.map((s) =>
        `<div style="padding:6px 0; border-bottom:1px solid var(--line);"><strong>${s.count}</strong> golos — ${escapeHtml(s.name)} <span style="color:var(--ink-faint); font-size:13px;">(${escapeHtml(s.team)})</span></div>`
      ).join('')
    : '<p class="empty">Nenhum golo registado ainda.</p>';

  html += `<div class="card" style="grid-column: span 3;"><div class="section-title">👟 Tabela de Marcadores</div>${scorerRows}</div>`;
  dom.statsGrid.innerHTML = html;
}

// ---------------------------------------------------------------------------
// Estatísticas gerais (usadas no dashboard e em gerarEliminatórias)
// ---------------------------------------------------------------------------
export function computeStatsSummary() {
  const teamsArray = state.teams.slice(0, state.scheduleTeamCount);
  const groupsData = computeStandings(teamsArray, state.schedule, state.results, state.config);
  let flatStandings = [];
  groupsData.forEach((g) => { flatStandings = flatStandings.concat(g.standings); });

  const total = state.schedule.length;

  const playedKeys = Object.keys(state.results).filter((k) => {
    const val = state.results[k];
    if (typeof val === 'object' && val.status === GAME_STATUS.AGENDADO) return false;
    const scoreStr = val ? (typeof val === 'object' ? val.score : String(val)) : '';
    return /^\d+-\d+$/.test(scoreStr.trim());
  });

  const played = playedKeys.length;
  const totalGoals = flatStandings.reduce((s, t) => s + t.GM, 0);
  const media = played > 0 ? totalGoals / played : 0;
  const withGames = flatStandings.filter((s) => s.J > 0);

  function pick(arr, better) {
    if (!arr.length) return null;
    return arr.reduce((a, b) => (better(b, a) ? b : a));
  }

  const bestAtk   = pick(withGames, (b, a) => b.GM > a.GM);
  const bestDef   = pick(withGames, (b, a) => b.GS < a.GS);
  const mostWins  = pick(withGames, (b, a) => b.V > a.V);
  const mostDraws = pick(withGames, (b, a) => b.E > a.E);

  let biggestWin = null;
  state.schedule.forEach((g, gi) => {
    const resObj = state.results[gi];
    if (!resObj) return;
    if (typeof resObj === 'object' && resObj.status === GAME_STATUS.AGENDADO) return;
    const resStr = typeof resObj === 'object' ? resObj.score : String(resObj);
    const m = /^(\d+)-(\d+)$/.exec(resStr.trim());
    if (!m) return;
    const diff = Math.abs(+m[1] - +m[2]);
    if (!biggestWin || diff > biggestWin.diff) {
      biggestWin = { diff, text: `${getTeamName(g.home)} ${resStr} ${getTeamName(g.away)}` };
    }
  });

  const roundPlayed = {};
  state.schedule.forEach((g, gi) => {
    if (!roundPlayed[g.jornada]) roundPlayed[g.jornada] = { played: 0, total: 0 };
    roundPlayed[g.jornada].total++;
    const val = state.results[gi];
    if (val && typeof val === 'object' && val.status !== GAME_STATUS.AGENDADO) roundPlayed[g.jornada].played++;
    else if (typeof val === 'string' && val.trim() !== '') roundPlayed[g.jornada].played++;
  });

  let currentRound = state.roundsMeta.length ? state.roundsMeta[state.roundsMeta.length - 1].jornada : 0;
  for (const rm of state.roundsMeta) {
    const rp = roundPlayed[rm.jornada] || { played: 0, total: 0 };
    if (rp.played < rp.total) { currentRound = rm.jornada; break; }
  }

  return {
    groupsData,
    flatStandings,
    total,
    played,
    pendentes: total - played,
    totalGoals,
    media,
    bestAtkLabel:   bestAtk   ? `${bestAtk.name} — ${bestAtk.GM} golos`       : '—',
    bestDefLabel:   bestDef   ? `${bestDef.name} — ${bestDef.GS} sofridos`     : '—',
    mostWinsLabel:  mostWins  ? `${mostWins.name} — ${mostWins.V} vitórias`    : '—',
    mostDrawsLabel: mostDraws ? `${mostDraws.name} — ${mostDraws.E} empates`   : '—',
    biggestWinLabel: biggestWin ? `${biggestWin.text}  (dif. ${biggestWin.diff})` : '—',
    totalRounds: state.roundsMeta.length,
    currentRound,
  };
}

// ---------------------------------------------------------------------------
// Render — dashboard
// ---------------------------------------------------------------------------
export function renderDashboard(summary) {
  dom.tournamentTitle.textContent = (state.config.nome || 'Torneio').toUpperCase();

  const sortedAll = summary.flatStandings.slice().sort((a, b) =>
    (b.Pts - a.Pts) || (b.DG - a.DG) || (b.GM - a.GM)
  );
  const top3 = sortedAll.slice(0, 3);

  dom.dashboardPodium.innerHTML = top3.length
    ? top3.map((s, i) =>
        `<div class="podium-card podium-${i + 1}">` +
        `<div class="podium-rank">${i + 1}º LUGAR</div>` +
        `<div class="podium-name">${escapeHtml(s.name)}</div>` +
        `<div class="podium-pts">${s.Pts} pts · ${s.J} jogos</div>` +
        `</div>`
      ).join('')
    : '<p class="empty">Sem equipas configuradas.</p>';

  const rest = sortedAll.slice(3, 8);
  dom.dashboardStandings.innerHTML = rest.length
    ? `<table class="mini-table"><thead><tr><th>Pos</th><th style="text-align:left;">Equipa</th><th>J</th><th>Pts</th></tr></thead><tbody>` +
      rest.map((s, i) =>
        `<tr><td class="num">${i + 4}</td><td style="text-align:left;">${getTeamDisplay(s.idx)}</td><td class="num">${s.J}</td><td class="num">${s.Pts}</td></tr>`
      ).join('') +
      `</tbody></table>`
    : '';

  dom.dashboardStats.innerHTML = statCardsHtml(summary);

  const scorers = computeScorerStats().slice(0, 5);
  const scorerHtml = scorers.length > 0
    ? scorers.map((s, i) =>
        `<div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--line);">` +
        `<span>${i + 1}. ${escapeHtml(s.name)} <span style="color:var(--ink-faint); font-size:12px;">(${escapeHtml(s.team)})</span></span>` +
        `<span style="font-weight:700;">${s.count} golos</span></div>`
      ).join('')
    : '<p class="empty" style="padding-top:20px;">Nenhum golo registado ainda.</p>';

  document.getElementById('dashboardScorers').innerHTML =
    `<div class="section-title" style="margin-top:20px;">👟 Top Marcadores</div>${scorerHtml}`;
}

export function updateTicker(summary) {
  if (!summary.totalRounds) {
    dom.marqueeTicker.textContent = 'SEM CALENDÁRIO';
    return;
  }
  dom.marqueeTicker.textContent = `JORNADA ${summary.currentRound} / ${summary.totalRounds}   ·   ${summary.played}/${summary.total} JOGOS DISPUTADOS`;
}

// ---------------------------------------------------------------------------
// Modal — geral (confirmações e scorer)
// ---------------------------------------------------------------------------
export function openConfirm(title, body, onConfirm) {
  dom.modalTitle.textContent = title;
  dom.modalBody.innerHTML = body;
  confirmCallback = onConfirm;

  dom.modalCancel.innerHTML = 'Cancelar';
  dom.modalCancel.style.background = 'var(--paper)';
  dom.modalCancel.style.color = 'var(--ink)';
  dom.modalCancel.hidden = false;

  dom.modalConfirm.innerHTML = 'Confirmar';
  dom.modalConfirm.style.background = 'var(--danger)';
  dom.modalConfirm.style.color = '#fff';
  dom.modalConfirm.hidden = false;

  dom.modalOverlay.hidden = false;
  dom.modalConfirm.focus();
}

export function closeConfirm() {
  dom.modalOverlay.hidden = true;
  confirmCallback = null;
}

export function openScorerModal(gi, side, onSelect) {
  const game = state.schedule[gi];
  const teamIdx = side === 'home' ? game.home : game.away;
  const teamName = getTeamName(teamIdx);
  const players = (state.squads && state.squads[teamIdx]) ? state.squads[teamIdx] : [];

  dom.modalTitle.textContent = `Golo: ${teamName}`;

  dom.modalBody.innerHTML = players.length
    ? players.map((p) =>
        `<button class="btn btn-ghost scorer-btn" data-pid="${p.id}">${p.num} - ${escapeHtml(p.name)}</button>`
      ).join('')
    : '<p class="empty" style="margin-bottom:14px;">Nenhum jogador registado nesta equipa.</p>';

  dom.modalCancel.innerHTML = '❌ Cancelar';
  dom.modalCancel.style.background = 'var(--danger)';
  dom.modalCancel.style.color = '#fff';
  dom.modalCancel.hidden = false;

  dom.modalConfirm.innerHTML = '✅ Auto-Golo';
  dom.modalConfirm.style.background = 'var(--pitch-500)';
  dom.modalConfirm.style.color = '#fff';
  dom.modalConfirm.hidden = false;

  confirmCallback = () => {
    onSelect('auto');
    dom.modalOverlay.hidden = true;
  };

  dom.modalOverlay.hidden = false;

  Array.from(dom.modalBody.querySelectorAll('.scorer-btn')).forEach((b) => {
    b.onclick = () => {
      onSelect(b.dataset.pid);
      dom.modalOverlay.hidden = true;
    };
  });
}

export function openPlayerProfile(pId, tIdx) {
  const squad = state.squads[tIdx] || [];
  const player = squad.find((p) => p.id === pId);
  if (!player) return;

  const teamName = getTeamName(tIdx);
  let goals = 0;
  let gamesWithGoals = 0;
  let bestGameGolos = 0;

  Object.keys(state.results).forEach((gi) => {
    const res = state.results[gi];
    if (!res || typeof res !== 'object' || !res.scorers) return;
    let matchGoals = 0;
    ['home', 'away'].forEach((side) => {
      if (res.scorers[side]) {
        res.scorers[side].forEach((id) => { if (id === pId) matchGoals++; });
      }
    });
    if (matchGoals > 0) {
      goals += matchGoals;
      gamesWithGoals++;
      if (matchGoals > bestGameGolos) bestGameGolos = matchGoals;
    }
  });

  dom.modalTitle.textContent = 'Ficha de Jogador';
  dom.modalBody.innerHTML =
    `<div style="text-align:center; padding: 10px 0;">` +
    `<div style="font-size:40px; margin-bottom:10px;">👤</div>` +
    `<h2 style="font-size:24px; margin-bottom:4px;">${escapeHtml(player.name)}</h2>` +
    `<div style="color:var(--ink-faint); font-weight:600;">Camisola ${player.num} • ${escapeHtml(teamName)}</div>` +
    `</div>` +
    `<div class="stats-grid" style="margin-top:20px; grid-template-columns: 1fr 1fr;">` +
    `<div class="stat-card" style="text-align:center;"><div class="stat-label">Total de Golos</div><div class="stat-value">${goals}</div></div>` +
    `<div class="stat-card" style="text-align:center;"><div class="stat-label">Jogos a Marcar</div><div class="stat-value">${gamesWithGoals}</div></div>` +
    `<div class="stat-card" style="grid-column: span 2; text-align:center;"><div class="stat-label">Recorde num só jogo</div><div class="stat-value">${bestGameGolos} <span style="font-size:14px; font-weight:normal; color:var(--ink-faint);">golos</span></div></div>` +
    `</div>`;

  dom.modalCancel.innerHTML = 'Fechar';
  dom.modalCancel.style.background = 'var(--paper)';
  dom.modalCancel.style.color = 'var(--ink)';
  dom.modalCancel.hidden = false;
  dom.modalConfirm.hidden = true;

  dom.modalOverlay.hidden = false;
  confirmCallback = null;
}

// ---------------------------------------------------------------------------
// Toasts e indicadores de estado de gravação
// ---------------------------------------------------------------------------
export function showToast(msg, type) {
  const t = document.createElement('div');
  t.className = `toast${type === 'error' ? ' toast-error' : type === 'ok' ? ' toast-ok' : ''}`;
  t.textContent = msg;
  dom.toastRoot.appendChild(t);
  requestAnimationFrame(() => { t.classList.add('show'); });
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => { t.remove(); }, 300);
  }, 3200);
}

export function flashSaved() {
  dom.savePill.textContent = 'Guardado ✓';
  dom.savePill.classList.remove('pill-error');
  dom.savePill.classList.add('pill-ok');
  clearTimeout(flashSavedTimer);
  flashSavedTimer = setTimeout(() => {
    dom.savePill.textContent = 'Guardado';
    dom.savePill.classList.remove('pill-ok');
  }, 1600);
}

export function flashError() {
  dom.savePill.textContent = 'Erro';
  dom.savePill.classList.add('pill-error');
}

export function flashBackup(isoTimestamp) {
  dom.backupPill.textContent = `💾 Backup ${fmtTimestamp(isoTimestamp)}`;
  dom.backupPill.classList.add('pill-fresh');
}

// ---------------------------------------------------------------------------
// Navegação por tabs
// ---------------------------------------------------------------------------
export function switchTab(name) {
  const tabsContainer = document.getElementById('tabs');
  Array.from(document.querySelectorAll('.tab')).forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === name);
  });
  dom.panels.forEach((p) => { p.classList.toggle('active', p.id === `tab-${name}`); });
  if (tabsContainer) tabsContainer.classList.remove('menu-open');
}
