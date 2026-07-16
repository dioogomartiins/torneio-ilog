import { state } from './state.js';
import { getTeamName } from './utils.js';

export function bergerRounds(n) {
        var teams = []; for (var i = 0; i < n; i++) teams.push(i);
        if (n % 2 !== 0) teams.push(-1);
        var total = teams.length;
        var rounds = [];
        var fixed = teams[0];
        var rest = teams.slice(1);
        for (var r = 0; r < total - 1; r++) {
          var l = [fixed].concat(rest);
          var pairs = []; var bye = null;
          for (var k = 0; k < total / 2; k++) {
            var t1 = l[k], t2 = l[total - 1 - k];
            if (r % 2 === 1) { var tmp = t1; t1 = t2; t2 = tmp; }
            if (t1 === -1) bye = t2;
            else if (t2 === -1) bye = t1;
            else pairs.push([t1, t2]);
          }
          rounds.push({ pairs: pairs, bye: bye });
          rest = [rest[rest.length - 1]].concat(rest.slice(0, -1));
        }
        return rounds;
      }

      export function generateSchedule(groupsIndices, numVoltas) {
        var schedule = [];
        var roundsMeta = [];
        var nGrupos = groupsIndices.length;
        
        var maxRoundsPerVolta = 0;
        var groupBergerRounds = [];
        for (var g = 0; g < nGrupos; g++) {
          var bRounds = bergerRounds(groupsIndices[g].length);
          groupBergerRounds.push(bRounds);
          if (bRounds.length > maxRoundsPerVolta) maxRoundsPerVolta = bRounds.length;
        }

        var jornada = 1;
        for (var v = 0; v < numVoltas; v++) {
          var mirror = v % 2 === 1;
          for (var ri = 0; ri < maxRoundsPerVolta; ri++) {
            var roundByes = [];
            for (var g = 0; g < nGrupos; g++) {
               if (ri < groupBergerRounds[g].length) {
                 var round = groupBergerRounds[g][ri];
                 for (var pi = 0; pi < round.pairs.length; pi++) {
                   var pair = round.pairs[pi];
                   var t1 = pair[0] === -1 ? -1 : groupsIndices[g][pair[0]];
                   var t2 = pair[1] === -1 ? -1 : groupsIndices[g][pair[1]];
                   var home = mirror ? t2 : t1;
                   var away = mirror ? t1 : t2;
                   schedule.push({ jornada: jornada, home: home, away: away, group: g });
                 }
                 if (round.bye !== null) {
                   roundByes.push(groupsIndices[g][round.bye]);
                 }
               }
            }
            roundsMeta.push({ jornada: jornada, bye: roundByes.length ? roundByes.join(', ') : null });
            jornada++;
          }
        }
        return { schedule: schedule, roundsMeta: roundsMeta };
      }

      export function computeStandings(teamsArray, schedule, results, config) {
        var nGrupos = config.numGrupos || 1;
        var groupStats = [];
        for (var g = 0; g < nGrupos; g++) {
           groupStats.push({
             name: nGrupos > 1 ? 'Grupo ' + String.fromCharCode(65 + g) : 'Classificação Geral',
             standings: []
           });
        }

        var stats = teamsArray.map(function (t, idx) {
          var name = typeof t === 'string' ? t : (t && t.name ? t.name : ('Equipa ' + (idx + 1)));
          return { idx: idx, name: name, J: 0, V: 0, E: 0, D: 0, GM: 0, GS: 0, Pts: 0 };
        });

        schedule.forEach(function (game, gi) {
          if (game.isPlayoff) return;
          var resObj = results[gi];
          if (!resObj) return;
          var resStr = typeof resObj === 'object' ? resObj.score : String(resObj);

          var m = /^(\d+)-(\d+)$/.exec(resStr.trim());
          if (!m) return;
          var gc = parseInt(m[1], 10), gf = parseInt(m[2], 10);
          var home = stats[game.home], away = stats[game.away];
          if (!home || !away) return;

          if (typeof resObj === 'object' && resObj.status === 'agendado') return;

          home.J++; away.J++;
          home.GM += gc; home.GS += gf;
          away.GM += gf; away.GS += gc;
          if (gc > gf) {
            home.V++; away.D++;
            home.Pts += config.pontosVitoria + (gc >= config.golosGoleada ? config.bonusGoleada : 0);
            away.Pts += config.pontosDerrota;
          } else if (gc < gf) {
            away.V++; home.D++;
            away.Pts += config.pontosVitoria + (gf >= config.golosGoleada ? config.bonusGoleada : 0);
            home.Pts += config.pontosDerrota;
          } else {
            home.E++; away.E++;
            home.Pts += config.pontosEmpate;
            away.Pts += config.pontosEmpate;
          }
        });
        stats.forEach(function (s) { s.DG = s.GM - s.GS; });

        stats.forEach(function (s) {
           var t = teamsArray[s.idx];
           var g = t && t.group !== undefined ? t.group : 0;
           if (g >= nGrupos) g = nGrupos - 1;
           groupStats[g].standings.push(s);
        });

        groupStats.forEach(function(group) {
          var arr = group.standings.sort(function (a, b) {
            return (b.Pts - a.Pts) || (b.DG - a.DG) || (b.GM - a.GM);
          });
          var finalArr = []; var i = 0;
          while (i < arr.length) {
            var j = i + 1;
            while (j < arr.length && arr[j].Pts === arr[i].Pts && arr[j].DG === arr[i].DG && arr[j].GM === arr[i].GM) j++;
            var cluster = arr.slice(i, j);
            if (cluster.length > 1) cluster = resolveHeadToHead(cluster, schedule, results, config);
            finalArr = finalArr.concat(cluster);
            i = j;
          }
          group.standings = finalArr;
        });
        
        return groupStats;
      }

      export function resolveHeadToHead(cluster, schedule, results, config) {
        var ids = {}; cluster.forEach(function (c) { ids[c.idx] = true; });
        var mini = {}; cluster.forEach(function (c) { mini[c.idx] = { pts: 0, gm: 0, gs: 0 }; });
        schedule.forEach(function (game, gi) {
          var resObj = results[gi];
          if (!resObj) return;
          if (typeof resObj === 'object' && resObj.status === 'agendado') return;
          if (!ids[game.home] || !ids[game.away]) return;

          var resStr = typeof resObj === 'object' ? resObj.score : String(resObj);
          var m = /^(\d+)-(\d+)$/.exec(resStr.trim());
          if (!m) return;
          var gc = parseInt(m[1], 10), gf = parseInt(m[2], 10);
          mini[game.home].gm += gc; mini[game.home].gs += gf;
          mini[game.away].gm += gf; mini[game.away].gs += gc;
          if (gc > gf) mini[game.home].pts += config.pontosVitoria + (gc >= config.golosGoleada ? config.bonusGoleada : 0);
          else if (gc < gf) mini[game.away].pts += config.pontosVitoria + (gf >= config.golosGoleada ? config.bonusGoleada : 0);
          else { mini[game.home].pts += config.pontosEmpate; mini[game.away].pts += config.pontosEmpate; }
        });
        return cluster.slice().sort(function (a, b) {
          var ma = mini[a.idx], mb = mini[b.idx];
          if (mb.pts !== ma.pts) return mb.pts - ma.pts;
          var dgA = ma.gm - ma.gs, dgB = mb.gm - mb.gs;
          if (dgB !== dgA) return dgB - dgA;
          if (mb.gm !== ma.gm) return mb.gm - ma.gm;
          if (a.GS !== b.GS) return a.GS - b.GS;
          return a.name.localeCompare(b.name);
        });
      }
