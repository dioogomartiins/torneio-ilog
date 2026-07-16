import { flashError, flashSaved, flashBackup, showToast, openConfirm } from './ui.js';
import { renderAll } from './ui.js';
import { generateSchedule } from './algorithms.js';
import { getTeamName } from './utils.js';

export var SNAPSHOT_VERSION = 4; // Atualizado para suportar Player Profiles sem emoji

      // GESTÃO DO TEMA (DARK MODE)
      export let currentTheme = localStorage.getItem('torneio_theme') || 'light';
export function setCurrentTheme(t) { currentTheme = t; }

export function ensureTeamsStructure(arr) {
        var out = (arr || []).slice(0, 32).map(function (t, i) {
          if (typeof t === 'object' && t !== null && t.name !== undefined) {
             var obj = { name: t.name, color: t.color || '#2F7A4F' };
             if (t.group !== undefined) obj.group = t.group;
             return obj;
          }
          return { name: (typeof t === 'string' ? t : ('Equipa ' + (i + 1))), color: '#2F7A4F' };
        });
        while (out.length < 32) {
          out.push({ name: '', color: '#2F7A4F' });
        }
        return out;
      }

export var state = {
        config: null, teams: null, squads: null,
        schedule: [], roundsMeta: [], scheduleTeamCount: 0, scheduleVoltas: 0,
        results: {}
      };

      var memoryFallback = {};
      var storageWarned = false;
      var noStorage = (typeof window.localStorage === 'undefined');

      export function warnNoStorage() {
        if (storageWarned) return;
        storageWarned = true;
        showToast('O teu navegador bloqueia a gravação — os dados não serão guardados.', 'error');
      }

      export async function storageGet(key) {
        if (noStorage) { warnNoStorage(); return (key in memoryFallback) ? { value: memoryFallback[key] } : null; }
        try {
          var result = window.localStorage.getItem('torneio_ilog_' + key);
          return result !== null ? { value: result } : null;
        } catch (e) { return null; }
      }

      export async function storageSet(key, value) {
        if (noStorage) { warnNoStorage(); memoryFallback[key] = value; return { value: value }; }
        try {
          window.localStorage.setItem('torneio_ilog_' + key, value);
          return { value: value };
        } catch (e) { flashError(); return null; }
      }

      export function defaultConfig() {
        return {
          nome: 'Torneio 2026', numEquipas: 8, numGrupos: 1, numVoltas: 2,
          pontosVitoria: 3, pontosEmpate: 1, pontosDerrota: 0, bonusGoleada: 1, golosGoleada: 3,
          mataMata: false, numPlayoffTeams: 4
        };
      }
      export function defaultTeams() { return ensureTeamsStructure([]); }
      export function defaultSquads() {
        var arr = []; for (var i = 0; i < 32; i++) arr.push([]); return arr;
      }
      export function ensureSquadsLength(arr) {
        var out = (arr || []).map(function (s) { return Array.isArray(s) ? s : []; }).slice(0, 32);
        while (out.length < 32) out.push([]); return out;
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
          results: JSON.parse(JSON.stringify(state.results))
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
      }

      export async function persistBackup() {
        var snap = buildSnapshot();
        await storageSet('backup', JSON.stringify(snap));
        flashBackup(snap.exportedAt);
      }
      export async function persistConfigTeams() {
        await storageSet('config-teams', JSON.stringify({ config: state.config, teams: state.teams, squads: state.squads }));
        flashSaved(); await persistBackup();
      }
      export async function persistSchedule() {
        await storageSet('schedule', JSON.stringify({ schedule: state.schedule, roundsMeta: state.roundsMeta, scheduleTeamCount: state.scheduleTeamCount, scheduleVoltas: state.scheduleVoltas }));
        flashSaved(); await persistBackup();
      }
      export async function persistResults() {
        await storageSet('results', JSON.stringify(state.results));
        flashSaved(); await persistBackup();
      }

      export function applyGeneratedSchedule(numEquipas, numVoltas, randomizeGroups) {
        var groupsIndices = [];
        var nGrupos = state.config.numGrupos || 1;
        var indices = []; for (var i = 0; i < numEquipas; i++) indices.push(i);

        if (randomizeGroups) {
          for (var i = indices.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var temp = indices[i];
            indices[i] = indices[j];
            indices[j] = temp;
          }
        } else {
          var byGroup = {};
          for (var i = 0; i < numEquipas; i++) {
            var g = state.teams[i].group || 0;
            if (g >= nGrupos) g = nGrupos - 1;
            byGroup[g] = byGroup[g] || [];
            byGroup[g].push(i);
          }
          indices = [];
          for (var g = 0; g < nGrupos; g++) {
            if (byGroup[g]) indices = indices.concat(byGroup[g]);
          }
        }

        var teamsPerGroup = Math.ceil(numEquipas / nGrupos);
        for (var g = 0; g < nGrupos; g++) {
          var chunk = indices.slice(g * teamsPerGroup, (g + 1) * teamsPerGroup);
          groupsIndices.push(chunk);
          chunk.forEach(function(idx) {
             if (state.teams[idx]) state.teams[idx].group = g;
          });
        }

        var out = generateSchedule(groupsIndices, numVoltas);
        state.schedule = out.schedule;
        state.roundsMeta = out.roundsMeta;
        state.scheduleTeamCount = numEquipas;
        state.scheduleVoltas = numVoltas;
      }

      export async function loadState() {
        var ct = null, sc = null, rs = null, bk = null;
        try { var r1 = await storageGet('config-teams'); ct = r1 ? JSON.parse(r1.value) : null; } catch (e) { ct = null; }
        try { var r2 = await storageGet('schedule'); sc = r2 ? JSON.parse(r2.value) : null; } catch (e) { sc = null; }
        try { var r3 = await storageGet('results'); rs = r3 ? JSON.parse(r3.value) : null; } catch (e) { rs = null; }
        try { var r4 = await storageGet('backup'); bk = r4 ? JSON.parse(r4.value) : null; } catch (e) { bk = null; }

        var hasIndividualData = ct && ct.config && ct.teams;

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
            await persistSchedule();
          }
          state.results = rs || {};
        } else if (validateSnapshot(bk)) {
          applySnapshot(bk);
          await storageSet('config-teams', JSON.stringify({ config: state.config, teams: state.teams, squads: state.squads }));
          await storageSet('schedule', JSON.stringify({ schedule: state.schedule, roundsMeta: state.roundsMeta, scheduleTeamCount: state.scheduleTeamCount, scheduleVoltas: state.scheduleVoltas }));
          await storageSet('results', JSON.stringify(state.results));
          showToast('Estado restaurado a partir do backup automático.', 'ok');
          flashBackup(bk.exportedAt);
        } else {
          state.config = defaultConfig();
          state.teams = defaultTeams();
          state.squads = defaultSquads();
          applyGeneratedSchedule(state.config.numEquipas, state.config.numVoltas, false);
          await persistConfigTeams();
          await persistSchedule();
          await persistResults();
        }
        if (bk && bk.exportedAt) flashBackup(bk.exportedAt);
      }

      export function exportJSON() {
        var snap = buildSnapshot();
        var blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var safeName = (state.config.nome || 'torneio').replace(/[^a-z0-9_\-]/gi, '_').toLowerCase();
        var ts = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
        var a = document.createElement('a'); a.href = url; a.download = safeName + '_' + ts + '.json';
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        showToast('Torneio exportado com sucesso!', 'ok');
      }

      export function importJSON(file) {
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function (e) {
          try { var snap = JSON.parse(e.target.result); } catch (err) { showToast('Ficheiro inválido.', 'error'); return; }
          if (!validateSnapshot(snap)) { showToast('Estrutura inválida.', 'error'); return; }
          openConfirm('Importar torneio', 'Isto vai substituir TODO o estado atual. Continuar?', async function () {
            applySnapshot(snap);
            await storageSet('config-teams', JSON.stringify({ config: state.config, teams: state.teams, squads: state.squads }));
            await storageSet('schedule', JSON.stringify({ schedule: state.schedule, roundsMeta: state.roundsMeta, scheduleTeamCount: state.scheduleTeamCount, scheduleVoltas: state.scheduleVoltas }));
            await storageSet('results', JSON.stringify(state.results));
            await persistBackup(); renderAll(); showToast('Torneio importado com sucesso!', 'ok');
          });
        };
        reader.readAsText(file);
      }
