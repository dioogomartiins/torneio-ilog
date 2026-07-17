import { state, persistConfigTeams, loadState, persistSchedule, persistResults, persistBackup, persistPlayers, persistJogosSingulares, currentTheme, setCurrentTheme, exportJSON, importJSON, applyGeneratedSchedule, applySnapshot, defaultConfig, defaultTeams, defaultSquads } from './state.js';
import { dom, cacheDom, renderAll, refreshComputed, renderScheduleHint, renderSquadList, renderSquadsDropdown, renderCalendar, renderResults, showToast, flashSaved, openConfirm, closeConfirm, openDangerConfirm, switchTab, confirmCallback, openScorerModal, openPlayerProfile, computeStatsSummary, renderPlayersList, openPlayerModal, renderSquadPlayerFromDBDropdown, renderDraftPlayerList, renderDraftTeams, renderSingularHistorico, currentDraft } from './ui.js';
import { clamp, numOr } from './utils.js';
import { bergerRounds, snakeDraft } from './algorithms.js';
import { initFirebaseListener, onFirebaseStateChange } from './firebase.js';

// ---------------------------------------------------------------------------
// Handlers de configuração
// ---------------------------------------------------------------------------
export function onConfigFieldChange() {
  state.config.nome = dom.cfgNome.value.trim() || 'Torneio';
  state.config.pontosVitoria = numOr(dom.cfgVitoria.value, 3);
  state.config.pontosEmpate = numOr(dom.cfgEmpate.value, 1);
  state.config.pontosDerrota = numOr(dom.cfgDerrota.value, 0);
  state.config.bonusGoleada = numOr(dom.cfgBonus.value, 1);
  state.config.golosGoleada = numOr(dom.cfgGoleada.value, 3);
  state.config.mataMata = dom.cfgMataMata.checked;
  state.config.numPlayoffTeams = parseInt(dom.cfgNumPlayoffTeams.value, 10) || 4;
  state.config.numGrupos = parseInt(dom.cfgNumGrupos.value, 10) || 1;
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

export function onAddPlayerFromDB() {
  const tIdx = dom.squadTeamSelect.value;
  const num = parseInt(dom.squadPlayerNum.value, 10);
  const pid = dom.squadPlayerFromDB.value;

  if (!tIdx) { showToast('Seleciona uma equipa.', 'error'); return; }
  if (isNaN(num) || num < 1) { showToast('Preenche o número da camisola.', 'error'); return; }
  if (!pid) { showToast('Escolhe um jogador da lista.', 'error'); return; }

  const player = state.players.find((p) => p.id === pid);
  if (!player) { showToast('Jogador não encontrado.', 'error'); return; }

  // Check if already in squad
  if (state.squads[tIdx].some((p) => p.id === pid)) {
    showToast('Este jogador já está no plantel.', 'error');
    return;
  }

  state.squads[tIdx].push({ id: player.id, num, name: player.nome });
  persistConfigTeams();
  dom.squadPlayerNum.value = '';
  dom.squadPlayerFromDB.value = '';
  renderSquadList();
  renderSquadPlayerFromDBDropdown();
  showToast('Jogador adicionado ao plantel!', 'ok');
}

export function onSquadListClick(e) {
  const btnDel = e.target.closest('.player-del');
  const btnStats = e.target.closest('.player-stats-btn');

  if (btnDel) {
    const tIdx = btnDel.dataset.idx;
    const pid = btnDel.dataset.pid;
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
  const btn = e.target;
  const gi = btn.dataset.gi;
  const side = btn.dataset.side;
  const action = btn.dataset.action;
  const row = btn.closest('.result-split');

  const input = row.querySelector(`input[data-side="${side}"]`);
  const otherInput = row.querySelector(`input[data-side="${side === 'home' ? 'away' : 'home'}"]`);

  if (otherInput.value === '') otherInput.value = 0;

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
}

export function onResultCommit(e) {
  const gi = e.target.dataset.gi;
  const row = e.target.closest('.fixture-input') || e.target.closest('.result-split').parentNode;

  const inps = row.querySelectorAll('.res-box');
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
  const chkResults = document.getElementById('chkDeleteResults');
  const chkSchedule = document.getElementById('chkDeleteSchedule');
  const chkTeams = document.getElementById('chkDeleteTeams');

  const delResults = chkResults && chkResults.checked;
  const delSchedule = chkSchedule && chkSchedule.checked;
  const delTeams = chkTeams && chkTeams.checked;

  if (!delResults && !delSchedule && !delTeams) {
    showToast('Seleciona pelo menos uma categoria para apagar.', 'error');
    return;
  }

  // Build summary labels
  const labels = [];
  if (delResults) labels.push('Resultados e Classificação');
  if (delSchedule) labels.push('Calendário (jornadas e jogos)');
  if (delTeams) labels.push('Equipas e Plantéis');

  openDangerConfirm('🧹 Apagar Dados', labels, async () => {
    if (delResults) {
      state.results = {};
      await persistResults();
    }
    if (delSchedule) {
      state.schedule = [];
      state.roundsMeta = [];
      state.scheduleTeamCount = 0;
      state.scheduleVoltas = 0;
      await persistSchedule();
    }
    if (delTeams) {
      state.teams = defaultTeams();
      state.squads = defaultSquads();
      state.config = Object.assign(defaultConfig(), { numEquipas: state.config.numEquipas });
      await persistConfigTeams();
    }
    renderAll();
    showToast('Dados apagados com sucesso.', 'ok');
  });
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
  { prefix: 'MF', label: 'Meias-Finais' },
  { prefix: 'F', label: 'Final' },
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


  const games = [];
  const rounds = [];

  // Ordem de seeding da 1ª ronda para evitar confrontos prematuros entre os melhores:
  // Num bracket de N equipas, emparelha: [0 vs N-1], [N/2-1 vs N/2], [1 vs N-2], [N/2-2 vs N/2+1], …
  const firstRoundSeeding = buildFirstRoundSeeding(teamCount);

  roundDefs.forEach((roundDef, roundIndex) => {
    const { prefix, label } = roundDef;
    const next = roundDefs[roundIndex + 1]?.prefix ?? null;
    const matchCount = teamCount / Math.pow(2, roundIndex + 1);

    rounds.push({ jornada: label, bye: null });

    for (let i = 0; i < matchCount; i++) {
      const matchId = `${prefix}${i + 1}`;
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
    const mid = slots.length / 2;
    const top = slots.slice(0, mid);
    const bot = slots.slice(mid).reverse();
    const left = top.filter((_, i) => i % 2 === 0).map((s, i) => [s, bot[i]]);
    const right = top.filter((_, i) => i % 2 !== 0).map((s, i) => [s, bot[mid / 2 + i]]);
    return [...buildSlots(left.flat()), ...buildSlots(right.flat())];
  }

  const seeds = Array.from({ length: n }, (_, i) => i);
  return buildSlots(seeds);
}

export function onGerarEliminatorias() {
  const summary = computeStatsSummary();
  const numPlayoffTeamsPerGroup = state.config.numPlayoffTeams || 4;
  const numGrupos = state.config.numGrupos || 1;
  const totalPlayoffTeams = numPlayoffTeamsPerGroup * numGrupos;

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
      state.schedule = state.schedule.concat(newGames);
      state.roundsMeta = state.roundsMeta.concat(newRounds);
      persistSchedule();
      renderAll();
      showToast('Eliminatórias geradas!', 'ok');
    }
  );
}

// ---------------------------------------------------------------------------
// Handlers — Jogo Singular
// ---------------------------------------------------------------------------
export function onFazerDraft() {
  const nomeA = (dom.draftNomeA.value.trim()) || 'Equipa A';
  const nomeB = (dom.draftNomeB.value.trim()) || 'Equipa B';

  const checkedBoxes = dom.draftPlayerList.querySelectorAll('.draft-checkbox:checked');
  const selectedIds = Array.from(checkedBoxes).map((cb) => cb.dataset.pid);

  if (selectedIds.length < 2) {
    showToast('Seleciona pelo menos 2 jogadores.', 'error');
    return;
  }

  const players = selectedIds.map((id) => state.players.find((p) => p.id === id)).filter(Boolean);
  const { equipaA, equipaB } = snakeDraft(players);

  // Store in module-level variable (imported as currentDraft)
  currentDraft.equipaA = equipaA;
  currentDraft.equipaB = equipaB;
  currentDraft.scorersA = [];
  currentDraft.scorersB = [];

  renderDraftTeams(nomeA, nomeB, equipaA, equipaB);
}

export async function onGuardarJogo() {
  const nomeA = dom.draftLabelA ? dom.draftLabelA.textContent : 'Equipa A';
  const nomeB = dom.draftLabelB ? dom.draftLabelB.textContent : 'Equipa B';
  const scoreA = dom.draftScoreA ? dom.draftScoreA.value.trim() : '';
  const scoreB = dom.draftScoreB ? dom.draftScoreB.value.trim() : '';

  if (!currentDraft.equipaA.length && !currentDraft.equipaB.length) {
    showToast('Faz o draft primeiro.', 'error');
    return;
  }

  const resultado = (scoreA !== '' && scoreB !== '') ? `${parseInt(scoreA, 10)}-${parseInt(scoreB, 10)}` : null;

  const jogo = {
    id: crypto.randomUUID(),
    data: new Date().toISOString(),
    nomeEquipaA: nomeA,
    nomeEquipaB: nomeB,
    equipaA: currentDraft.equipaA.map((p) => p.id),
    equipaB: currentDraft.equipaB.map((p) => p.id),
    scorersA: [...(currentDraft.scorersA || [])],
    scorersB: [...(currentDraft.scorersB || [])],
    resultado,
  };

  state.jogosSingulares.push(jogo);
  await persistJogosSingulares();
  renderSingularHistorico();

  // Reset
  currentDraft.equipaA = [];
  currentDraft.equipaB = [];
  currentDraft.scorersA = [];
  currentDraft.scorersB = [];
  if (dom.draftResultCard) dom.draftResultCard.style.display = 'none';
  if (dom.draftScoreA) dom.draftScoreA.value = '';
  if (dom.draftScoreB) dom.draftScoreB.value = '';
  dom.draftPlayerList.querySelectorAll('.draft-checkbox:checked').forEach((cb) => { cb.checked = false; });
  const countEl = document.getElementById('draftSelectedCount');
  if (countEl) countEl.textContent = '0 jogadores selecionados';
  if (dom.btnFazerDraft) dom.btnFazerDraft.disabled = true;

  showToast('Jogo guardado no histórico!', 'ok');

  // Switch to history tab
  document.querySelectorAll('.singular-subtab').forEach((b) => b.classList.toggle('active', b.dataset.subtab === 'historico'));
  document.querySelectorAll('.singular-panel').forEach((p) => p.classList.toggle('active', p.id === 'singular-historico'));
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
    btn.addEventListener('click', (e) => {
      if (btn.dataset.tab) {
        switchTab(btn.dataset.tab);
      } else if (btn.classList.contains('dropdown-btn')) {
        const dropdown = btn.closest('.dropdown');
        if (dropdown) dropdown.classList.toggle('open');
      }
    });
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.dropdown')) {
      document.querySelectorAll('.dropdown.open').forEach(d => d.classList.remove('open'));
    }
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

  // Plantéis — agora com dropdown da BD
  dom.squadTeamSelect.addEventListener('change', () => {
    renderSquadList();
    renderSquadPlayerFromDBDropdown();
  });
  dom.btnAddPlayerFromDB.addEventListener('click', onAddPlayerFromDB);
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

  // Jogadores BD
  if (dom.btnNewPlayer) dom.btnNewPlayer.addEventListener('click', () => openPlayerModal(null));
  if (dom.playerSearchInput) {
    dom.playerSearchInput.addEventListener('input', renderPlayersList);
  }

  // Jogo Singular — subtabs
  document.querySelectorAll('.singular-subtab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.singular-subtab').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.singular-panel').forEach((p) => p.classList.toggle('active', p.id === `singular-${btn.dataset.subtab}`));
      if (btn.dataset.subtab === 'historico') renderSingularHistorico();
    });
  });

  // Jogo Singular — Draft
  if (dom.btnFazerDraft) dom.btnFazerDraft.addEventListener('click', onFazerDraft);
  if (dom.btnGuardarJogo) dom.btnGuardarJogo.addEventListener('click', onGuardarJogo);
}

export async function init() {
  cacheDom();
  bindEvents();
  await loadState();

  initFirebaseListener();
  onFirebaseStateChange((data) => {
    if (data) {
      applySnapshot(data);
      renderAll();
      //showToast('Dados atualizados da nuvem', 'ok');
    }
  });

  renderAll();
  switchTab('dashboard');
}

// Ponto de entrada
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
