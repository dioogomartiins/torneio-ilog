import { state, persistConfigTeams, loadState, persistSchedule, persistResults, persistBackup, currentTheme, setCurrentTheme, exportJSON, importJSON, applyGeneratedSchedule } from './state.js';
import { dom, cacheDom, renderAll, refreshComputed, renderScheduleHint, renderSquadList, renderSquadsDropdown, renderCalendar, renderResults, showToast, flashSaved, openConfirm, closeConfirm, switchTab, confirmCallback, openScorerModal, openPlayerProfile, computeStatsSummary } from './ui.js';
import { clamp, escapeHtml, getTeamName, numOr, fmtTimestamp } from './utils.js';
import { bergerRounds, generateSchedule } from './algorithms.js';

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
        persistConfigTeams(); refreshComputed();
      }

      export function onFormatFieldChange() {
        var n = clamp(parseInt(dom.cfgNumEquipas.value, 10) || state.config.numEquipas, 2, 32);
        var v = clamp(parseInt(dom.cfgNumVoltas.value, 10) || state.config.numVoltas, 1, 20);
        dom.cfgNumEquipas.value = n; dom.cfgNumVoltas.value = v;
        state.config.numEquipas = n; state.config.numVoltas = v;
        persistConfigTeams(); renderScheduleHint();
      }

      export function onTeamPropChange(e) {
        var idx = parseInt(e.target.dataset.idx, 10);
        var prop = e.target.dataset.prop;
        state.teams[idx][prop] = e.target.value.trim();
        persistConfigTeams();
        renderSquadsDropdown(); renderCalendar(); renderResults(); refreshComputed();
      }

      export function onAddPlayer() {
        var tIdx = dom.squadTeamSelect.value;
        var num = parseInt(dom.squadPlayerNum.value, 10);
        var name = dom.squadPlayerName.value.trim();
        if (!tIdx || isNaN(num) || !name) { showToast('Preenche o número e o nome do jogador.', 'error'); return; }

        state.squads[tIdx].push({ id: 'p_' + Math.random().toString(36).substring(2, 9), num: num, name: name });
        persistConfigTeams();
        dom.squadPlayerNum.value = ''; dom.squadPlayerName.value = ''; dom.squadPlayerNum.focus();
        renderSquadList(); showToast('Jogador adicionado!', 'ok');
      }

      export function onSquadListClick(e) {
        var btnDel = e.target.closest('.player-del');
        var btnStats = e.target.closest('.player-stats-btn');

        if (btnDel) {
          var tIdx = btnDel.dataset.idx; var pid = btnDel.dataset.pid;
          state.squads[tIdx] = state.squads[tIdx].filter(function (p) { return p.id !== pid; });
          persistConfigTeams(); renderSquadList();
        } else if (btnStats) {
          openPlayerProfile(btnStats.dataset.pid, btnStats.dataset.idx);
        }
      }

      export function onStatusBtnClick(e) {
        var gi = e.target.dataset.gi;
        if (!state.results[gi] || typeof state.results[gi] === 'string') {
          state.results[gi] = { score: "0-0", scorers: { home: [], away: [] }, status: 'agendado' };
        }
        var current = state.results[gi].status || 'agendado';
        var next = current === 'agendado' ? 'decorrer' : current === 'decorrer' ? 'terminado' : 'agendado';
        state.results[gi].status = next;

        persistResults();
        renderResults();
        renderCalendar();
        refreshComputed();
      }

      export function onScoreBtnClick(e) {
        var btn = e.target;
        var gi = btn.dataset.gi;
        var side = btn.dataset.side;
        var action = btn.dataset.action;

        var row = btn.closest('.result-split');
        var input = row.querySelector('input[data-side="' + side + '"]');
        var otherInput = row.querySelector('input[data-side="' + (side === 'home' ? 'away' : 'home') + '"]');

        var currentVal = parseInt(input.value, 10);
        if (isNaN(currentVal)) currentVal = 0;

        if (action === 'add') {
          openScorerModal(gi, side, function (pid) {
            input.value = currentVal + 1;

            if (!state.results[gi] || typeof state.results[gi] === 'string') {
              state.results[gi] = { score: "0-0", scorers: { home: [], away: [] }, status: 'decorrer' };
            } else if (state.results[gi].status === 'agendado') {
              state.results[gi].status = 'decorrer';
            }

            state.results[gi].scorers[side].push(pid);

            var h = (side === 'home') ? input.value : (row.querySelector('input[data-side="home"]').value || 0);
            var a = (side === 'away') ? input.value : (row.querySelector('input[data-side="away"]').value || 0);
            state.results[gi].score = h + '-' + a;

            onResultCommit({ target: input });
          });
        } else if (action === 'sub') {
          if (currentVal <= 0) {
            input.value = 0;
          } else {
            input.value = currentVal - 1;
            if (state.results[gi] && state.results[gi].scorers && state.results[gi].scorers[side].length > 0) {
              state.results[gi].scorers[side].pop();
            }
          }
          onResultCommit({ target: input });
        }

        if (otherInput.value === '') otherInput.value = 0;
      }

      export function onResultCommit(e) {
        var gi = e.target.dataset.gi;
        var row = e.target.closest('.fixture-input') || e.target.closest('.result-split').parentNode;
        var inps = row.querySelectorAll('.res-box');
        var penInps = row.querySelectorAll('.pen-box');

        var vHome = inps[0].value.trim();
        var vAway = inps[1].value.trim();

        var pHome = penInps.length ? penInps[0].value.trim() : '';
        var pAway = penInps.length ? penInps[1].value.trim() : '';

        if (vHome === '' && vAway === '') {
          delete state.results[gi];
          inps[0].classList.remove('input-invalid'); inps[1].classList.remove('input-invalid');
          if (penInps.length) { penInps[0].classList.remove('input-invalid'); penInps[1].classList.remove('input-invalid'); }
        }
        else if (vHome !== '' && vAway !== '' && !isNaN(vHome) && !isNaN(vAway)) {
          var newScore = parseInt(vHome, 10) + '-' + parseInt(vAway, 10);
          var newPenalties = undefined;
          if (pHome !== '' && pAway !== '' && !isNaN(pHome) && !isNaN(pAway)) {
            newPenalties = parseInt(pHome, 10) + '-' + parseInt(pAway, 10);
          }

          if (!state.results[gi] || typeof state.results[gi] === 'string') {
            state.results[gi] = { score: newScore, scorers: { home: [], away: [] }, status: 'terminado' };
          } else {
            state.results[gi].score = newScore;
            if (state.results[gi].status === 'agendado') state.results[gi].status = 'terminado';
          }

          if (newPenalties) state.results[gi].penalties = newPenalties;
          else delete state.results[gi].penalties;

          var game = state.schedule[gi];
          if (game && game.isPlayoff && state.results[gi].status === 'terminado') {
            var winnerIdx = null;
            var hScore = parseInt(vHome, 10), aScore = parseInt(vAway, 10);
            if (hScore > aScore) winnerIdx = game.home;
            else if (aScore > hScore) winnerIdx = game.away;
            else if (newPenalties) {
              var ph = parseInt(pHome, 10), pa = parseInt(pAway, 10);
              if (ph > pa) winnerIdx = game.home;
              else if (pa > ph) winnerIdx = game.away;
            }

            if (winnerIdx !== null && game.nextMatchId) {
              var matchParts = game.nextMatchId.split('_');
              var targetMatchId = matchParts[0], targetSide = matchParts[1];
              var targetGame = state.schedule.find(function (g) { return g.playoffMatchId === targetMatchId; });
              if (targetGame) {
                targetGame[targetSide] = winnerIdx;
                persistSchedule();
              }
            }
          }

          inps[0].classList.remove('input-invalid'); inps[1].classList.remove('input-invalid');
          if (penInps.length) { penInps[0].classList.remove('input-invalid'); penInps[1].classList.remove('input-invalid'); }
        }
        else {
          if (vHome === '' || isNaN(vHome)) inps[0].classList.add('input-invalid'); else inps[0].classList.remove('input-invalid');
          if (vAway === '' || isNaN(vAway)) inps[1].classList.add('input-invalid'); else inps[1].classList.remove('input-invalid');
          return;
        }

        persistResults();
        renderResults();
        refreshComputed();
      }

      export function onGerarCalendario() {
        var n = clamp(parseInt(dom.cfgNumEquipas.value, 10) || state.config.numEquipas, 2, 32);
        var v = clamp(parseInt(dom.cfgNumVoltas.value, 10) || state.config.numVoltas, 1, 20);
        var hasResults = Object.keys(state.results).length > 0;
        var estimate = bergerRounds(n).reduce(function (s, r) { return s + r.pairs.length; }, 0) * v;

        function doIt() {
          state.config.numEquipas = n; state.config.numVoltas = v;
          applyGeneratedSchedule(n, v, true);
          state.results = {};
          persistConfigTeams(); persistSchedule(); persistResults(); renderAll();
          showToast('Calendário gerado: ' + state.schedule.length + ' jogos.', 'ok');
        }

        var msgParts = [];
        if (hasResults) msgParts.push('Isto substitui o calendário atual e apaga todos os resultados já introduzidos.');
        if (estimate > 1500) msgParts.push('Este calendário vai ter ' + estimate + ' jogos — é bastante grande.');
        msgParts.push('As equipas, os plantéis e a configuração mantêm-se.');

        if (hasResults || estimate > 1500) { openConfirm('Gerar novo calendário', msgParts.join(' '), doIt); } else { doIt(); }
      }

      export function onNovoTorneio() {
        openConfirm('🧹 Novo torneio', 'Isto apaga todos os resultados, a classificação e as estatísticas. As equipas, o plantel, a configuração e o calendário mantêm-se. Continuar?', function () {
          state.results = {}; persistResults(); renderAll(); showToast('Torneio reiniciado.', 'ok');
        });
      }

      export function onAtualizar() { renderAll(); showToast('Dashboard atualizado.', 'ok'); }

      export function onAdicionarVolta() {
        if (!state.schedule.length) return;
        var novaVolta = state.scheduleVoltas + 1;
        openConfirm('Adicionar Volta Extra', 'A volta ' + novaVolta + ' será adicionada. Os resultados mantêm-se. Continuar?', function () {
          var out = generateSchedule(state.scheduleTeamCount, novaVolta);
          state.schedule = out.schedule; state.roundsMeta = out.roundsMeta; state.scheduleVoltas = novaVolta;
          state.config.numVoltas = novaVolta; if (dom.cfgNumVoltas) dom.cfgNumVoltas.value = novaVolta;
          persistConfigTeams(); persistSchedule(); renderAll(); showToast('Volta extra adicionada!', 'ok');
        });
      }

      export function onGerarEliminatorias() {
        var summary = computeStatsSummary();
        var numPlayoffTeamsPerGroup = state.config.numPlayoffTeams || 4;
        var numGrupos = state.config.numGrupos || 1;
        var totalPlayoffTeams = numPlayoffTeamsPerGroup * numGrupos;

        if (totalPlayoffTeams > 16) {
          showToast('O sistema suporta no máximo 16 equipas no Mata-Mata. Altera as configurações.', 'error');
          return;
        }

        var ok = true;
        summary.groupsData.forEach(function(g) {
          if (g.standings.length < numPlayoffTeamsPerGroup) ok = false;
        });

        if (!ok) {
           showToast('Alguns grupos não têm equipas suficientes para apurar o Top ' + numPlayoffTeamsPerGroup + '.', 'error');
           return;
        }

        var topTeams = [];
        for (var pos = 0; pos < numPlayoffTeamsPerGroup; pos++) {
           for (var g = 0; g < numGrupos; g++) {
             topTeams.push(summary.groupsData[g].standings[pos]);
           }
        }
        var numTeams = totalPlayoffTeams;

        var newGames = [];
        var newRounds = [];

        if (numTeams === 2) {
          newRounds.push({ jornada: 'Final', bye: null });
          newGames.push({ jornada: 'Final', home: topTeams[0].idx, away: topTeams[1].idx, isPlayoff: true, playoffMatchId: 'F1', nextMatchId: null });
        }
        else if (numTeams === 4) {
          newRounds.push({ jornada: 'Meias-Finais', bye: null });
          newGames.push({ jornada: 'Meias-Finais', home: topTeams[0].idx, away: topTeams[3].idx, isPlayoff: true, playoffMatchId: 'MF1', nextMatchId: 'F1_home' });
          newGames.push({ jornada: 'Meias-Finais', home: topTeams[1].idx, away: topTeams[2].idx, isPlayoff: true, playoffMatchId: 'MF2', nextMatchId: 'F1_away' });

          newRounds.push({ jornada: 'Final', bye: null });
          newGames.push({ jornada: 'Final', home: 'Vencedor MF1', away: 'Vencedor MF2', isPlayoff: true, playoffMatchId: 'F1', nextMatchId: null });
        }
        else if (numTeams === 8) {
          newRounds.push({ jornada: 'Quartos-de-Final', bye: null });
          newGames.push({ jornada: 'Quartos-de-Final', home: topTeams[0].idx, away: topTeams[7].idx, isPlayoff: true, playoffMatchId: 'QF1', nextMatchId: 'MF1_home' });
          newGames.push({ jornada: 'Quartos-de-Final', home: topTeams[3].idx, away: topTeams[4].idx, isPlayoff: true, playoffMatchId: 'QF2', nextMatchId: 'MF1_away' });
          newGames.push({ jornada: 'Quartos-de-Final', home: topTeams[1].idx, away: topTeams[6].idx, isPlayoff: true, playoffMatchId: 'QF3', nextMatchId: 'MF2_home' });
          newGames.push({ jornada: 'Quartos-de-Final', home: topTeams[2].idx, away: topTeams[5].idx, isPlayoff: true, playoffMatchId: 'QF4', nextMatchId: 'MF2_away' });

          newRounds.push({ jornada: 'Meias-Finais', bye: null });
          newGames.push({ jornada: 'Meias-Finais', home: 'Vencedor QF1', away: 'Vencedor QF2', isPlayoff: true, playoffMatchId: 'MF1', nextMatchId: 'F1_home' });
          newGames.push({ jornada: 'Meias-Finais', home: 'Vencedor QF3', away: 'Vencedor QF4', isPlayoff: true, playoffMatchId: 'MF2', nextMatchId: 'F1_away' });

          newRounds.push({ jornada: 'Final', bye: null });
          newGames.push({ jornada: 'Final', home: 'Vencedor MF1', away: 'Vencedor MF2', isPlayoff: true, playoffMatchId: 'F1', nextMatchId: null });
        }
        else if (numTeams === 16) {
          newRounds.push({ jornada: 'Oitavos-de-Final', bye: null });
          newGames.push({ jornada: 'Oitavos-de-Final', home: topTeams[0].idx, away: topTeams[15].idx, isPlayoff: true, playoffMatchId: 'OF1', nextMatchId: 'QF1_home' });
          newGames.push({ jornada: 'Oitavos-de-Final', home: topTeams[7].idx, away: topTeams[8].idx, isPlayoff: true, playoffMatchId: 'OF2', nextMatchId: 'QF1_away' });
          newGames.push({ jornada: 'Oitavos-de-Final', home: topTeams[3].idx, away: topTeams[12].idx, isPlayoff: true, playoffMatchId: 'OF3', nextMatchId: 'QF2_home' });
          newGames.push({ jornada: 'Oitavos-de-Final', home: topTeams[4].idx, away: topTeams[11].idx, isPlayoff: true, playoffMatchId: 'OF4', nextMatchId: 'QF2_away' });
          newGames.push({ jornada: 'Oitavos-de-Final', home: topTeams[1].idx, away: topTeams[14].idx, isPlayoff: true, playoffMatchId: 'OF5', nextMatchId: 'QF3_home' });
          newGames.push({ jornada: 'Oitavos-de-Final', home: topTeams[6].idx, away: topTeams[9].idx, isPlayoff: true, playoffMatchId: 'OF6', nextMatchId: 'QF3_away' });
          newGames.push({ jornada: 'Oitavos-de-Final', home: topTeams[2].idx, away: topTeams[13].idx, isPlayoff: true, playoffMatchId: 'OF7', nextMatchId: 'QF4_home' });
          newGames.push({ jornada: 'Oitavos-de-Final', home: topTeams[5].idx, away: topTeams[10].idx, isPlayoff: true, playoffMatchId: 'OF8', nextMatchId: 'QF4_away' });

          newRounds.push({ jornada: 'Quartos-de-Final', bye: null });
          newGames.push({ jornada: 'Quartos-de-Final', home: 'Vencedor OF1', away: 'Vencedor OF2', isPlayoff: true, playoffMatchId: 'QF1', nextMatchId: 'MF1_home' });
          newGames.push({ jornada: 'Quartos-de-Final', home: 'Vencedor OF3', away: 'Vencedor OF4', isPlayoff: true, playoffMatchId: 'QF2', nextMatchId: 'MF1_away' });
          newGames.push({ jornada: 'Quartos-de-Final', home: 'Vencedor OF5', away: 'Vencedor OF6', isPlayoff: true, playoffMatchId: 'QF3', nextMatchId: 'MF2_home' });
          newGames.push({ jornada: 'Quartos-de-Final', home: 'Vencedor OF7', away: 'Vencedor OF8', isPlayoff: true, playoffMatchId: 'QF4', nextMatchId: 'MF2_away' });

          newRounds.push({ jornada: 'Meias-Finais', bye: null });
          newGames.push({ jornada: 'Meias-Finais', home: 'Vencedor QF1', away: 'Vencedor QF2', isPlayoff: true, playoffMatchId: 'MF1', nextMatchId: 'F1_home' });
          newGames.push({ jornada: 'Meias-Finais', home: 'Vencedor QF3', away: 'Vencedor QF4', isPlayoff: true, playoffMatchId: 'MF2', nextMatchId: 'F1_away' });

          newRounds.push({ jornada: 'Final', bye: null });
          newGames.push({ jornada: 'Final', home: 'Vencedor MF1', away: 'Vencedor MF2', isPlayoff: true, playoffMatchId: 'F1', nextMatchId: null });
        }

        openConfirm('🏆 Gerar Eliminatórias', 'Vão ser gerados os jogos de eliminatórias com base na classificação atual (Top ' + numTeams + '). Continuar?', function () {
          state.schedule = state.schedule.concat(newGames);
          state.roundsMeta = state.roundsMeta.concat(newRounds);
          persistSchedule();
          renderAll();
          showToast('Eliminatórias geradas!', 'ok');
        });
      }

      
      
      

      
      
      

      export function bindEvents() {
        var btnMenu = document.getElementById('btnMobileMenu');
        var tabsContainer = document.getElementById('tabs');
        if (btnMenu && tabsContainer) { btnMenu.addEventListener('click', function () { tabsContainer.classList.toggle('menu-open'); }); }

        Array.prototype.slice.call(document.querySelectorAll('.tab')).forEach(function (btn) {
          btn.addEventListener('click', function () { switchTab(btn.dataset.tab); });
        });

        dom.btnGerarCalendario.addEventListener('click', onGerarCalendario);
        dom.btnNovoTorneio.addEventListener('click', onNovoTorneio);
        dom.btnAtualizar.addEventListener('click', onAtualizar);
        dom.btnAdicionarVolta.addEventListener('click', onAdicionarVolta);
        dom.btnGerarEliminatorias.addEventListener('click', onGerarEliminatorias);

        function updateThemeIcon() {
          dom.btnDarkMode.textContent = currentTheme === 'dark' ? '☀️' : '🌙';
        }
        updateThemeIcon();

        dom.btnDarkMode.addEventListener('click', function () {
          setCurrentTheme(currentTheme === 'light' ? 'dark' : 'light');
          document.documentElement.setAttribute('data-theme', currentTheme);
          localStorage.setItem('torneio_theme', currentTheme);
          updateThemeIcon();
        });

        dom.squadTeamSelect.addEventListener('change', renderSquadList);
        dom.btnAddPlayer.addEventListener('click', onAddPlayer);
        dom.squadList.addEventListener('click', onSquadListClick);

        dom.btnExportar.addEventListener('click', exportJSON);
        dom.btnImportar.addEventListener('click', function () { dom.inputImportar.value = ''; dom.inputImportar.click(); });
        dom.inputImportar.addEventListener('change', function () { importJSON(dom.inputImportar.files[0]); });

        dom.cfgNome.addEventListener('blur', onConfigFieldChange);
        [dom.cfgVitoria, dom.cfgEmpate, dom.cfgDerrota, dom.cfgBonus, dom.cfgGoleada].forEach(function (el) { el.addEventListener('blur', onConfigFieldChange); });
        [dom.cfgNumEquipas, dom.cfgNumVoltas].forEach(function (el) { el.addEventListener('input', renderScheduleHint); el.addEventListener('blur', onFormatFieldChange); });
        dom.cfgNumGrupos.addEventListener('change', function() { onConfigFieldChange(); renderScheduleHint(); });
        dom.cfgMataMata.addEventListener('change', onConfigFieldChange);
        dom.cfgNumPlayoffTeams.addEventListener('change', onConfigFieldChange);

        dom.modalCancel.addEventListener('click', closeConfirm);
        dom.modalConfirm.addEventListener('click', function () { var cb = confirmCallback; closeConfirm(); if (cb) cb(); });
        dom.modalOverlay.addEventListener('click', function (e) { if (e.target === dom.modalOverlay) closeConfirm(); });
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !dom.modalOverlay.hidden) closeConfirm(); });
      }

      export async function init() {
        cacheDom(); bindEvents(); await loadState(); renderAll(); switchTab('dashboard');
      }

      if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
