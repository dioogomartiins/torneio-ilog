import { state, persistConfigTeams, loadState, persistSchedule, persistResults, persistBackup, currentTheme, setCurrentTheme, exportJSON, importJSON, applyGeneratedSchedule } from './state.js';
import { dom, cacheDom, renderAll, refreshComputed, renderScheduleHint, renderSquadList, renderSquadsDropdown, renderCalendar, renderResults, showToast, flashSaved, openConfirm, closeConfirm, switchTab, confirmCallback, openScorerModal, openPlayerProfile, computeStatsSummary } from './ui.js';
import { clamp, numOr } from './utils.js';
import { bergerRounds } from './algorithms.js';

// ---------------------------------------------------------------------------
// Handlers de configuração
// ---------------------------------------------------------------------------
export function onConfigFieldChange() {
  state.config.nome            = dom.cfgNome.value.trim() || 'Torneio';
  state.config.pontosVitoria   = numOr(dom.cfgVitoria.value, 3);
  state.config.pontosEmpate    = numOr(dom.cfgEmpate.value, 1);
  state.config.pontosDerrota   = numOr(dom.cfgDerrota.value, 0);
  state.config.bonusGoleada    = numOr(dom.cfgBonus.value, 1);
  state.config.golosGoleada    = numOr(dom.cfgGoleada.value, 3);
  state.config.mataMata        = dom.cfgMataMata.checked;
  state.config.numPlayoffTeams = parseInt(dom.cfgNumPlayoffTeams.value, 10) || 4;
  state.config.numGrupos       = parseInt(dom.cfgNumGrupos.value, 10) || 1;
  persistConfigTeams();
  refreshComputed();
}

export function onFormatFieldChange() {
  const n = clamp(parseInt(dom.cfgNumEquipas.value, 10) || state.config.numEquipas, 2, 32);
  const v = clamp(parseInt(dom.cfgNumVoltas.value, 10) || state.config.numVoltas, 1, 20);
  dom.cfgNumEquipas.value = n;
  dom.cfgNumVoltas.value = v;
  state.config.numEquipas = n;
  state.config.numVoltas = v;
  persistConfigTeams();
  renderScheduleHint();
}

// ---------------------------------------------------------------------------
// Handlers de equipas e plantéis
// ---------------------------------------------------------------------------
export function onTeamPropChange(e) {
  const idx = parseInt(e.target.dataset.idx, 10);
  const prop = e.target.dataset.prop;
  state.teams[idx][prop] = e.target.value.trim();
  persistConfigTeams();
  renderSquadsDropdown();
  renderCalendar();
  renderResults();
  refreshComputed();
}

export function onAddPlayer() {
  const tIdx = dom.squadTeamSelect.value;
  const num  = parseInt(dom.squadPlayerNum.value, 10);
  const name = dom.squadPlayerName.value.trim();

  if (!tIdx || isNaN(num) || !name) {
    showToast('Preenche o número e o nome do jogador.', 'error');
    return;
  }

  state.squads[tIdx].push({
    id: `p_${Math.random().toString(36).substring(2, 9)}`,
    num,
    name,
  });

  persistConfigTeams();
  dom.squadPlayerNum.value = '';
  dom.squadPlayerName.value = '';
  dom.squadPlayerNum.focus();
  renderSquadList();
  showToast('Jogador adicionado!', 'ok');
}

export function onSquadListClick(e) {
  const btnDel   = e.target.closest('.player-del');
  const btnStats = e.target.closest('.player-stats-btn');

  if (btnDel) {
    const tIdx = btnDel.dataset.idx;
    const pid  = btnDel.dataset.pid;
    state.squads[tIdx] = state.squads[tIdx].filter((p) => p.id !== pid);
    persistConfigTeams();
    renderSquadList();
  } else if (btnStats) {
    openPlayerProfile(btnStats.dataset.pid, btnStats.dataset.idx);
  }
}

// ---------------------------------------------------------------------------
// Handlers de resultados
// ---------------------------------------------------------------------------
export function onStatusBtnClick(e) {
  const gi = e.target.dataset.gi;

  if (!state.results[gi] || typeof state.results[gi] === 'string') {
    state.results[gi] = { score: '0-0', scorers: { home: [], away: [] }, status: 'agendado' };
  }

  const current = state.results[gi].status || 'agendado';
  const cycle = { agendado: 'decorrer', decorrer: 'terminado', terminado: 'agendado' };
  state.results[gi].status = cycle[current] ?? 'agendado';

  persistResults();
  renderResults();
  renderCalendar();
  refreshComputed();
}

export function onScoreBtnClick(e) {
  const btn    = e.target;
  const gi     = btn.dataset.gi;
  const side   = btn.dataset.side;
  const action = btn.dataset.action;
  const row    = btn.closest('.result-split');

  const input      = row.querySelector(`input[data-side="${side}"]`);
  const otherInput = row.querySelector(`input[data-side="${side === 'home' ? 'away' : 'home'}"]`);

  let currentVal = parseInt(input.value, 10);
  if (isNaN(currentVal)) currentVal = 0;

  if (action === 'add') {
    openScorerModal(gi, side, (pid) => {
      input.value = currentVal + 1;

      if (!state.results[gi] || typeof state.results[gi] === 'string') {
        state.results[gi] = { score: '0-0', scorers: { home: [], away: [] }, status: 'decorrer' };
      } else if (state.results[gi].status === 'agendado') {
        state.results[gi].status = 'decorrer';
      }

      state.results[gi].scorers[side].push(pid);

      const h = side === 'home' ? input.value : (row.querySelector('input[data-side="home"]').value || 0);
      const a = side === 'away' ? input.value : (row.querySelector('input[data-side="away"]').value || 0);
      state.results[gi].score = `${h}-${a}`;

      onResultCommit({ target: input });
    });
  } else if (action === 'sub') {
    if (currentVal <= 0) {
      input.value = 0;
    } else {
      input.value = currentVal - 1;
      if (state.results[gi]?.scorers?.[side]?.length > 0) {
        state.results[gi].scorers[side].pop();
      }
    }
    onResultCommit({ target: input });
  }

  if (otherInput.value === '') otherInput.value = 0;
}

export function onResultCommit(e) {
  const gi  = e.target.dataset.gi;
  const row = e.target.closest('.fixture-input') || e.target.closest('.result-split').parentNode;

  const inps    = row.querySelectorAll('.res-box');
  const penInps = row.querySelectorAll('.pen-box');

  const vHome = inps[0].value.trim();
  const vAway = inps[1].value.trim();
  const pHome = penInps.length ? penInps[0].value.trim() : '';
  const pAway = penInps.length ? penInps[1].value.trim() : '';

  const clearInvalid = () => {
    inps[0].classList.remove('input-invalid');
    inps[1].classList.remove('input-invalid');
    if (penInps.length) {
      penInps[0].classList.remove('input-invalid');
      penInps[1].classList.remove('input-invalid');
    }
  };

  if (vHome === '' && vAway === '') {
    delete state.results[gi];
    clearInvalid();
  } else if (vHome !== '' && vAway !== '' && !isNaN(vHome) && !isNaN(vAway)) {
    const newScore = `${parseInt(vHome, 10)}-${parseInt(vAway, 10)}`;
    let newPenalties;

    if (pHome !== '' && pAway !== '' && !isNaN(pHome) && !isNaN(pAway)) {
      newPenalties = `${parseInt(pHome, 10)}-${parseInt(pAway, 10)}`;
    }

    if (!state.results[gi] || typeof state.results[gi] === 'string') {
      state.results[gi] = { score: newScore, scorers: { home: [], away: [] }, status: 'terminado' };
    } else {
      state.results[gi].score = newScore;
      if (state.results[gi].status === 'agendado') state.results[gi].status = 'terminado';
    }

    if (newPenalties) state.results[gi].penalties = newPenalties;
    else delete state.results[gi].penalties;

    // Propagar vencedor para o próximo jogo de playoff
    const game = state.schedule[gi];
    if (game && game.isPlayoff && state.results[gi].status === 'terminado') {
      const hScore = parseInt(vHome, 10);
      const aScore = parseInt(vAway, 10);
      let winnerIdx = null;

      if (hScore > aScore) winnerIdx = game.home;
      else if (aScore > hScore) winnerIdx = game.away;
      else if (newPenalties) {
        const ph = parseInt(pHome, 10);
        const pa = parseInt(pAway, 10);
        if (ph > pa) winnerIdx = game.home;
        else if (pa > ph) winnerIdx = game.away;
      }

      if (winnerIdx !== null && game.nextMatchId) {
        const [targetMatchId, targetSide] = game.nextMatchId.split('_');
        const targetGame = state.schedule.find((g) => g.playoffMatchId === targetMatchId);
        if (targetGame) {
          targetGame[targetSide] = winnerIdx;
          persistSchedule();
        }
      }
    }

    clearInvalid();
  } else {
    inps[0].classList.toggle('input-invalid', vHome === '' || isNaN(vHome));
    inps[1].classList.toggle('input-invalid', vAway === '' || isNaN(vAway));
    return;
  }

  persistResults();
  renderResults();
  refreshComputed();
}

// ---------------------------------------------------------------------------
// Handlers de calendário / torneio
// ---------------------------------------------------------------------------
export function onGerarCalendario() {
  const n = clamp(parseInt(dom.cfgNumEquipas.value, 10) || state.config.numEquipas, 2, 32);
  const v = clamp(parseInt(dom.cfgNumVoltas.value, 10) || state.config.numVoltas, 1, 20);
  const hasResults = Object.keys(state.results).length > 0;
  const estimate = bergerRounds(n).reduce((s, r) => s + r.pairs.length, 0) * v;

  function doIt() {
    state.config.numEquipas = n;
    state.config.numVoltas = v;
    applyGeneratedSchedule(n, v, true);
    state.results = {};
    persistConfigTeams();
    persistSchedule();
    persistResults();
    renderAll();
    showToast(`Calendário gerado: ${state.schedule.length} jogos.`, 'ok');
  }

  const msgParts = [];
  if (hasResults) msgParts.push('Isto substitui o calendário atual e apaga todos os resultados já introduzidos.');
  if (estimate > 1500) msgParts.push(`Este calendário vai ter ${estimate} jogos — é bastante grande.`);
  msgParts.push('As equipas, os plantéis e a configuração mantêm-se.');

  if (hasResults || estimate > 1500) {
    openConfirm('Gerar novo calendário', msgParts.join(' '), doIt);
  } else {
    doIt();
  }
}

export function onNovoTorneio() {
  openConfirm(
    '🧹 Novo torneio',
    'Isto apaga todos os resultados, a classificação e as estatísticas. As equipas, o plantel, a configuração e o calendário mantêm-se. Continuar?',
    () => {
      state.results = {};
      persistResults();
      renderAll();
      showToast('Torneio reiniciado.', 'ok');
    }
  );
}

export function onAtualizar() {
  renderAll();
  showToast('Dashboard atualizado.', 'ok');
}

export function onAdicionarVolta() {
  if (!state.schedule.length) return;

  if ((state.config.numGrupos || 1) > 1) {
    showToast('A adição de voltas extras não é suportada em torneios com grupos. Usa o modo Liga Única.', 'error');
    return;
  }

  const novaVolta = state.scheduleVoltas + 1;

  openConfirm(
    'Adicionar Volta Extra',
    `A volta ${novaVolta} será adicionada. Os resultados mantêm-se. Continuar?`,
    () => {
      state.config.numVoltas = novaVolta;
      applyGeneratedSchedule(state.scheduleTeamCount, novaVolta, false);
      if (dom.cfgNumVoltas) dom.cfgNumVoltas.value = novaVolta;
      persistConfigTeams();
      persistSchedule();
      renderAll();
      showToast('Volta extra adicionada!', 'ok');
    }
  );
}

// A cadeia completa de rondas, da maior para a menor.
// A ordem é sempre invariável: Oitavos → Quartos → Meias → Final.
// Para adicionar suporte a 32 equipas basta adicionar uma entrada no início.
const ROUND_CHAIN = [
  { prefix: 'OF', label: 'Oitavos-de-Final' },
  { prefix: 'QF', label: 'Quartos-de-Final' },
  { prefix: 'MF', label: 'Meias-Finais'     },
  { prefix: 'F',  label: 'Final'            },
];

// Para N equipas, as rondas activas começam em: ROUND_CHAIN.length - log2(N)
// Ex: 16 equipas → índice 0 (começa nos Oitavos)
//      4 equipas → índice 2 (começa nas Meias-Finais)
//      2 equipas → índice 3 (começa na Final)

/**
 * Gera o bracket completo de eliminatórias de forma algorítmica.
 *
 * Lógica de seeding da 1ª ronda: emparelha o seed mais alto com o mais
 * baixo em cada par da metade do bracket (1 vs N, N/2 vs N/2+1, 2 vs N-1, …)
 * — padrão UEFA/FIFA para evitar que as melhores equipas se cruzem cedo.
 *
 * Rondas seguintes: os slots home/away ficam como placeholders "Vencedor Xn"
 * e são preenchidos em runtime quando os resultados são introduzidos.
 *
 * @param {number}   teamCount - Número total de equipas no bracket (potência de 2, max 16)
 * @param {object[]} seeds     - Array de equipas ordenado por seed (índice 0 = 1º)
 * @returns {{ games: object[], rounds: object[] }}
 */
function buildPlayoffBracket(teamCount, seeds) {
  const startIndex = ROUND_CHAIN.length - Math.log2(teamCount);
  if (!Number.isInteger(startIndex) || startIndex < 0) return { games: [], rounds: [] };

  const roundDefs = ROUND_CHAIN.slice(startIndex);


  const games  = [];
  const rounds = [];

  // Ordem de seeding da 1ª ronda para evitar confrontos prematuros entre os melhores:
  // Num bracket de N equipas, emparelha: [0 vs N-1], [N/2-1 vs N/2], [1 vs N-2], [N/2-2 vs N/2+1], …
  const firstRoundSeeding = buildFirstRoundSeeding(teamCount);

  roundDefs.forEach((roundDef, roundIndex) => {
    const { prefix, label } = roundDef;
    const next       = roundDefs[roundIndex + 1]?.prefix ?? null;
    const matchCount = teamCount / Math.pow(2, roundIndex + 1);

    rounds.push({ jornada: label, bye: null });

    for (let i = 0; i < matchCount; i++) {
      const matchId     = `${prefix}${i + 1}`;
      const nextMatchId = next ? `${next}${Math.floor(i / 2) + 1}_${i % 2 === 0 ? 'home' : 'away'}` : null;

      let home, away;

      if (roundIndex === 0) {
        // 1ª ronda: usa o seeding real
        const [seedA, seedB] = firstRoundSeeding[i];
        home = seeds[seedA].idx;
        away = seeds[seedB].idx;
      } else {
        // Rondas seguintes: placeholders que são preenchidos em runtime
        const prevPrefix = roundDefs[roundIndex - 1].prefix;
        home = `Vencedor ${prevPrefix}${i * 2 + 1}`;
        away = `Vencedor ${prevPrefix}${i * 2 + 2}`;
      }

      games.push({ jornada: label, home, away, isPlayoff: true, playoffMatchId: matchId, nextMatchId });
    }
  });

  return { games, rounds };
}

/**
 * Calcula os pares de seeds para a 1ª ronda de um bracket de N equipas.
 * Segue o padrão: 1 vs N, N/2 vs N/2+1, depois divide recursivamente cada metade.
 * Exemplo para N=8: [0,7], [3,4], [1,6], [2,5]
 *
 * @param {number} n - Número total de equipas (potência de 2)
 * @returns {[number, number][]} - Pares de índices de seed (0-based)
 */
function buildFirstRoundSeeding(n) {
  if (n === 2) return [[0, 1]];

  // Constrói o bracket recursivamente: divide em duas metades e intercala
  function buildSlots(slots) {
    if (slots.length === 2) return [[slots[0], slots[1]]];
    const mid  = slots.length / 2;
    const top  = slots.slice(0, mid);
    const bot  = slots.slice(mid).reverse();
    const left  = top.filter((_, i) => i % 2 === 0).map((s, i) => [s, bot[i]]);
    const right = top.filter((_, i) => i % 2 !== 0).map((s, i) => [s, bot[mid / 2 + i]]);
    return [...buildSlots(left.flat()), ...buildSlots(right.flat())];
  }

  const seeds = Array.from({ length: n }, (_, i) => i);
  return buildSlots(seeds);
}

export function onGerarEliminatorias() {
  const summary = computeStatsSummary();
  const numPlayoffTeamsPerGroup = state.config.numPlayoffTeams || 4;
  const numGrupos               = state.config.numGrupos || 1;
  const totalPlayoffTeams       = numPlayoffTeamsPerGroup * numGrupos;

  if (totalPlayoffTeams > 16) {
    showToast('O sistema suporta no máximo 16 equipas no Mata-Mata. Altera as configurações.', 'error');
    return;
  }

  const startIndex = ROUND_CHAIN.length - Math.log2(totalPlayoffTeams);
  if (!Number.isInteger(startIndex) || startIndex < 0) {
    showToast(`Configuração de ${totalPlayoffTeams} equipas não suportada.`, 'error');
    return;
  }

  const ok = summary.groupsData.every((g) => g.standings.length >= numPlayoffTeamsPerGroup);
  if (!ok) {
    showToast(`Alguns grupos não têm equipas suficientes para apurar o Top ${numPlayoffTeamsPerGroup}.`, 'error');
    return;
  }

  // Selecciona equipas por posição (intercalando grupos: 1ºA, 1ºB, 2ºA, 2ºB, …)
  const topTeams = [];
  for (let pos = 0; pos < numPlayoffTeamsPerGroup; pos++) {
    for (let g = 0; g < numGrupos; g++) {
      topTeams.push(summary.groupsData[g].standings[pos]);
    }
  }

  const { games: newGames, rounds: newRounds } = buildPlayoffBracket(totalPlayoffTeams, topTeams);

  openConfirm(
    '🏆 Gerar Eliminatórias',
    `Vão ser gerados os jogos de eliminatórias com base na classificação atual (Top ${totalPlayoffTeams}). Continuar?`,
    () => {
      state.schedule   = state.schedule.concat(newGames);
      state.roundsMeta = state.roundsMeta.concat(newRounds);
      persistSchedule();
      renderAll();
      showToast('Eliminatórias geradas!', 'ok');
    }
  );
}

// ---------------------------------------------------------------------------
// Binding de eventos e inicialização
// ---------------------------------------------------------------------------
export function bindEvents() {
  const btnMenu = document.getElementById('btnMobileMenu');
  const tabsContainer = document.getElementById('tabs');

  if (btnMenu && tabsContainer) {
    btnMenu.addEventListener('click', () => { tabsContainer.classList.toggle('menu-open'); });
  }

  Array.from(document.querySelectorAll('.tab')).forEach((btn) => {
    btn.addEventListener('click', () => { switchTab(btn.dataset.tab); });
  });

  dom.btnGerarCalendario.addEventListener('click', onGerarCalendario);
  dom.btnNovoTorneio.addEventListener('click', onNovoTorneio);
  dom.btnAtualizar.addEventListener('click', onAtualizar);
  dom.btnAdicionarVolta.addEventListener('click', onAdicionarVolta);
  dom.btnGerarEliminatorias.addEventListener('click', onGerarEliminatorias);

  // Tema dark/light
  const updateThemeIcon = () => {
    dom.btnDarkMode.textContent = currentTheme === 'dark' ? '☀️' : '🌙';
  };
  updateThemeIcon();

  dom.btnDarkMode.addEventListener('click', () => {
    setCurrentTheme(currentTheme === 'light' ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', currentTheme);
    localStorage.setItem('torneio_theme', currentTheme);
    updateThemeIcon();
  });

  // Plantéis
  dom.squadTeamSelect.addEventListener('change', renderSquadList);
  dom.btnAddPlayer.addEventListener('click', onAddPlayer);
  dom.squadList.addEventListener('click', onSquadListClick);

  // Exportar / Importar
  dom.btnExportar.addEventListener('click', exportJSON);
  dom.btnImportar.addEventListener('click', () => { dom.inputImportar.value = ''; dom.inputImportar.click(); });
  dom.inputImportar.addEventListener('change', () => { importJSON(dom.inputImportar.files[0]); });

  // Configuração
  dom.cfgNome.addEventListener('blur', onConfigFieldChange);
  [dom.cfgVitoria, dom.cfgEmpate, dom.cfgDerrota, dom.cfgBonus, dom.cfgGoleada].forEach((el) => {
    el.addEventListener('blur', onConfigFieldChange);
  });
  [dom.cfgNumEquipas, dom.cfgNumVoltas].forEach((el) => {
    el.addEventListener('input', renderScheduleHint);
    el.addEventListener('blur', onFormatFieldChange);
  });
  dom.cfgNumGrupos.addEventListener('change', () => { onConfigFieldChange(); renderScheduleHint(); });
  dom.cfgMataMata.addEventListener('change', onConfigFieldChange);
  dom.cfgNumPlayoffTeams.addEventListener('change', onConfigFieldChange);

  // Modal
  dom.modalCancel.addEventListener('click', closeConfirm);
  dom.modalConfirm.addEventListener('click', () => {
    const cb = confirmCallback;
    closeConfirm();
    if (cb) cb();
  });
  dom.modalOverlay.addEventListener('click', (e) => { if (e.target === dom.modalOverlay) closeConfirm(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !dom.modalOverlay.hidden) closeConfirm(); });
}

export async function init() {
  cacheDom();
  bindEvents();
  await loadState();
  renderAll();
  switchTab('dashboard');
}

// Ponto de entrada
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
