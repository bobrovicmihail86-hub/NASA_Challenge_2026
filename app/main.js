/* Space Mission Design — application bootstrap and event handling. */
(function (root) {
  'use strict';

  const APP = root.APP;
  const C = root.CONFIG;
  const $ = function (id) { return document.getElementById(id); };

  function syncHeader() {
    const seed = $('seedInput');
    const len = $('lengthSelect');
    if (seed) seed.value = APP.seed;
    if (len) len.value = APP.state.maxSteps;
  }

  function init() {
    const params = new URLSearchParams(root.location ? root.location.search : '');
    const seed = Number(params.get('seed')) || 20260101;
    const maxSteps = Number(params.get('steps')) || C.campaign.steps;
    if (!APP.load()) {
      APP.newCampaign(seed, maxSteps);
    }
    APP.ui.chatSeen = APP.chat.length;
    syncHeader();
    APP.renderAll();
    if (!APP.storageOk) {
      setTimeout(function () {
        APP.toast('localStorage is unavailable (file://). Use Export/Import to keep the save.', 'mid');
      }, 500);
    }
  }

  document.addEventListener('click', function (e) {
    const modalBtn = e.target.closest('[data-modal-index]');
    if (modalBtn) {
      APP.handleModalClick(Number(modalBtn.dataset.modalIndex));
      return;
    }
    if (e.target.id === 'modalBackdrop') {
      APP.closeModal();
      return;
    }

    const roleBtn = e.target.closest('[data-role]');
    if (roleBtn && roleBtn.tagName === 'BUTTON') {
      APP.dispatch('set-role', { role: roleBtn.dataset.role });
      return;
    }
    const panelBtn = e.target.closest('[data-panel]');
    if (panelBtn) {
      APP.dispatch('toggle-panel', { panel: panelBtn.dataset.panel });
      return;
    }

    const missionCard = e.target.closest('[data-select-mission]');
    if (missionCard) {
      APP.dispatch('select-mission', { missionId: missionCard.dataset.selectMission });
      return;
    }

    const instBtn = e.target.closest('[data-instrument]');
    if (instBtn && !instBtn.disabled) {
      const build = APP.ensureBuild(APP.selectedMissionId);
      if (!build) return;
      const id = instBtn.dataset.instrument;
      const delta = Number(instBtn.dataset.delta) || 0;
      const list = (build.sel.instruments || []).slice();
      const row = list.find(function (x) { return x.id === id; });
      if (row) row.count = Math.max(0, row.count + delta);
      else if (delta > 0) list.push({ id: id, count: delta });
      const cleaned = list.filter(function (x) { return x.count > 0; });
      APP.dispatch('patch-scientist', { missionId: APP.selectedMissionId, patch: { instruments: cleaned } });
      return;
    }

    const quick = e.target.closest('[data-quick]');
    if (quick) {
      const input = $('chatInput');
      if (input) { input.value = quick.dataset.quick; input.focus(); }
      return;
    }

    const btn = e.target.closest('[data-act]');
    if (!btn || btn.disabled) return;
    const act = btn.dataset.act;
    const id = btn.dataset.mission;
    let res = null;

    if (act === 'new-campaign') res = APP.dispatch('new-campaign');
    else if (act === 'set-role') res = APP.dispatch('set-role', { role: btn.dataset.role });
    else if (act === 'select-mission') res = APP.dispatch('select-mission', { missionId: id });
    else if (act === 'accept') res = APP.dispatch('accept', { missionId: id });
    else if (act === 'launch') res = APP.dispatch('launch', { missionId: id });
    else if (act === 'launch-all') res = APP.dispatch('launch-all');
    else if (act === 'approve-exp') {
      res = APP.dispatch('approve-exp', { scope: btn.dataset.scope, key: btn.dataset.key });
    }
    else if (act === 'next-step') res = APP.dispatch('next-step');
    else if (act === 'finish') res = APP.dispatch('finish');
    else if (act === 'recommend') res = APP.dispatch('recommend', { missionId: id || APP.selectedMissionId });
    else if (act === 'confirm-engineer' || act === 'confirm-scientist') {
      res = APP.dispatch(act, { missionId: id || APP.selectedMissionId });
    } else if (act === 'overtime' || act === 'close-flight') {
      res = APP.dispatch(act, { missionId: id });
    } else if (act === 'prep-hire' || act === 'prep-mcs' || act === 'prep-pr' ||
      act === 'prep-factory' || act === 'prep-school') {
      res = APP.dispatch(act);
    } else if (act === 'ground') {
      const gc = $('gcClass');
      res = APP.dispatch('ground', { cardId: btn.dataset.card, cls: gc ? gc.value : 'camera' });
    } else if (act === 'test-rocket') {
      res = APP.dispatch('test-rocket', { rocketId: btn.dataset.rocket });
    } else if (act === 'test-stand') {
      const cls = $('testStandClass');
      const card = $('testStandCard');
      res = APP.dispatch('test-stand', { cls: cls ? cls.value : 'camera', cardId: card && card.value ? card.value : null });
    } else if (act === 'test-instrument') {
      const ins = $('testInstrumentId');
      res = APP.dispatch('test-instrument', { rocketId: btn.dataset.rocket, instrumentId: ins ? ins.value : null });
    } else if (act === 'tech-rocket' || act === 'tech-instrument') {
      res = APP.dispatch(act, { cls: btn.dataset.cls });
    } else if (act === 'standardize') {
      res = APP.dispatch('standardize', { cardId: btn.dataset.card });
    } else if (act === 'save') {
      res = APP.dispatch('save');
    } else if (act === 'export') {
      res = APP.dispatch('export');
    } else if (act === 'undo') {
      res = APP.dispatch('undo');
    }
    if (res) APP.handleDispatchResult(res);
  });

  document.addEventListener('change', function (e) {
    const el = e.target;
    if (el.id === 'missionSwitch') {
      APP.dispatch('select-mission', { missionId: el.value });
      return;
    }
    if (el.id === 'importFile') {
      const file = el.files && el.files[0];
      if (!file) return;
      file.text().then(function (text) {
        const res = APP.dispatch('import', { text: text });
        APP.handleDispatchResult(res);
        syncHeader();
      });
      el.value = '';
      return;
    }
    const bind = el.closest('[data-bind]');
    if (bind) {
      const role = bind.dataset.bindRole;
      const missionId = bind.dataset.bindMission || APP.selectedMissionId;
      const field = bind.dataset.bind;
      const isBool = bind.type === 'checkbox';
      const value = isBool ? !!bind.checked : (bind.value === '' ? null : bind.value);
      const patch = {};
      patch[field] = value;
      const action = role === 'engineer' ? 'patch-engineer' : 'patch-scientist';
      const res = APP.dispatch(action, { missionId: missionId, patch: patch });
      APP.handleDispatchResult(res);
      return;
    }
    const phys = el.closest('[data-physical]');
    if (phys) {
      const build = APP.ensureBuild(APP.selectedMissionId);
      if (!build) return;
      const idCard = phys.dataset.physical;
      const set = (build.sel.physical || []).slice();
      const idx = set.indexOf(idCard);
      if (phys.checked && idx === -1) set.push(idCard);
      if (!phys.checked && idx !== -1) set.splice(idx, 1);
      const res = APP.dispatch('patch-engineer', {
        missionId: APP.selectedMissionId,
        patch: { physical: set }
      });
      APP.handleDispatchResult(res);
    }
  });

  const chatForm = $('chatForm');
  if (chatForm) {
    chatForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const input = $('chatInput');
      if (!input) return;
      const text = input.value.trim();
      if (!text) return;
      APP.dispatch('chat', { text: text });
      input.value = '';
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    const backdrop = $('modalBackdrop');
    if (backdrop && !backdrop.hidden) APP.closeModal();
    else if (APP.ui.chatOpen) APP.dispatch('toggle-panel', { panel: 'chat' });
  });

  init();
})(typeof globalThis !== 'undefined' ? globalThis : this);
