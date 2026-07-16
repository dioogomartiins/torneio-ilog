import { state } from './state.js';
import { getTeamName, getTeamDisplay, escapeHtml, fmtTimestamp, clamp, numOr } from './utils.js';
import { computeStandings } from './algorithms.js';
import { onStatusBtnClick, onScoreBtnClick, onResultCommit, onTeamPropChange, onAddPlayer, onSquadListClick } from './main.js';

export function computeStatsSummary() {
        var teamsArray = state.teams.slice(0, state.scheduleTeamCount);
        var groupsData = computeStandings(teamsArray, state.schedule, state.results, state.config);
        var flatStandings = [];
        groupsData.forEach(function(g) { flatStandings = flatStandings.concat(g.standings); });

        var total = state.schedule.length;

        var playedKeys = Object.keys(state.results).filter(function (k) {
          var val = state.results[k];
          if (typeof val === 'object' && val.status === 'agendado') return false;
          var scoreStr = val ? (typeof val === 'object' ? val.score : String(val)) : '';
          return /^\d+-\d+$/.test(scoreStr.trim());
        });
        var played = playedKeys.length;
        var totalGoals = flatStandings.reduce(function (s, t) { return s + t.GM; }, 0);
        var media = played > 0 ? totalGoals / played : 0;
        var withGames = flatStandings.filter(function (s) { return s.J > 0; });

        function pick(arr, better) { if (!arr.length) return null; return arr.reduce(function (a, b) { return better(b, a) ? b : a; }); }
        var bestAtk = pick(withGames, function (b, a) { return b.GM > a.GM; });
        var bestDef = pick(withGames, function (b, a) { return b.GS < a.GS; });
        var mostWins = pick(withGames, function (b, a) { return b.V > a.V; });
        var mostDraws = pick(withGames, function (b, a) { return b.E > a.E; });

        var biggestWin = null;
        state.schedule.forEach(function (g, gi) {
          var resObj = state.results[gi];
          if (!resObj) return;
          if (typeof resObj === 'object' && resObj.status === 'agendado') return;
          var resStr = typeof resObj === 'object' ? resObj.score : String(resObj);
          var m = /^(\d+)-(\d+)$/.exec(resStr.trim());
          if (!m) return;
          var gc = +m[1], gf = +m[2], diff = Math.abs(gc - gf);
          if (!biggestWin || diff > biggestWin.diff) {
            biggestWin = { diff: diff, text: getTeamName(g.home) + ' ' + resStr + ' ' + getTeamName(g.away) };
          }
        });

        var roundPlayed = {};
        state.schedule.forEach(function (g, gi) {
          roundPlayed[g.jornada] = roundPlayed[g.jornada] || { played: 0, total: 0 };
          roundPlayed[g.jornada].total++;
          var val = state.results[gi];
          if (val && typeof val === 'object' && val.status !== 'agendado') roundPlayed[g.jornada].played++;
          else if (typeof val === 'string' && val.trim() !== '') roundPlayed[g.jornada].played++;
        });
        var currentRound = state.roundsMeta.length ? state.roundsMeta[state.roundsMeta.length - 1].jornada : 0;
        for (var ri = 0; ri < state.roundsMeta.length; ri++) {
          var rm = state.roundsMeta[ri];
          var rp = roundPlayed[rm.jornada] || { played: 0, total: 0 };
          if (rp.played < rp.total) { currentRound = rm.jornada; break; }
        }

        return {
          groupsData: groupsData, flatStandings: flatStandings, total: total, played: played, pendentes: total - played,
          totalGoals: totalGoals, media: media,
          bestAtkLabel: bestAtk ? (bestAtk.name + ' — ' + bestAtk.GM + ' golos') : '—',
          bestDefLabel: bestDef ? (bestDef.name + ' — ' + bestDef.GS + ' sofridos') : '—',
          mostWinsLabel: mostWins ? (mostWins.name + ' — ' + mostWins.V + ' vitórias') : '—',
          mostDrawsLabel: mostDraws ? (mostDraws.name + ' — ' + mostDraws.E + ' empates') : '—',
          biggestWinLabel: biggestWin ? (biggestWin.text + '  (dif. ' + biggestWin.diff + ')') : '—',
          totalRounds: state.roundsMeta.length, currentRound: currentRound
        };
      }

export function openScorerModal(gi, side, onSelect) {
        var game = state.schedule[gi];
        var teamIdx = (side === 'home') ? game.home : game.away;
        var teamName = getTeamName(teamIdx);

        var players = (state.squads && state.squads[teamIdx]) ? state.squads[teamIdx] : [];

        dom.modalTitle.textContent = "Golo: " + teamName;

        if (players.length === 0) {
          dom.modalBody.innerHTML = '<p class="empty" style="margin-bottom:14px;">Nenhum jogador registado nesta equipa.</p>';
        } else {
          dom.modalBody.innerHTML = players.map(function (p) {
            return '<button class="btn btn-ghost scorer-btn" data-pid="' + p.id + '">' + p.num + ' - ' + escapeHtml(p.name) + '</button>';
          }).join('');
        }

        dom.modalCancel.innerHTML = '❌ Cancelar';
        dom.modalCancel.style.background = 'var(--danger)';
        dom.modalCancel.style.color = '#fff';
        dom.modalCancel.hidden = false;

        dom.modalConfirm.innerHTML = '✅ Auto-Golo';
        dom.modalConfirm.style.background = 'var(--pitch-500)';
        dom.modalConfirm.style.color = '#fff';
        dom.modalConfirm.hidden = false;

        confirmCallback = function () {
          onSelect('auto');
          dom.modalOverlay.hidden = true;
        };

        dom.modalOverlay.hidden = false;

        var btns = dom.modalBody.querySelectorAll('.scorer-btn');
        Array.prototype.forEach.call(btns, function (b) {
          b.onclick = function () {
            onSelect(b.dataset.pid);
            dom.modalOverlay.hidden = true;
          };
        });
      }

      export function openPlayerProfile(pId, tIdx) {
        var squad = state.squads[tIdx] || [];
        var player = squad.find(function (p) { return p.id === pId; });
        if (!player) return;

        var teamName = getTeamName(tIdx);
        var goals = 0;
        var gamesWithGoals = 0;
        var bestGameGolos = 0;

        // Calcular estatísticas individuais
        Object.keys(state.results).forEach(function (gi) {
          var res = state.results[gi];
          if (!res || typeof res !== 'object' || !res.scorers) return;
          var matchGoals = 0;
          ['home', 'away'].forEach(function (side) {
            if (res.scorers[side]) {
              res.scorers[side].forEach(function (id) {
                if (id === pId) matchGoals++;
              });
            }
          });
          if (matchGoals > 0) {
            goals += matchGoals;
            gamesWithGoals++;
            if (matchGoals > bestGameGolos) bestGameGolos = matchGoals;
          }
        });

        dom.modalTitle.textContent = "Ficha de Jogador";

        var html =
          '<div style="text-align:center; padding: 10px 0;">' +
          '<div style="font-size:40px; margin-bottom:10px;">👤</div>' +
          '<h2 style="font-size:24px; margin-bottom:4px;">' + escapeHtml(player.name) + '</h2>' +
          '<div style="color:var(--ink-faint); font-weight:600;">Camisola ' + player.num + ' • ' + escapeHtml(teamName) + '</div>' +
          '</div>' +
          '<div class="stats-grid" style="margin-top:20px; grid-template-columns: 1fr 1fr;">' +
          '<div class="stat-card" style="text-align:center;">' +
          '<div class="stat-label">Total de Golos</div>' +
          '<div class="stat-value">' + goals + '</div>' +
          '</div>' +
          '<div class="stat-card" style="text-align:center;">' +
          '<div class="stat-label">Jogos a Marcar</div>' +
          '<div class="stat-value">' + gamesWithGoals + '</div>' +
          '</div>' +
          '<div class="stat-card" style="grid-column: span 2; text-align:center;">' +
          '<div class="stat-label">Recorde num só jogo</div>' +
          '<div class="stat-value">' + bestGameGolos + ' <span style="font-size:14px; font-weight:normal; color:var(--ink-faint);">golos</span></div>' +
          '</div>' +
          '</div>';

        dom.modalBody.innerHTML = html;

        // Configurar botões para o modo "Perfil"
        dom.modalCancel.innerHTML = 'Fechar';
        dom.modalCancel.style.background = 'var(--paper)';
        dom.modalCancel.style.color = 'var(--ink)';
        dom.modalCancel.hidden = false;

        dom.modalConfirm.hidden = true; // Não há nada a confirmar na ficha

        dom.modalOverlay.hidden = false;
        confirmCallback = null;
      }

export var dom = {};
      export function cacheDom() {
        ['tournamentTitle', 'savePill', 'backupPill', 'marqueeTicker',
          'btnGerarCalendario', 'btnNovoTorneio', 'btnAtualizar', 'btnDarkMode', 'btnExportar', 'btnImportar', 'inputImportar',
          'btnMobileMenu', 'tabs',
          'btnAdicionarVolta', 'btnGerarEliminatorias', 'calendarActions',
          'dashboardPodium', 'dashboardStandings', 'dashboardStats', 'dashboardScorers',
          'cfgNome', 'cfgNumEquipas', 'cfgNumGrupos', 'cfgNumVoltas', 'cfgVitoria', 'cfgEmpate', 'cfgDerrota', 'cfgBonus', 'cfgGoleada', 'scheduleHint',
          'cfgMataMata', 'cfgNumPlayoffTeams',
          'teamsList', 'squadTeamSelect', 'squadPlayerNum', 'squadPlayerName', 'btnAddPlayer', 'squadList',
          'calendarList', 'resultsList', 'standingsWrapper', 'statsGrid',
          'modalOverlay', 'modalTitle', 'modalBody', 'modalCancel', 'modalConfirm', 'toastRoot'
        ].forEach(function (id) { dom[id] = document.getElementById(id); });
        dom.panels = Array.prototype.slice.call(document.querySelectorAll('.panel'));
      }

      export function renderAll() {
        populateConfigForm();
        renderTeams();
        renderSquadsDropdown();
        renderCalendar();
        renderResults();
        refreshComputed();
      }

      export function refreshComputed() {
        var summary = computeStatsSummary();
        renderStandingsWrapper(summary.groupsData);
        renderStatsGrid(summary);
        renderDashboard(summary);
        updateTicker(summary);
        renderScheduleHint();

        if (state.config.mataMata && dom.btnGerarEliminatorias) {
          var leagueTotal = 0;
          var leaguePlayed = 0;
          var hasPlayoffs = false;
          state.schedule.forEach(function (g, gi) {
            if (g.isPlayoff) { hasPlayoffs = true; return; }
            leagueTotal++;
            var res = state.results[gi];
            if (res && typeof res === 'object' && res.status === 'terminado') leaguePlayed++;
          });
          var leagueFinished = (leagueTotal > 0 && leagueTotal === leaguePlayed);
          dom.btnGerarEliminatorias.style.display = (leagueFinished && !hasPlayoffs) ? 'inline-flex' : 'none';
        }
      }

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
        var confN = clamp(parseInt(dom.cfgNumEquipas.value, 10) || state.config.numEquipas, 2, 32);
        var confV = clamp(parseInt(dom.cfgNumVoltas.value, 10) || state.config.numVoltas, 1, 20);
        var live = 'Calendário atual: <strong>' + state.scheduleTeamCount + ' equipas / ' + state.scheduleVoltas + ' volta(s)</strong> · ' + state.schedule.length + ' jogos.';
        if (confN !== state.scheduleTeamCount || confV !== state.scheduleVoltas) {
          live += ' Configurado agora: ' + confN + ' equipas / ' + confV + ' volta(s) — clica em 🔄 Gerar Calendário para aplicar.';
        }
        dom.scheduleHint.innerHTML = live;
      }

      export function renderTeams() {
        var html = [];
        for (var i = 0; i < 32; i++) {
          var active = i < state.scheduleTeamCount;
          var t = state.teams[i] || { name: '', color: '#2F7A4F' };
          var groupTag = (active && state.config.numGrupos > 1 && t.group !== undefined) ? '<span class="team-tag" style="background:var(--pitch-800); color:#fff; border:none; margin-left: 8px;">Grupo ' + String.fromCharCode(65 + t.group) + '</span>' : '';
          html.push(
            '<div class="team-row' + (active ? '' : ' team-row-inactive') + '">' +
            '<span class="team-num">' + (i + 1) + '</span>' +
            '<input type="color" class="team-color-picker team-prop" data-prop="color" data-idx="' + i + '" value="' + escapeHtml(t.color) + '" title="Cor da Equipa">' +
            '<input type="text" class="input team-prop" data-prop="name" data-idx="' + i + '" value="' + escapeHtml(t.name) + '" placeholder="Equipa ' + (i + 1) + '">' +
            groupTag +
            (active ? '' : '<span class="team-tag">fora do calendário atual</span>') +
            '</div>'
          );
        }
        dom.teamsList.innerHTML = html.join('');
        Array.prototype.forEach.call(dom.teamsList.querySelectorAll('.team-prop'), function (inp) {
          inp.addEventListener('blur', onTeamPropChange);
          inp.addEventListener('change', function (e) { if (e.target.type === 'color') onTeamPropChange(e); });
          inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') inp.blur(); });
        });
      }

      export function renderSquadsDropdown() {
        var sel = dom.squadTeamSelect.value;
        var html = [];
        for (var i = 0; i < state.scheduleTeamCount; i++) {
          html.push('<option value="' + i + '">' + escapeHtml(getTeamName(i)) + '</option>');
        }
        dom.squadTeamSelect.innerHTML = html.join('');
        if (sel && dom.squadTeamSelect.querySelector('option[value="' + sel + '"]')) {
          dom.squadTeamSelect.value = sel;
        }
        renderSquadList();
      }

      export function renderSquadList() {
        var tIdx = dom.squadTeamSelect.value;
        if (!tIdx) { dom.squadList.innerHTML = '<p class="empty">Nenhuma equipa selecionada.</p>'; return; }
        var squad = state.squads[tIdx] || [];
        if (!squad.length) { dom.squadList.innerHTML = '<p class="empty" style="padding-top:20px;">Sem jogadores. Adiciona o primeiro acima!</p>'; return; }

        var sortedSquad = squad.slice().sort(function (a, b) { return a.num - b.num; });
        var html = sortedSquad.map(function (p) {
          return '<div class="player-row">' +
            '<div class="player-info"><span class="player-num">' + p.num + '</span><span style="font-weight:600;">' + escapeHtml(p.name) + '</span></div>' +
            '<div style="display:flex; gap:6px;">' +
            '<button class="btn btn-ghost player-stats-btn" data-idx="' + tIdx + '" data-pid="' + p.id + '" style="color:var(--pitch-800); background:var(--paper); border:1px solid var(--line); padding:4px 8px; font-size:12px;">📊 Ficha</button>' +
            '<button class="player-del" data-idx="' + tIdx + '" data-pid="' + p.id + '" title="Remover jogador">×</button>' +
            '</div></div>';
        }).join('');
        dom.squadList.innerHTML = '<div style="margin-top:20px;">' + html + '</div>';
      }

      export function getStatusBadge(status, gi) {
        var lbl = status === 'agendado' ? '📅 Agendado' : status === 'decorrer' ? '⏳ A Decorrer' : '✅ Terminado';
        return '<button class="status-badge status-' + status + '" data-gi="' + gi + '" title="Clique para mudar estado">' + lbl + '</button>';
      }

      export function renderCalendar() {
        var hasSchedule = state.schedule.length > 0;
        dom.calendarActions.style.display = hasSchedule ? 'block' : 'none';

        if (!hasSchedule) {
          dom.calendarList.innerHTML = '<p class="empty">Ainda não há calendário. Vai a Configuração e clica em 🔄 Gerar Calendário.</p>';
          return;
        }
        var byRound = {};
        state.schedule.forEach(function (g, gi) { (byRound[g.jornada] = byRound[g.jornada] || []).push({ g: g, gi: gi }); });
        var byeMap = {};
        state.roundsMeta.forEach(function (r) { if (r.bye !== null && r.bye !== undefined) byeMap[r.jornada] = r.bye; });

        var parts = [];
        state.roundsMeta.forEach(function (rm) {
          var j = rm.jornada;
          var games = byRound[j] || [];
          parts.push('<div class="round-card"><div class="round-head">Jornada ' + j + '</div><div class="round-games">');
          games.forEach(function (item) {
            var g = item.g, gi = item.gi;
            var val = state.results[gi];
            var status = val && val.status ? val.status : 'agendado';

            parts.push('<div class="fixture"><span class="fx-home">' + getTeamDisplay(g.home) + '</span>' +
              '<span class="fx-vs">' + getStatusBadge(status, gi) + ' VS</span>' +
              '<span class="fx-away">' + getTeamDisplay(g.away) + '</span></div>');
          });
          if (byeMap[j] !== undefined) {
            parts.push('<div class="fixture fixture-bye">💤 ' + getTeamDisplay(byeMap[j]) + ' — folga esta jornada</div>');
          }
          parts.push('</div></div>');
        });
        dom.calendarList.innerHTML = parts.join('');

        Array.prototype.forEach.call(dom.calendarList.querySelectorAll('.status-badge'), function (btn) {
          btn.addEventListener('click', onStatusBtnClick);
        });
      }

      export function renderResults() {
        if (!state.schedule.length) { dom.resultsList.innerHTML = '<p class="empty">Sem jogos agendados.</p>'; return; }
        var byRound = {};
        state.schedule.forEach(function (g, gi) { (byRound[g.jornada] = byRound[g.jornada] || []).push({ g: g, gi: gi }); });

        var parts = [];
        state.roundsMeta.forEach(function (rm) {
          var j = rm.jornada;
          var games = byRound[j] || [];
          if (!games.length) return;
          parts.push('<div class="round-card"><div class="round-head">Jornada ' + j + '</div><div class="round-games">');
          games.forEach(function (item) {
            var g = item.g, gi = item.gi;

            var val = state.results[gi];
            var vHome = '', vAway = '';
            var pHome = '', pAway = '';
            var status = 'agendado';

            if (val) {
              status = val.status || 'agendado';
              var scoreStr = typeof val === 'object' ? val.score : String(val);
              var m = /^(\d+)-(\d+)$/.exec(scoreStr);
              if (m) { vHome = m[1]; vAway = m[2]; }
              if (val.penalties) {
                var mp = /^(\d+)-(\d+)$/.exec(val.penalties);
                if (mp) { pHome = mp[1]; pAway = mp[2]; }
              }
            }

            var isTie = (vHome !== '' && vAway !== '' && vHome === vAway);
            var isTerminado = (status === 'terminado');
            var isPlayoff = g.isPlayoff;

            var penaltiesHtml = '';
            if (isTerminado && isTie && isPlayoff) {
              penaltiesHtml = '<div class="penalties-split">' +
                '<span class="pen-label">Penáltis</span>' +
                '<input type="number" class="input pen-box" data-gi="' + gi + '" data-side="home" value="' + escapeHtml(pHome) + '" min="0" max="99" inputmode="numeric">' +
                '<span class="res-sep">-</span>' +
                '<input type="number" class="input pen-box" data-gi="' + gi + '" data-side="away" value="' + escapeHtml(pAway) + '" min="0" max="99" inputmode="numeric">' +
                '</div>';
            }

            parts.push(
              '<div class="fixture fixture-input">' +
              '<span class="fx-home">' + getTeamDisplay(g.home) + '</span>' +
              '<div class="result-split">' +
              '<button class="score-btn" data-gi="' + gi + '" data-side="home" data-action="sub">-</button>' +
              '<input type="number" class="input res-box" data-gi="' + gi + '" data-side="home" value="' + escapeHtml(vHome) + '" min="0" max="99" inputmode="numeric">' +
              '<button class="score-btn" data-gi="' + gi + '" data-side="home" data-action="add">+</button>' +
              '<span class="res-sep">-</span>' +
              '<button class="score-btn" data-gi="' + gi + '" data-side="away" data-action="sub">-</button>' +
              '<input type="number" class="input res-box" data-gi="' + gi + '" data-side="away" value="' + escapeHtml(vAway) + '" min="0" max="99" inputmode="numeric">' +
              '<button class="score-btn" data-gi="' + gi + '" data-side="away" data-action="add">+</button>' +
              '</div>' +
              '<span class="fx-away">' + getTeamDisplay(g.away) + '</span>' +
              penaltiesHtml +
              '<div style="grid-column: 1 / span 3; text-align: center; margin-top: 10px;">' + getStatusBadge(status, gi) + '</div>' +
              '</div>'
            );
          });
          parts.push('</div></div>');
        });
        dom.resultsList.innerHTML = parts.join('');

        Array.prototype.forEach.call(dom.resultsList.querySelectorAll('.res-box'), function (inp) {
          inp.addEventListener('blur', onResultCommit);
          inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') inp.blur(); });
        });

        Array.prototype.forEach.call(dom.resultsList.querySelectorAll('.pen-box'), function (inp) {
          inp.addEventListener('blur', onResultCommit);
          inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') inp.blur(); });
        });

        Array.prototype.forEach.call(dom.resultsList.querySelectorAll('.score-btn'), function (btn) {
          btn.addEventListener('click', onScoreBtnClick);
        });

        Array.prototype.forEach.call(dom.resultsList.querySelectorAll('.status-badge'), function (btn) {
          btn.addEventListener('click', onStatusBtnClick);
        });
      }

      export function renderStandingsWrapper(groupsData) {
        if (!groupsData || !groupsData.length || !groupsData[0].standings.length) {
          dom.standingsWrapper.innerHTML = '<table class="standings-table"><tr><td colspan="10" class="empty">Sem equipas configuradas.</td></tr></table>';
          return;
        }

        var html = groupsData.map(function(group) {
          var rows = group.standings.map(function (s, i) {
            var cls = i === 0 ? 'pos-gold' : i === 1 ? 'pos-silver' : i === 2 ? 'pos-bronze' : '';
            var dgTxt = (s.DG > 0 ? '+' : '') + s.DG;
            return '<tr class="' + cls + '">' +
              '<td><span class="pos-badge">' + (i + 1) + '</span></td>' +
              '<td class="team-cell">' + getTeamDisplay(s.idx) + '</td>' +
              '<td class="num">' + s.J + '</td><td class="num">' + s.V + '</td><td class="num">' + s.E + '</td><td class="num">' + s.D + '</td>' +
              '<td class="num">' + s.GM + '</td><td class="num">' + s.GS + '</td><td class="num">' + dgTxt + '</td>' +
              '<td class="num pts-cell">' + s.Pts + '</td>' +
              '</tr>';
          });
          
          var titleHtml = groupsData.length > 1 ? '<h3 style="margin-top:20px; margin-bottom:10px; color:var(--pitch-800); font-weight:600;">' + group.name + '</h3>' : '';
          
          return titleHtml + '<table class="standings-table">' +
            '<thead>' +
              '<tr>' +
                '<th>Pos</th>' +
                '<th style="text-align:left;">Equipa</th>' +
                '<th>J</th>' +
                '<th>V</th>' +
                '<th>E</th>' +
                '<th>D</th>' +
                '<th>GM</th>' +
                '<th>GS</th>' +
                '<th>DG</th>' +
                '<th>Pts</th>' +
              '</tr>' +
            '</thead>' +
            '<tbody>' + rows.join('') + '</tbody>' +
          '</table>';
        });

        dom.standingsWrapper.innerHTML = html.join('');
      }

      export function statCardsHtml(summary) {
        var cards = [
          ['Jogos realizados', summary.played + ' / ' + summary.total],
          ['Jogos em falta', String(summary.pendentes)],
          ['Golos marcados', String(summary.totalGoals)],
          ['Média de golos / jogo', summary.media.toFixed(2)],
          ['🔥 Melhor ataque', summary.bestAtkLabel],
          ['🧱 Melhor defesa', summary.bestDefLabel],
          ['Maior goleada', summary.biggestWinLabel],
          ['Mais vitórias', summary.mostWinsLabel],
          ['Mais empates', summary.mostDrawsLabel]
        ];
        return cards.map(function (c) {
          return '<div class="stat-card"><div class="stat-label">' + c[0] + '</div><div class="stat-value">' + escapeHtml(c[1]) + '</div></div>';
        }).join('');
      }

      export function computeScorerStats() {
        var stats = {};
        Object.keys(state.results).forEach(function (gi) {
          var res = state.results[gi];
          if (!res || typeof res !== 'object' || !res.scorers) return;
          ['home', 'away'].forEach(function (side) {
            if (!res.scorers[side]) return;
            res.scorers[side].forEach(function (pId) {
              if (pId === 'auto') return;

              if (!stats[pId]) {
                var playerName = "Jogador Desconhecido";
                var playerTeam = "Sem Equipa";
                state.squads.forEach(function (squad, teamIndex) {
                  var p = squad.find(function (player) { return player.id === pId; });
                  if (p) { playerName = p.name; playerTeam = getTeamName(teamIndex); }
                });
                stats[pId] = { name: playerName, team: playerTeam, count: 0 };
              }
              stats[pId].count++;
            });
          });
        });
        return Object.keys(stats).map(function (id) {
          return { name: stats[id].name, team: stats[id].team, count: stats[id].count };
        }).sort(function (a, b) { return b.count - a.count; });
      }

      export function renderStatsGrid(summary) {
        var scorers = computeScorerStats().slice(0, 10);
        var html = statCardsHtml(summary);

        html += '<div class="card" style="grid-column: span 3;"><div class="section-title">👟 Tabela de Marcadores</div>' +
          (scorers.length ? scorers.map(function (s) {
            return '<div style="padding:6px 0; border-bottom:1px solid var(--line);"><strong>' + s.count + '</strong> golos — ' + escapeHtml(s.name) + ' <span style="color:var(--ink-faint); font-size:13px;">(' + escapeHtml(s.team) + ')</span></div>';
          }).join('') : '<p class="empty">Nenhum golo registado ainda.</p>') + '</div>';

        dom.statsGrid.innerHTML = html;
      }

      export function renderDashboard(summary) {
        dom.tournamentTitle.textContent = (state.config.nome || 'Torneio').toUpperCase();
        var sortedAll = summary.flatStandings.slice().sort(function(a,b) { return (b.Pts - a.Pts) || (b.DG - a.DG) || (b.GM - a.GM); });
        var top3 = sortedAll.slice(0, 3);
        dom.dashboardPodium.innerHTML = top3.length ? top3.map(function (s, i) {
          return '<div class="podium-card podium-' + (i + 1) + '">' +
            '<div class="podium-rank">' + (i + 1) + 'º LUGAR</div>' +
            '<div class="podium-name">' + escapeHtml(s.name) + '</div>' +
            '<div class="podium-pts">' + s.Pts + ' pts · ' + s.J + ' jogos</div>' +
            '</div>';
        }).join('') : '<p class="empty">Sem equipas configuradas.</p>';

        var rest = sortedAll.slice(3, 8);
        if (rest.length) {
          dom.dashboardStandings.innerHTML =
            '<table class="mini-table"><thead><tr><th>Pos</th><th style="text-align:left;">Equipa</th><th>J</th><th>Pts</th></tr></thead><tbody>' +
            rest.map(function (s, i) { return '<tr><td class="num">' + (i + 4) + '</td><td style="text-align:left;">' + getTeamDisplay(s.idx) + '</td><td class="num">' + s.J + '</td><td class="num">' + s.Pts + '</td></tr>'; }).join('') +
            '</tbody></table>';
        } else { dom.dashboardStandings.innerHTML = ''; }

        dom.dashboardStats.innerHTML = statCardsHtml(summary);

        var scorers = computeScorerStats().slice(0, 5);
        var scorerHtml = scorers.length > 0 ? scorers.map(function (s, i) {
          return '<div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--line);">' +
            '<span>' + (i + 1) + '. ' + escapeHtml(s.name) + ' <span style="color:var(--ink-faint); font-size:12px;">(' + escapeHtml(s.team) + ')</span></span>' +
            '<span style="font-weight:700;">' + s.count + ' golos</span></div>';
        }).join('') : '<p class="empty" style="padding-top:20px;">Nenhum golo registado ainda.</p>';

        document.getElementById('dashboardScorers').innerHTML = '<div class="section-title" style="margin-top:20px;">👟 Top Marcadores</div>' + scorerHtml;
      }

      export function updateTicker(summary) {
        if (!summary.totalRounds) { dom.marqueeTicker.textContent = 'SEM CALENDÁRIO'; return; }
        dom.marqueeTicker.textContent = 'JORNADA ' + summary.currentRound + ' / ' + summary.totalRounds + '   ·   ' + summary.played + '/' + summary.total + ' JOGOS DISPUTADOS';
      }

export function openConfirm(title, body, onConfirm) {
        dom.modalTitle.textContent = title;
        dom.modalBody.innerHTML = body;
        confirmCallback = onConfirm;

        dom.modalCancel.innerHTML = 'Cancelar'; dom.modalCancel.style.background = 'var(--paper)'; dom.modalCancel.style.color = 'var(--ink)'; dom.modalCancel.hidden = false;
        dom.modalConfirm.innerHTML = 'Confirmar'; dom.modalConfirm.style.background = 'var(--danger)'; dom.modalConfirm.style.color = '#fff'; dom.modalConfirm.hidden = false;

        dom.modalOverlay.hidden = false; dom.modalConfirm.focus();
      }

export function closeConfirm() { dom.modalOverlay.hidden = true; confirmCallback = null; }

      export function showToast(msg, type) {
        var t = document.createElement('div'); t.className = 'toast' + (type === 'error' ? ' toast-error' : type === 'ok' ? ' toast-ok' : '');
        t.textContent = msg; dom.toastRoot.appendChild(t);
        requestAnimationFrame(function () { t.classList.add('show'); });
        setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.remove(); }, 300); }, 3200);
      }

export function flashSaved() {
        dom.savePill.textContent = 'Guardado ✓'; dom.savePill.classList.remove('pill-error'); dom.savePill.classList.add('pill-ok');
        clearTimeout(flashSavedTimer);
        flashSavedTimer = setTimeout(function () { dom.savePill.textContent = 'Guardado'; dom.savePill.classList.remove('pill-ok'); }, 1600);
      }

export function flashError() { dom.savePill.textContent = 'Erro'; dom.savePill.classList.add('pill-error'); }
      export function flashBackup(isoTimestamp) { dom.backupPill.textContent = '💾 Backup ' + fmtTimestamp(isoTimestamp); dom.backupPill.classList.add('pill-fresh'); }

      export function switchTab(name) {
        var tabsContainer = document.getElementById('tabs');
        Array.prototype.slice.call(document.querySelectorAll('.tab')).forEach(function (b) { b.classList.toggle('active', b.dataset.tab === name); });
        dom.panels.forEach(function (p) { p.classList.toggle('active', p.id === 'tab-' + name); });
        if (tabsContainer) tabsContainer.classList.remove('menu-open');
      }

export var confirmCallback = null;
export var flashSavedTimer = null;
