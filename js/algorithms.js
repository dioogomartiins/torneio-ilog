import { state } from './state.js';
import { getTeamName } from './utils.js';

// ---------------------------------------------------------------------------
// Constantes de status de jogo
// ---------------------------------------------------------------------------
export const GAME_STATUS = Object.freeze({
  AGENDADO: 'agendado',
  DECORRER: 'decorrer',
  TERMINADO: 'terminado',
});

// ---------------------------------------------------------------------------
// Algoritmo de Berger (round-robin)
// ---------------------------------------------------------------------------
export function bergerRounds(n) {
  const teams = [];
  for (let i = 0; i < n; i++) teams.push(i);
  if (n % 2 !== 0) teams.push(-1); // bye slot

  const total = teams.length;
  const fixed = teams[0];
  let rest = teams.slice(1);
  const rounds = [];

  for (let r = 0; r < total - 1; r++) {
    const l = [fixed, ...rest];
    const pairs = [];
    let bye = null;

    for (let k = 0; k < total / 2; k++) {
      let t1 = l[k];
      let t2 = l[total - 1 - k];

      if (r % 2 === 1) {
        [t1, t2] = [t2, t1];
      }

      if (t1 === -1) bye = t2;
      else if (t2 === -1) bye = t1;
      else pairs.push([t1, t2]);
    }

    rounds.push({ pairs, bye });
    rest = [rest[rest.length - 1], ...rest.slice(0, -1)];
  }

  return rounds;
}

// ---------------------------------------------------------------------------
// Geração do calendário completo (liga + grupos + voltas)
// ---------------------------------------------------------------------------
export function generateSchedule(groupsIndices, numVoltas) {
  const schedule = [];
  const roundsMeta = [];
  const nGrupos = groupsIndices.length;

  let maxRoundsPerVolta = 0;
  const groupBergerRounds = groupsIndices.map((group) => {
    const bRounds = bergerRounds(group.length);
    if (bRounds.length > maxRoundsPerVolta) maxRoundsPerVolta = bRounds.length;
    return bRounds;
  });

  let jornada = 1;

  for (let v = 0; v < numVoltas; v++) {
    const mirror = v % 2 === 1;

    for (let ri = 0; ri < maxRoundsPerVolta; ri++) {
      const roundByes = [];

      for (let g = 0; g < nGrupos; g++) {
        if (ri >= groupBergerRounds[g].length) continue;

        const round = groupBergerRounds[g][ri];

        for (const pair of round.pairs) {
          const t1 = pair[0] === -1 ? -1 : groupsIndices[g][pair[0]];
          const t2 = pair[1] === -1 ? -1 : groupsIndices[g][pair[1]];
          const home = mirror ? t2 : t1;
          const away = mirror ? t1 : t2;
          schedule.push({ jornada, home, away, group: g });
        }

        if (round.bye !== null) {
          roundByes.push(groupsIndices[g][round.bye]);
        }
      }

      roundsMeta.push({ jornada, bye: roundByes.length ? roundByes.join(', ') : null });
      jornada++;
    }
  }

  return { schedule, roundsMeta };
}

// ---------------------------------------------------------------------------
// Cálculo de classificação (standings) por grupo
// ---------------------------------------------------------------------------
export function computeStandings(teamsArray, schedule, results, config) {
  const nGrupos = config.numGrupos || 1;
  const groupStats = [];

  for (let g = 0; g < nGrupos; g++) {
    groupStats.push({
      name: nGrupos > 1 ? `Grupo ${String.fromCharCode(65 + g)}` : 'Classificação Geral',
      standings: [],
    });
  }

  const stats = teamsArray.map((t, idx) => {
    const name = typeof t === 'string' ? t : (t && t.name ? t.name : `Equipa ${idx + 1}`);
    return { idx, name, J: 0, V: 0, E: 0, D: 0, GM: 0, GS: 0, Pts: 0 };
  });

  schedule.forEach((game, gi) => {
    if (game.isPlayoff) return;

    const resObj = results[gi];
    if (!resObj) return;

    if (typeof resObj === 'object' && resObj.status === GAME_STATUS.AGENDADO) return;

    const resStr = typeof resObj === 'object' ? resObj.score : String(resObj);
    const m = /^(\d+)-(\d+)$/.exec(resStr.trim());
    if (!m) return;

    const gc = parseInt(m[1], 10);
    const gf = parseInt(m[2], 10);
    const home = stats[game.home];
    const away = stats[game.away];
    if (!home || !away) return;

    home.J++;
    away.J++;
    home.GM += gc;
    home.GS += gf;
    away.GM += gf;
    away.GS += gc;

    if (gc > gf) {
      home.V++;
      away.D++;
      home.Pts += config.pontosVitoria + (gc >= config.golosGoleada ? config.bonusGoleada : 0);
      away.Pts += config.pontosDerrota;
    } else if (gc < gf) {
      away.V++;
      home.D++;
      away.Pts += config.pontosVitoria + (gf >= config.golosGoleada ? config.bonusGoleada : 0);
      home.Pts += config.pontosDerrota;
    } else {
      home.E++;
      away.E++;
      home.Pts += config.pontosEmpate;
      away.Pts += config.pontosEmpate;
    }
  });

  stats.forEach((s) => { s.DG = s.GM - s.GS; });

  stats.forEach((s) => {
    const t = teamsArray[s.idx];
    let g = t && t.group !== undefined ? t.group : 0;
    if (g >= nGrupos) g = nGrupos - 1;
    groupStats[g].standings.push(s);
  });

  groupStats.forEach((group) => {
    const sorted = group.standings.sort((a, b) =>
      (b.Pts - a.Pts) || (b.DG - a.DG) || (b.GM - a.GM)
    );

    let finalArr = [];
    let i = 0;
    while (i < sorted.length) {
      let j = i + 1;
      while (
        j < sorted.length &&
        sorted[j].Pts === sorted[i].Pts &&
        sorted[j].DG === sorted[i].DG &&
        sorted[j].GM === sorted[i].GM
      ) j++;

      let cluster = sorted.slice(i, j);
      if (cluster.length > 1) cluster = resolveHeadToHead(cluster, schedule, results, config);
      finalArr = finalArr.concat(cluster);
      i = j;
    }

    group.standings = finalArr;
  });

  return groupStats;
}

// ---------------------------------------------------------------------------
// Desempate por confronto direto (head-to-head)
// ---------------------------------------------------------------------------
export function resolveHeadToHead(cluster, schedule, results, config) {
  const ids = {};
  cluster.forEach((c) => { ids[c.idx] = true; });

  const mini = {};
  cluster.forEach((c) => { mini[c.idx] = { pts: 0, gm: 0, gs: 0 }; });

  schedule.forEach((game, gi) => {
    const resObj = results[gi];
    if (!resObj) return;
    if (typeof resObj === 'object' && resObj.status === GAME_STATUS.AGENDADO) return;
    if (!ids[game.home] || !ids[game.away]) return;

    const resStr = typeof resObj === 'object' ? resObj.score : String(resObj);
    const m = /^(\d+)-(\d+)$/.exec(resStr.trim());
    if (!m) return;

    const gc = parseInt(m[1], 10);
    const gf = parseInt(m[2], 10);
    mini[game.home].gm += gc;
    mini[game.home].gs += gf;
    mini[game.away].gm += gf;
    mini[game.away].gs += gc;

    if (gc > gf) {
      mini[game.home].pts += config.pontosVitoria + (gc >= config.golosGoleada ? config.bonusGoleada : 0);
    } else if (gc < gf) {
      mini[game.away].pts += config.pontosVitoria + (gf >= config.golosGoleada ? config.bonusGoleada : 0);
    } else {
      mini[game.home].pts += config.pontosEmpate;
      mini[game.away].pts += config.pontosEmpate;
    }
  });

  return cluster.slice().sort((a, b) => {
    const ma = mini[a.idx];
    const mb = mini[b.idx];
    if (mb.pts !== ma.pts) return mb.pts - ma.pts;
    const dgA = ma.gm - ma.gs;
    const dgB = mb.gm - mb.gs;
    if (dgB !== dgA) return dgB - dgA;
    if (mb.gm !== ma.gm) return mb.gm - ma.gm;
    if (a.GS !== b.GS) return a.GS - b.GS;
    return a.name.localeCompare(b.name);
  });
}

// ---------------------------------------------------------------------------
// Avaliação e Snake Draft — Jogo Singular
// ---------------------------------------------------------------------------

/**
 * Calcula o rating global de um jogador (média dos 6 atributos, 0–5).
 * @param {object} player - Jogador da base de dados global
 * @returns {number} rating arredondado a 1 casa decimal
 */
export function getPlayerRating(player) {
  if (!player || !player.atributos) return 0;
  const a = player.atributos;
  const vals = [a.velocidade, a.finalizacao, a.passe, a.drible, a.defesa, a.fisico];
  const sum = vals.reduce((s, v) => s + (Number(v) || 0), 0);
  return Math.round((sum / 6) * 10) / 10;
}

/**
 * Calcula o rating total de uma equipa (soma dos ratings individuais).
 * @param {object[]} players
 * @returns {number}
 */
export function getTeamTotalRating(players) {
  return Math.round(players.reduce((s, p) => s + getPlayerRating(p), 0) * 10) / 10;
}

/**
 * Divide os jogadores em 2 equipas pelo método Snake Draft.
 *
 * Ordena por rating decrescente e aplica o padrão:
 *   Pick 1 → A, Pick 2 → B, Pick 3 → B, Pick 4 → A, Pick 5 → A, ...
 * (A, BB, AA, BB, AA, ...)
 *
 * @param {object[]} players - Lista de jogadores selecionados
 * @returns {{ equipaA: object[], equipaB: object[] }}
 */
export function snakeDraft(players) {
  const sorted = players.slice().sort((a, b) => getPlayerRating(b) - getPlayerRating(a));
  const equipaA = [];
  const equipaB = [];

  // Padrão de picks: A=0, B=1, B=1, A=0, A=0, B=1, B=1, ...
  // pick index 0→A, 1→B, 2→B, 3→A, 4→A, 5→B, 6→B, ...
  sorted.forEach((player, i) => {
    const cycle = Math.floor(i / 2) % 2; // 0 ou 1, alterna a cada 2 picks
    const pickA = (i === 0) || (i % 2 === 0 && cycle === 0) || (i % 2 !== 0 && cycle === 1);
    if (pickA) {
      equipaA.push(player);
    } else {
      equipaB.push(player);
    }
  });

  return { equipaA, equipaB };
}
