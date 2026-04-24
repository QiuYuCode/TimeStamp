'use strict';

const PRESETS = {
  'black-gold': { accentColor: '#d4af37', bgColor: '#0a0a0a', surfaceColor: '#161616', textColor: '#f5f5f5' },
  'midnight':   { accentColor: '#7c9cff', bgColor: '#0b1020', surfaceColor: '#141a30', textColor: '#eef2ff' },
  'forest':     { accentColor: '#38d39f', bgColor: '#0b1a12', surfaceColor: '#142319', textColor: '#e8fff3' },
  'rose':       { accentColor: '#ff6b9d', bgColor: '#1a0b12', surfaceColor: '#241420', textColor: '#ffeef4' },
  'ivory':      { accentColor: '#b8860b', bgColor: '#f7f5ef', surfaceColor: '#ffffff', textColor: '#1a1a1a' }
};

const DEFAULT_SETTINGS = { ...PRESETS['black-gold'], theme: 'black-gold', displayRefreshHz: 30 };

const state = {
  data: null,
  currentGroupId: 'default',
  timer: {
    running: false,
    startedAt: 0,
    elapsedBeforeStart: 0,
    tickHandle: null,
    lastDisplayPaintAt: 0,
    laps: []
  },
  pendingSaveBeforeReset: false
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ---------- Init ----------
async function init() {
  bindSystemDialog();
  state.data = await window.api.loadData();
  ensureDefaults();
  applyTheme(state.data.settings);
  bindWindowControls();
  bindTimerControls();
  bindSidebar();
  bindSettingsModal();
  bindSaveModal();
  bindGroupModal();
  bindDetailModal();
  bindShortcuts();
  renderAll();
  startTicker();
}

function ensureDefaults() {
  state.data.settings = { ...DEFAULT_SETTINGS, ...(state.data.settings || {}) };
  state.data.settings.displayRefreshHz = normalizeRefreshHz(state.data.settings.displayRefreshHz);
  if (!state.data.groups?.length) {
    state.data.groups = [{ id: 'default', name: '默认分组', createdAt: Date.now() }];
  }
  if (!state.data.sessions) state.data.sessions = [];
  if (!state.data.groups.find((g) => g.id === state.currentGroupId)) {
    state.currentGroupId = state.data.groups[0].id;
  }
}

async function persist() {
  await window.api.saveData(state.data);
}

// ---------- Theme ----------
function applyTheme(settings) {
  const s = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  document.documentElement.style.setProperty('--bg', s.bgColor);
  document.documentElement.style.setProperty('--surface', s.surfaceColor);
  document.documentElement.style.setProperty('--surface-2', shade(s.surfaceColor, 6));
  document.documentElement.style.setProperty('--border', shade(s.surfaceColor, 14));
  document.documentElement.style.setProperty('--text', s.textColor);
  document.documentElement.style.setProperty('--text-dim', hexWithAlpha(s.textColor, 0.55));
  document.documentElement.style.setProperty('--accent', s.accentColor);
  document.documentElement.style.setProperty('--accent-soft', hexWithAlpha(s.accentColor, 0.15));
  document.documentElement.style.setProperty('--accent-glow', hexWithAlpha(s.accentColor, 0.35));
}

function shade(hex, percent) {
  const { r, g, b } = hexToRgb(hex);
  const p = percent / 100;
  const isLight = (r + g + b) / 3 > 127;
  const adj = (v) => {
    const t = isLight ? 0 : 255;
    return Math.round(v + (t - v) * p);
  };
  return rgbToHex(adj(r), adj(g), adj(b));
}

function hexWithAlpha(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16)
  };
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

// ---------- Window controls ----------
function bindWindowControls() {
  $('#btn-min').addEventListener('click', () => window.api.minimize());
  $('#btn-max').addEventListener('click', () => window.api.toggleMaximize());
  $('#btn-fullscreen').addEventListener('click', () => requestToggleFullScreen());
  $('#btn-close').addEventListener('click', () => window.api.close());
  $('#btn-quit').addEventListener('click', async () => {
    if (state.timer.running || state.timer.elapsedBeforeStart > 0) {
      const ok = await showConfirmDialog({
        title: '退出确认',
        message: '当前有未保存的计时数据，确定要退出吗？',
        confirmText: '退出'
      });
      if (!ok) return;
    }
    window.api.quit();
  });
  bindFullscreenEdgeReveal();

  window.api.onWindowState((s) => applyWindowState(s));
  window.api.getWindowState().then(applyWindowState).catch(() => {});
}

let fsLastPointerY = 999;
function bindFullscreenEdgeReveal() {
  const titlebar = document.querySelector('.titlebar');
  if (!titlebar) return;
  document.addEventListener('mousemove', (e) => {
    fsLastPointerY = e.clientY;
    if (!document.body.classList.contains('is-fullscreen')) return;
    if (e.clientY <= 3) {
      document.body.classList.add('show-fs-titlebar');
      return;
    }
    if (e.clientY > 60 && !titlebar.matches(':hover')) {
      document.body.classList.remove('show-fs-titlebar');
    }
  });
  titlebar.addEventListener('mouseleave', () => {
    if (!document.body.classList.contains('is-fullscreen')) return;
    if (fsLastPointerY > 60) {
      document.body.classList.remove('show-fs-titlebar');
    }
  });
}

let fsPending = false;
function requestExitFullScreen() {
  if (fsPending) return;
  if (!document.body.classList.contains('is-fullscreen')) return;
  fsPending = true;
  document.body.classList.remove('is-fullscreen');
  document.body.classList.remove('show-fs-titlebar');
  updateFullscreenButton(false);
  Promise.resolve(window.api.exitFullScreen())
    .catch(() => {})
    .finally(() => { setTimeout(() => { fsPending = false; }, 200); });
}
function requestToggleFullScreen() {
  if (fsPending) return;
  fsPending = true;
  const next = !document.body.classList.contains('is-fullscreen');
  document.body.classList.toggle('is-fullscreen', next);
  document.body.classList.toggle('show-fs-titlebar', false);
  updateFullscreenButton(next);
  Promise.resolve(window.api.toggleFullScreen())
    .catch(() => {})
    .finally(() => { setTimeout(() => { fsPending = false; }, 200); });
}

function updateFullscreenButton(isFull) {
  const btn = $('#btn-fullscreen');
  if (!btn) return;
  btn.title = isFull ? '退出全屏 (F11 / Esc)' : '全屏 (F11)';
}

function applyWindowState(s) {
  if (!s) return;
  document.body.classList.toggle('is-maximized', !!s.maximized);
  document.body.classList.toggle('is-fullscreen', !!s.fullscreen);
  if (!s.fullscreen) {
    document.body.classList.remove('show-fs-titlebar');
  }
  updateFullscreenButton(!!s.fullscreen);
}

// ---------- Timer ----------
function currentElapsed() {
  if (state.timer.running) {
    return state.timer.elapsedBeforeStart + (performance.now() - state.timer.startedAt);
  }
  return state.timer.elapsedBeforeStart;
}

function formatTime(ms) {
  if (ms < 0) ms = 0;
  const totalMs = Math.floor(ms);
  const h = Math.floor(totalMs / 3600000);
  const m = Math.floor((totalMs % 3600000) / 60000);
  const s = Math.floor((totalMs % 60000) / 1000);
  const milli = totalMs % 1000;
  return {
    hh: String(h).padStart(2, '0'),
    mm: String(m).padStart(2, '0'),
    ss: String(s).padStart(2, '0'),
    ms: String(milli).padStart(3, '0'),
    str: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(milli).padStart(3, '0')}`
  };
}

function startTicker() {
  const tick = (now) => {
    if (state.timer.running) {
      const minGap = 1000 / normalizeRefreshHz(state.data.settings.displayRefreshHz);
      if ((now - state.timer.lastDisplayPaintAt) >= minGap) {
        state.timer.lastDisplayPaintAt = now;
        renderTimerDisplay();
      }
    }
    state.timer.tickHandle = requestAnimationFrame(tick);
  };
  state.timer.tickHandle = requestAnimationFrame(tick);
}

function normalizeRefreshHz(value) {
  const allowed = [10, 20, 30, 60];
  const n = Number(value);
  if (!Number.isFinite(n)) return 30;
  return allowed.includes(n) ? n : 30;
}

function renderTimerDisplay(force = false) {
  if (force) {
    state.timer.lastDisplayPaintAt = 0;
  }
  const t = formatTime(currentElapsed());
  const d = $('#timer-display');
  d.querySelector('.t-hh').textContent = t.hh;
  d.querySelectorAll('.t-sep')[0].textContent = ':';
  d.querySelector('.t-mm').textContent = t.mm;
  d.querySelectorAll('.t-sep')[1].textContent = ':';
  d.querySelector('.t-ss').textContent = t.ss;
  d.querySelector('.t-ms').textContent = '.' + t.ms;
}

function bindTimerControls() {
  $('#btn-start').addEventListener('click', toggleStart);
  $('#btn-lap').addEventListener('click', recordLap);
  $('#btn-reset').addEventListener('click', resetTimer);
  $('#btn-save').addEventListener('click', openSaveModal);
}

function toggleStart() {
  if (state.timer.running) {
    state.timer.elapsedBeforeStart += performance.now() - state.timer.startedAt;
    state.timer.running = false;
  } else {
    state.timer.startedAt = performance.now();
    state.timer.lastDisplayPaintAt = 0;
    state.timer.running = true;
  }
  renderTimerState();
  renderTimerDisplay(true);
}

function recordLap() {
  if (!state.timer.running) return;
  const total = currentElapsed();
  const prev = state.timer.laps.length ? state.timer.laps[state.timer.laps.length - 1].totalMs : 0;
  state.timer.laps.push({
    index: state.timer.laps.length + 1,
    totalMs: total,
    splitMs: total - prev,
    at: Date.now()
  });
  renderLaps();
}

async function resetTimer() {
  if (state.timer.running) {
    state.timer.elapsedBeforeStart += performance.now() - state.timer.startedAt;
    state.timer.running = false;
  }
  if (state.timer.elapsedBeforeStart > 0 || state.timer.laps.length > 0) {
    const ok = await showConfirmDialog({
      title: '复位确认',
      message: '确定要复位吗？未保存的计时数据将被丢弃。\n\n建议先点"保存"将本次计时存入历史。',
      confirmText: '复位',
      danger: true
    });
    if (!ok) {
      renderTimerState();
      return;
    }
  }
  state.timer.elapsedBeforeStart = 0;
  state.timer.startedAt = 0;
  state.timer.laps = [];
  renderTimerState();
  renderTimerDisplay(true);
  renderLaps();
}

function renderTimerState() {
  const startBtn = $('#btn-start');
  const lapBtn = $('#btn-lap');
  const resetBtn = $('#btn-reset');
  const saveBtn = $('#btn-save');
  const stateEl = $('#timer-state');

  stateEl.classList.remove('running', 'paused');

  const hasData = state.timer.elapsedBeforeStart > 0 || state.timer.laps.length > 0 || state.timer.running;

  if (state.timer.running) {
    startBtn.textContent = '暂停';
    startBtn.classList.add('running');
    stateEl.classList.add('running');
    stateEl.textContent = '计时中';
  } else if (state.timer.elapsedBeforeStart > 0) {
    startBtn.textContent = '继续';
    startBtn.classList.remove('running');
    stateEl.classList.add('paused');
    stateEl.textContent = '已暂停';
  } else {
    startBtn.textContent = '开始';
    startBtn.classList.remove('running');
    stateEl.textContent = '就绪';
  }

  lapBtn.disabled = !state.timer.running;
  resetBtn.disabled = !hasData;
  saveBtn.disabled = state.timer.running || state.timer.elapsedBeforeStart === 0;
}

// ---------- Laps ----------
function renderLaps() {
  const list = $('#laps-list');
  const count = $('#laps-count');
  count.textContent = state.timer.laps.length;

  if (!state.timer.laps.length) {
    list.innerHTML = '<div class="empty-hint">点击"计次"或按 <kbd>S</kbd> 记录分段时间</div>';
    return;
  }

  const rows = [...state.timer.laps].reverse().map((lap) => {
    return `
      <div class="lap-row">
        <div class="lap-idx">#${lap.index}</div>
        <div class="lap-split">+${formatTime(lap.splitMs).str}</div>
        <div class="lap-total">${formatTime(lap.totalMs).str}</div>
      </div>
    `;
  }).join('');
  list.innerHTML = rows;
}

// ---------- Sidebar / Groups ----------
function bindSidebar() {
  $('#btn-add-group').addEventListener('click', () => openGroupModal());
}

function renderGroups() {
  const list = $('#group-list');
  const counts = sessionCountByGroup();
  list.innerHTML = state.data.groups.map((g) => {
    const c = counts[g.id] || 0;
    const active = g.id === state.currentGroupId ? 'active' : '';
    const canDelete = g.id !== 'default' ? `<button class="gi-del" data-del="${g.id}" title="删除分组">&#10005;</button>` : '';
    return `
      <li class="group-item ${active}" data-gid="${g.id}">
        <span class="gi-name" title="${escapeHtml(g.name)}">${escapeHtml(g.name)}</span>
        <span class="gi-count">${c}</span>
        ${canDelete}
      </li>
    `;
  }).join('');

  list.querySelectorAll('.group-item').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.matches('[data-del]')) return;
      state.currentGroupId = el.dataset.gid;
      renderGroups();
      renderCurrentGroupLabel();
      renderHistory();
    });
  });
  list.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteGroup(btn.dataset.del);
    });
  });
}

function sessionCountByGroup() {
  const m = {};
  state.data.sessions.forEach((s) => { m[s.groupId] = (m[s.groupId] || 0) + 1; });
  return m;
}

async function deleteGroup(id) {
  const g = state.data.groups.find((x) => x.id === id);
  if (!g) return;
  const count = sessionCountByGroup()[id] || 0;
  const msg = count > 0
    ? `删除分组「${g.name}」将同时删除其下 ${count} 条历史记录，确定继续？`
    : `确定删除分组「${g.name}」？`;
  const ok = await showConfirmDialog({
    title: '删除分组',
    message: msg,
    confirmText: '删除',
    danger: true
  });
  if (!ok) return;
  state.data.groups = state.data.groups.filter((x) => x.id !== id);
  state.data.sessions = state.data.sessions.filter((s) => s.groupId !== id);
  if (state.currentGroupId === id) state.currentGroupId = state.data.groups[0]?.id || 'default';
  await persist();
  renderAll();
  toast('分组已删除');
}

function renderCurrentGroupLabel() {
  const g = state.data.groups.find((x) => x.id === state.currentGroupId);
  $('#current-group-label').textContent = g?.name || '默认分组';
}

// ---------- History ----------
function renderHistory() {
  const list = $('#history-list');
  const filter = $('#history-filter').value;
  let sessions = [...state.data.sessions].sort((a, b) => b.createdAt - a.createdAt);
  if (filter === '__current__') {
    sessions = sessions.filter((s) => s.groupId === state.currentGroupId);
  }
  if (!sessions.length) {
    list.innerHTML = '<div class="empty-hint">暂无历史记录</div>';
    return;
  }
  list.innerHTML = sessions.map((s) => {
    const g = state.data.groups.find((x) => x.id === s.groupId);
    return `
      <div class="history-item" data-sid="${s.id}">
        <div class="hi-top">
          <span class="hi-name" title="${escapeHtml(s.name)}">${escapeHtml(s.name)}</span>
          <span class="hi-group">${escapeHtml(g?.name || '未分组')}</span>
        </div>
        <div class="hi-time">${formatTime(s.totalMs).str}</div>
        <div class="hi-meta">
          <span>${new Date(s.createdAt).toLocaleString('zh-CN')}</span>
          <span>${s.laps.length} 次计次</span>
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.history-item').forEach((el) => {
    el.addEventListener('click', () => openDetailModal(el.dataset.sid));
  });
}

$('#history-filter').addEventListener('change', renderHistory);

// ---------- Settings modal ----------
function bindSettingsModal() {
  $('#btn-settings').addEventListener('click', openSettingsModal);
  $$('#settings-modal [data-close-modal]').forEach((el) => el.addEventListener('click', () => closeModal('#settings-modal')));

  $$('#settings-modal .preset').forEach((btn) => {
    btn.addEventListener('click', () => {
      const k = btn.dataset.preset;
      const preset = PRESETS[k];
      state.data.settings = { ...state.data.settings, ...preset, theme: k };
      applyTheme(state.data.settings);
      syncColorInputs();
      persist();
      toast('已切换主题');
    });
  });

  const bind = (id, key) => {
    $(id).addEventListener('input', (e) => {
      state.data.settings[key] = e.target.value;
      state.data.settings.theme = 'custom';
      applyTheme(state.data.settings);
    });
    $(id).addEventListener('change', () => persist());
  };
  bind('#input-accent', 'accentColor');
  bind('#input-bg', 'bgColor');
  bind('#input-surface', 'surfaceColor');
  bind('#input-text', 'textColor');
  $('#input-refresh-rate').addEventListener('change', async (e) => {
    state.data.settings.displayRefreshHz = normalizeRefreshHz(e.target.value);
    await persist();
    toast(`已切换刷新率：${state.data.settings.displayRefreshHz}Hz`);
  });

  $('#btn-reset-theme').addEventListener('click', () => {
    state.data.settings = { ...DEFAULT_SETTINGS };
    applyTheme(state.data.settings);
    syncColorInputs();
    persist();
    toast('已恢复默认主题');
  });
}

function openSettingsModal() {
  syncColorInputs();
  $('#settings-modal').hidden = false;
}

function syncColorInputs() {
  $('#input-accent').value = state.data.settings.accentColor;
  $('#input-bg').value = state.data.settings.bgColor;
  $('#input-surface').value = state.data.settings.surfaceColor;
  $('#input-text').value = state.data.settings.textColor;
  $('#input-refresh-rate').value = String(normalizeRefreshHz(state.data.settings.displayRefreshHz));
}

// ---------- Group modal ----------
function bindGroupModal() {
  $$('#group-modal [data-close-modal]').forEach((el) => el.addEventListener('click', () => closeModal('#group-modal')));
  $('#btn-confirm-group').addEventListener('click', async () => {
    const name = $('#input-group-name').value.trim();
    if (!name) { toast('请输入分组名称'); return; }
    const g = { id: 'g_' + Date.now().toString(36), name, createdAt: Date.now() };
    state.data.groups.push(g);
    state.currentGroupId = g.id;
    await persist();
    closeModal('#group-modal');
    $('#input-group-name').value = '';
    renderAll();
    toast('分组已创建');
  });
}

function openGroupModal() {
  $('#input-group-name').value = '';
  $('#group-modal').hidden = false;
  setTimeout(() => $('#input-group-name').focus(), 50);
}

// ---------- Save modal ----------
function bindSaveModal() {
  $$('#save-modal [data-close-modal]').forEach((el) => el.addEventListener('click', () => closeModal('#save-modal')));
  $('#btn-confirm-save').addEventListener('click', saveSession);
}

function openSaveModal() {
  if (state.timer.elapsedBeforeStart === 0 && state.timer.laps.length === 0) {
    toast('没有可保存的计时');
    return;
  }
  const total = state.timer.elapsedBeforeStart;
  $('#save-total').textContent = formatTime(total).str;
  $('#save-laps').textContent = state.timer.laps.length;
  const select = $('#input-session-group');
  select.innerHTML = state.data.groups.map((g) => `<option value="${g.id}" ${g.id === state.currentGroupId ? 'selected' : ''}>${escapeHtml(g.name)}</option>`).join('');
  $('#input-session-name').value = '';
  $('#save-modal').hidden = false;
  setTimeout(() => $('#input-session-name').focus(), 50);
}

async function saveSession() {
  const name = $('#input-session-name').value.trim() || `计时 ${new Date().toLocaleString('zh-CN')}`;
  const groupId = $('#input-session-group').value;
  const session = {
    id: 's_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name,
    groupId,
    createdAt: Date.now(),
    totalMs: state.timer.elapsedBeforeStart,
    laps: state.timer.laps.map((l) => ({ ...l }))
  };
  state.data.sessions.push(session);
  await persist();
  closeModal('#save-modal');
  state.timer.elapsedBeforeStart = 0;
  state.timer.startedAt = 0;
  state.timer.laps = [];
  renderTimerState();
  renderTimerDisplay();
  renderLaps();
  renderGroups();
  renderHistory();
  toast('已保存到「' + (state.data.groups.find((g) => g.id === groupId)?.name) + '」');
}

// ---------- Detail modal ----------
let currentDetailId = null;

function bindDetailModal() {
  $$('#detail-modal [data-close-modal]').forEach((el) => el.addEventListener('click', () => closeModal('#detail-modal')));
  $('#btn-restore-session').addEventListener('click', async () => {
    if (!currentDetailId) return;
    const s = state.data.sessions.find((x) => x.id === currentDetailId);
    if (!s) return;
    await restoreSessionToCurrent(s);
  });
  $('#btn-delete-session').addEventListener('click', async () => {
    if (!currentDetailId) return;
    const ok = await showConfirmDialog({
      title: '删除记录',
      message: '确定要删除这条记录吗？',
      confirmText: '删除',
      danger: true
    });
    if (!ok) return;
    state.data.sessions = state.data.sessions.filter((s) => s.id !== currentDetailId);
    await persist();
    closeModal('#detail-modal');
    renderGroups();
    renderHistory();
    toast('记录已删除');
  });
}

function openDetailModal(sid) {
  const s = state.data.sessions.find((x) => x.id === sid);
  if (!s) return;
  currentDetailId = sid;
  const g = state.data.groups.find((x) => x.id === s.groupId);
  $('#detail-title').textContent = s.name;

  const lapsHtml = s.laps.length
    ? s.laps.map((lap) => {
        return `
          <div class="lap-row">
            <div class="lap-idx">#${lap.index}</div>
            <div class="lap-split">+${formatTime(lap.splitMs).str}</div>
            <div class="lap-total">${formatTime(lap.totalMs).str}</div>
          </div>
        `;
      }).join('')
    : '<div class="empty-hint">本次会话没有计次</div>';

  $('#detail-body').innerHTML = `
    <div class="detail-top">
      <div><span>总时长</span><strong>${formatTime(s.totalMs).str}</strong></div>
      <div><span>计次</span><strong>${s.laps.length}</strong></div>
      <div><span>分组</span><strong>${escapeHtml(g?.name || '未分组')}</strong></div>
      <div><span>创建于</span><strong style="font-size:13px;">${new Date(s.createdAt).toLocaleString('zh-CN')}</strong></div>
    </div>
    <div class="detail-laps">${lapsHtml}</div>
  `;
  $('#detail-modal').hidden = false;
}

async function restoreSessionToCurrent(session) {
  const hasCurrent =
    state.timer.running ||
    state.timer.elapsedBeforeStart > 0 ||
    state.timer.laps.length > 0;
  if (hasCurrent) {
    const ok = await showConfirmDialog({
      title: '恢复会话',
      message: '恢复会话会覆盖当前未保存的计时数据，是否继续？',
      confirmText: '恢复'
    });
    if (!ok) return;
  }

  state.timer.running = false;
  state.timer.startedAt = 0;
  state.timer.elapsedBeforeStart = Number(session.totalMs) || 0;
  state.timer.laps = Array.isArray(session.laps)
    ? session.laps.map((lap, i) => ({
        index: Number(lap.index) || i + 1,
        totalMs: Number(lap.totalMs) || 0,
        splitMs: Number(lap.splitMs) || 0,
        at: Number(lap.at) || Date.now()
      }))
    : [];

  if (session.groupId && state.data.groups.some((g) => g.id === session.groupId)) {
    state.currentGroupId = session.groupId;
  }

  closeModal('#detail-modal');
  renderAll();
  toast('已恢复会话，可继续计时或重新保存');
}

// ---------- Shortcuts ----------
function bindShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F11') { e.preventDefault(); requestToggleFullScreen(); return; }
    if (e.key === 'Escape' && document.body.classList.contains('is-fullscreen')) {
      const modalOpen = document.querySelector('.modal-root:not([hidden])');
      if (!modalOpen) { e.preventDefault(); requestExitFullScreen(); return; }
    }
    if (isTypingInInput(e.target)) return;
    if (document.querySelector('.modal-root:not([hidden])')) return;
    const k = e.key.toLowerCase();
    if (k === 'a') { e.preventDefault(); toggleStart(); }
    else if (k === 's') { e.preventDefault(); recordLap(); }
    else if (k === 'c') { e.preventDefault(); resetTimer(); }
    else if (k === 'enter') { e.preventDefault(); if (!$('#btn-save').disabled) openSaveModal(); }
  });
}

function isTypingInInput(el) {
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select';
}

// ---------- System dialog ----------
const systemDialogState = {
  resolver: null,
  canCancel: true
};

function bindSystemDialog() {
  const modal = $('#system-dialog-modal');
  const mask = $('#system-dialog-mask');
  const btnClose = $('#btn-system-dialog-close');
  const btnCancel = $('#btn-system-dialog-cancel');
  const btnConfirm = $('#btn-system-dialog-confirm');
  if (!modal || !mask || !btnClose || !btnCancel || !btnConfirm) return;

  const cancelDialog = () => resolveSystemDialog(false);
  const confirmDialog = () => resolveSystemDialog(true);

  mask.addEventListener('click', () => {
    if (systemDialogState.canCancel) cancelDialog();
  });
  btnClose.addEventListener('click', cancelDialog);
  btnCancel.addEventListener('click', cancelDialog);
  btnConfirm.addEventListener('click', confirmDialog);

  document.addEventListener('keydown', (e) => {
    if (modal.hidden) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      confirmDialog();
      return;
    }
    if (e.key === 'Escape' && systemDialogState.canCancel) {
      e.preventDefault();
      cancelDialog();
    }
  });
}

function showConfirmDialog({ title = '确认', message = '', confirmText = '确定', cancelText = '取消', danger = false } = {}) {
  return openSystemDialog({
    title,
    message,
    confirmText,
    cancelText,
    showCancel: true,
    danger
  });
}

function showAlertDialog({ title = '提示', message = '', confirmText = '我知道了' } = {}) {
  return openSystemDialog({
    title,
    message,
    confirmText,
    showCancel: false,
    danger: false
  });
}

function openSystemDialog({ title, message, confirmText, cancelText = '取消', showCancel = true, danger = false }) {
  resolveSystemDialog(false);
  systemDialogState.canCancel = showCancel;

  $('#system-dialog-title').textContent = title;
  $('#system-dialog-message').textContent = message;

  const btnClose = $('#btn-system-dialog-close');
  const btnCancel = $('#btn-system-dialog-cancel');
  const btnConfirm = $('#btn-system-dialog-confirm');

  btnConfirm.textContent = confirmText || '确定';
  btnConfirm.classList.toggle('danger', !!danger);

  btnCancel.hidden = !showCancel;
  btnClose.hidden = !showCancel;
  btnCancel.textContent = cancelText || '取消';

  $('#system-dialog-modal').hidden = false;

  return new Promise((resolve) => {
    systemDialogState.resolver = resolve;
    setTimeout(() => btnConfirm.focus(), 20);
  });
}

function resolveSystemDialog(result) {
  if (!systemDialogState.resolver) return;
  const resolve = systemDialogState.resolver;
  systemDialogState.resolver = null;
  $('#system-dialog-modal').hidden = true;
  resolve(!!result);
}

// ---------- Modal helpers ----------
function closeModal(sel) {
  $(sel).hidden = true;
}

// ---------- Toast ----------
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => { t.hidden = true; }, 260);
  }, 1800);
}

// ---------- Utils ----------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderAll() {
  renderGroups();
  renderCurrentGroupLabel();
  renderHistory();
  renderTimerState();
  renderTimerDisplay();
  renderLaps();
}

// ---------- Boot ----------
init().catch((err) => {
  console.error(err);
  showAlertDialog({
    title: '初始化失败',
    message: '初始化失败：' + err.message,
    confirmText: '我知道了'
  });
});
