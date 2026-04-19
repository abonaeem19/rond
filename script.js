/* ================================================
   روليت السحب العشوائي — Application Logic
   ================================================
   - إدخال وتحقق المشاركين
   - سحب عشوائي آمن عبر crypto.getRandomValues
   - أداء عالٍ: رسم العجلة مرة واحدة على canvas خارجي
     ثم مجرد تدويره في الرسوم المتحركة (O(1) لكل إطار)
   - حفظ مؤقت في localStorage + سجل السحوبات
   ================================================ */

(function () {
  'use strict';

  // ============ Storage Keys ============
  const STORAGE_PARTICIPANTS = 'roulette_participants_v1';
  const STORAGE_HISTORY = 'roulette_history_v1';

  // ============ Palette ============
  const SEGMENT_COLORS = [
    '#FFD166', '#EF476F', '#06D6A0', '#118AB2',
    '#F78C6B', '#9D7CE0', '#FF6B9D', '#4ECDC4',
    '#FFE66D', '#95E1D3', '#C44569', '#48DBFB',
    '#A8E6CF', '#FF8C94', '#B4A7E5', '#FBBF24'
  ];

  const DPR = Math.min(window.devicePixelRatio || 1, 2);

  // ============ State ============
  const state = {
    participants: [],
    history: [],
    isSpinning: false,
    rotation: 0,
    editingId: null
  };

  // ============ DOM Shortcuts ============
  const $ = (sel) => document.querySelector(sel);
  const dom = {
    // Screens
    screenRegister: $('#screenRegister'),
    screenDraw: $('#screenDraw'),
    goToDraw: $('#goToDraw'),
    backToRegister: $('#backToRegister'),
    stepper: $('#stepper'),
    dbStatus: $('#dbStatus'),
    drawCount: $('#drawCount'),
    counterSummary: $('#counterSummary'),

    form: $('#addForm'),
    name: $('#name'),
    emp: $('#empId'),
    submitBtn: $('#submitBtn'),
    submitLabel: $('#submitLabel'),
    cancelEditBtn: $('#cancelEditBtn'),
    participants: $('#participants'),
    countBadge: $('#countBadge'),
    clearAll: $('#clearAll'),
    loadSample: $('#loadSample'),
    emptyHint: $('#emptyHint'),
    wheel: $('#wheel'),
    wheelEmpty: $('#wheelEmpty'),
    wheelStage: document.querySelector('.wheel-stage'),
    drawBtn: $('#drawBtn'),
    status: $('#status'),
    statusText: document.querySelector('#status .status-text'),

    // Winner
    winnerOverlay: $('#winnerOverlay'),
    winnerName: $('#winnerName'),
    winnerEmp: $('#winnerEmp'),
    winnerTime: $('#winnerTime'),
    winnerAvatar: $('#winnerAvatar'),
    drawAgain: $('#drawAgain'),
    closeWinner: $('#closeWinner'),
    confetti: $('#confetti'),

    // History
    toggleHistory: $('#toggleHistory'),
    historyDrawer: $('#historyDrawer'),
    closeHistory: $('#closeHistory'),
    historyList: $('#historyList'),
    historyEmpty: $('#historyEmpty'),
    historyCount: $('#historyCount'),
    clearHistory: $('#clearHistory'),
    drawerBackdrop: $('#drawerBackdrop'),

    // Confirm
    confirmOverlay: $('#confirmOverlay'),
    confirmTitle: $('#confirmTitle'),
    confirmMsg: $('#confirmMsg'),
    confirmYes: $('#confirmYes'),
    confirmNo: $('#confirmNo'),

    // Toast
    toast: $('#toast')
  };

  const ctx = dom.wheel.getContext('2d');

  // Offscreen pre-rendered wheel (performance key)
  let wheelCache = null;    // HTMLCanvasElement
  let wheelCacheSize = 0;   // in CSS pixels
  let wheelCacheN = 0;      // number of participants when cache was built

  // ============ Utilities ============
  function uid() {
    return 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function sanitize(s) {
    return String(s || '').trim().replace(/\s+/g, ' ');
  }

  /** Cryptographically-secure random index in [0, max). Rejection sampling avoids modulo bias. */
  function secureRandomIndex(max) {
    if (max <= 1) return 0;
    const buf = new Uint32Array(1);
    const MAX_U32 = 0xFFFFFFFF;
    const limit = MAX_U32 - (MAX_U32 % max) - 1;
    let r;
    do {
      crypto.getRandomValues(buf);
      r = buf[0];
    } while (r > limit);
    return r % max;
  }

  function formatDate(iso) {
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} — ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function showToast(message, type = 'info') {
    dom.toast.className = 'toast';
    dom.toast.textContent = message;
    void dom.toast.offsetWidth;
    dom.toast.className = 'toast show ' + type;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { dom.toast.className = 'toast'; }, 2800);
  }

  function initials(name) {
    const parts = sanitize(name).split(' ');
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].charAt(0);
    return parts[0].charAt(0) + parts[parts.length - 1].charAt(0);
  }

  function truncate(s, n) {
    if (!s) return '';
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function hexLuminance(hex) {
    const c = hex.replace('#', '');
    const r = parseInt(c.slice(0, 2), 16) / 255;
    const g = parseInt(c.slice(2, 4), 16) / 255;
    const b = parseInt(c.slice(4, 6), 16) / 255;
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }

  // ============ Persistence ============
  function saveParticipants() {
    try { localStorage.setItem(STORAGE_PARTICIPANTS, JSON.stringify(state.participants)); } catch (_) {}
  }
  function saveHistory() {
    try { localStorage.setItem(STORAGE_HISTORY, JSON.stringify(state.history)); } catch (_) {}
  }
  async function loadState() {
    // Try DB first, fall back to localStorage
    try {
      state.participants = await DB.getParticipants();
      state.history = await DB.getDraws();
    } catch (_) {}
    // If DB returned empty, try localStorage cache
    if (!state.participants.length) {
      try {
        const p = localStorage.getItem(STORAGE_PARTICIPANTS);
        if (p) state.participants = JSON.parse(p) || [];
      } catch (_) {}
    }
    if (!state.history.length) {
      try {
        const h = localStorage.getItem(STORAGE_HISTORY);
        if (h) state.history = JSON.parse(h) || [];
      } catch (_) {}
    }
  }

  // ============ Validation ============
  function setFieldError(field, msg) {
    const container = field.closest('.field');
    const err = container.querySelector('.err');
    if (msg) { container.classList.add('has-error'); err.textContent = msg; }
    else { container.classList.remove('has-error'); err.textContent = ''; }
  }
  function clearErrors() {
    setFieldError(dom.name, '');
    setFieldError(dom.emp, '');
  }

  function validateInputs(name, empId, excludeId = null) {
    let valid = true;
    if (!name) { setFieldError(dom.name, 'الاسم مطلوب'); valid = false; }
    else {
      const parts = name.split(/\s+/).filter(Boolean);
      if (parts.length < 3) {
        setFieldError(dom.name, 'يجب إدخال الاسم ثلاثياً (ثلاثة مقاطع على الأقل)');
        valid = false;
      } else if (parts.some(p => p.length < 2)) {
        setFieldError(dom.name, 'كل مقطع من الاسم يجب أن يكون حرفين على الأقل');
        valid = false;
      } else {
        setFieldError(dom.name, '');
      }
    }

    if (!empId) { setFieldError(dom.emp, 'الرقم الوظيفي مطلوب'); valid = false; }
    else if (empId.length < 1) { setFieldError(dom.emp, 'الرقم الوظيفي غير صحيح'); valid = false; }
    else {
      const dup = state.participants.find(p => p.empId === empId && p.id !== excludeId);
      if (dup) { setFieldError(dom.emp, 'هذا الرقم الوظيفي موجود مسبقاً'); valid = false; }
      else { setFieldError(dom.emp, ''); }
    }
    return valid;
  }

  // ============ Participants CRUD ============
  function invalidateWheelCache() { wheelCache = null; }

  async function addParticipant(name, empId) {
    var p;
    if (DB.isOnline) {
      p = await DB.addParticipant(name, empId);
      if (!p) { showToast('خطأ في حفظ المشارك', 'error'); return; }
    } else {
      p = { id: uid(), name, empId, createdAt: new Date().toISOString() };
    }
    state.participants.push(p);
    saveParticipants();
    invalidateWheelCache();
    renderParticipants();
    drawWheel();
    updateDrawButton();
    showToast('تمت إضافة المشارك', 'success');
  }

  async function updateParticipant(id, name, empId) {
    if (DB.isOnline) {
      var ok = await DB.updateParticipant(id, name, empId);
      if (!ok) { showToast('خطأ في تحديث المشارك', 'error'); return; }
    }
    const p = state.participants.find(p => p.id === id);
    if (!p) return;
    p.name = name; p.empId = empId;
    saveParticipants();
    invalidateWheelCache();
    renderParticipants();
    drawWheel();
    showToast('تم تحديث المشارك', 'success');
  }

  async function deleteParticipant(id) {
    if (DB.isOnline) {
      var ok = await DB.deleteParticipant(id);
      if (!ok) { showToast('خطأ في حذف المشارك', 'error'); return; }
    }
    const idx = state.participants.findIndex(p => p.id === id);
    if (idx < 0) return;
    state.participants.splice(idx, 1);
    if (state.editingId === id) cancelEdit();
    saveParticipants();
    invalidateWheelCache();
    renderParticipants();
    drawWheel();
    updateDrawButton();
    showToast('تم حذف المشارك', 'info');
  }

  async function clearAllParticipants() {
    if (DB.isOnline) {
      var ok = await DB.clearAllParticipants();
      if (!ok) { showToast('خطأ في تصفير القائمة', 'error'); return; }
    }
    state.participants = [];
    cancelEdit();
    saveParticipants();
    invalidateWheelCache();
    renderParticipants();
    drawWheel();
    updateDrawButton();
    showToast('تم تصفير القائمة', 'info');
  }

  function startEdit(id) {
    const p = state.participants.find(p => p.id === id);
    if (!p) return;
    state.editingId = id;
    dom.name.value = p.name;
    dom.emp.value = p.empId;
    dom.submitLabel.textContent = 'حفظ التعديل';
    dom.cancelEditBtn.hidden = false;
    clearErrors();
    dom.name.focus();
    renderParticipants();
  }
  function cancelEdit() {
    state.editingId = null;
    dom.submitLabel.textContent = 'إضافة';
    dom.cancelEditBtn.hidden = true;
    dom.form.reset();
    clearErrors();
    renderParticipants();
  }

  // ============ Sample Data Generator ============
  const SAMPLE_FIRST = [
    'محمد','أحمد','عبدالله','خالد','سعد','فهد','عبدالعزيز','علي','عمر','سلمان',
    'ناصر','تركي','بندر','فيصل','نواف','ماجد','هشام','ياسر','طارق','سامي',
    'وليد','عادل','راشد','مازن','غازي','سلطان','عبدالرحمن','إبراهيم','يوسف','حسن',
    'مشعل','عبدالمجيد','بدر','سعود','فارس','رامي','زياد','مروان','أنس','باسم',
    'فاطمة','نورة','سارة','منى','هدى','أمل','ريم','دانة','جواهر','لطيفة',
    'العنود','روان','شهد','لمى','ليان','جود','رهف','غلا','أسماء','مها'
  ];
  const SAMPLE_MIDDLE = [
    'محمد','أحمد','عبدالله','خالد','سعد','فهد','عبدالعزيز','علي','عمر','سلمان',
    'ناصر','إبراهيم','يوسف','حسن','حسين','صالح','سعيد','طلال','عبدالرحمن','بدر'
  ];
  const SAMPLE_LAST = [
    'العتيبي','القحطاني','الحربي','الزهراني','الشمري','الغامدي','المطيري','الدوسري',
    'السبيعي','السلمي','البلوي','العنزي','الرشيدي','الخالدي','الشهري','الأحمدي',
    'العمري','القرشي','الجهني','البقمي','الثقفي','المالكي','الفيفي','العسيري',
    'الحازمي','الصاعدي','المولد','الرويلي','العصيمي','الخثعمي'
  ];

  function generateSampleParticipants(count = 100) {
    const out = [];
    const usedNames = new Set();
    const usedIds = new Set(state.participants.map(p => p.empId));
    let nextId = 10001;
    while (usedIds.has(String(nextId))) nextId++;
    let guard = 0;
    while (out.length < count && guard < count * 20) {
      guard++;
      const first = SAMPLE_FIRST[secureRandomIndex(SAMPLE_FIRST.length)];
      const middle = SAMPLE_MIDDLE[secureRandomIndex(SAMPLE_MIDDLE.length)];
      const last = SAMPLE_LAST[secureRandomIndex(SAMPLE_LAST.length)];
      const fullName = `${first} ${middle} ${last}`;
      if (usedNames.has(fullName)) continue;
      usedNames.add(fullName);
      while (usedIds.has(String(nextId))) nextId++;
      const empId = String(nextId);
      usedIds.add(empId);
      nextId++;
      out.push({ id: uid(), name: fullName, empId, createdAt: new Date().toISOString() });
    }
    return out;
  }

  async function loadSampleData() {
    if (state.isSpinning) return;
    const msg = state.participants.length > 0
      ? `ستتم إضافة 100 مشارك تجريبي إلى القائمة الحالية (${state.participants.length}). متابعة؟`
      : 'سيتم تحميل 100 مشارك تجريبي بأسماء ثلاثية عربية وأرقام وظيفية فريدة. متابعة؟';
    const ok = await askConfirm('تحميل بيانات تجريبية', msg);
    if (!ok) return;
    const newOnes = generateSampleParticipants(100);
    if (DB.isOnline) {
      var dbOk = await DB.addBulkParticipants(newOnes);
      if (dbOk) {
        // Reload from DB to get server-generated IDs
        state.participants = await DB.getParticipants();
      } else {
        showToast('خطأ في حفظ البيانات التجريبية', 'error');
        return;
      }
    } else {
      state.participants = state.participants.concat(newOnes);
    }
    saveParticipants();
    invalidateWheelCache();
    renderParticipants();
    drawWheel();
    updateDrawButton();
    showToast('تمت إضافة ' + newOnes.length + ' مشارك تجريبي', 'success');
  }

  // ============ Screen Navigation ============
  function showScreen(name) {
    if (name === 'draw') {
      dom.screenRegister.hidden = true;
      dom.screenDraw.hidden = false;
      updateStepper('draw');
      requestAnimationFrame(() => {
        invalidateWheelCache();
        drawWheel();
        updateDrawButton();
      });
    } else {
      dom.screenDraw.hidden = true;
      dom.screenRegister.hidden = false;
      updateStepper('register');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function updateStepper(activeStep) {
    const steps = dom.stepper.querySelectorAll('.step');
    steps.forEach(s => {
      s.classList.remove('step-active', 'step-done');
      if (s.dataset.step === activeStep) s.classList.add('step-active');
      else if (activeStep === 'draw' && s.dataset.step === 'register') s.classList.add('step-done');
    });
  }

  // ============ Rendering: Participants ============
  function renderParticipants() {
    dom.participants.innerHTML = '';
    const count = state.participants.length;
    dom.countBadge.textContent = count;
    if (dom.counterSummary) dom.counterSummary.querySelector('.big').textContent = count;
    if (dom.goToDraw) dom.goToDraw.disabled = (count < 1);
    if (dom.drawCount) dom.drawCount.textContent = count;

    if (count === 0) {
      dom.emptyHint.style.display = 'grid';
      dom.participants.style.display = 'none';
      dom.clearAll.style.visibility = 'hidden';
      return;
    }
    dom.emptyHint.style.display = 'none';
    dom.participants.style.display = '';
    dom.clearAll.style.visibility = 'visible';

    // Render via DocumentFragment for speed with 100+ entries
    const frag = document.createDocumentFragment();
    state.participants.forEach((p, idx) => {
      const li = document.createElement('li');
      li.className = 'participant' + (p.id === state.editingId ? ' editing' : '');
      li.dataset.id = p.id;
      const color = SEGMENT_COLORS[idx % SEGMENT_COLORS.length];
      li.innerHTML = `
        <div class="avatar" style="background:${color}">${escapeHtml(initials(p.name))}</div>
        <div class="p-info">
          <div class="p-name">${escapeHtml(p.name)}</div>
          <div class="p-emp">الرقم: ${escapeHtml(p.empId)}</div>
        </div>
        <div class="p-actions">
          <button class="icon-btn" data-act="edit" aria-label="تعديل" title="تعديل">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="icon-btn danger" data-act="delete" aria-label="حذف" title="حذف">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
          </button>
        </div>
      `;
      frag.appendChild(li);
    });
    dom.participants.appendChild(frag);
  }

  // ============ Wheel — Offscreen pre-render + cheap rotation ============
  function setupMainCanvas() {
    const rect = dom.wheel.getBoundingClientRect();
    const size = Math.max(300, Math.floor(rect.width));
    dom.wheel.width = size * DPR;
    dom.wheel.height = size * DPR;
    return size;
  }

  /**
   * Pre-render the wheel (at rotation=0) to an offscreen canvas.
   * This runs ONCE per list change, not per animation frame.
   */
  function buildWheelCache(size) {
    const n = state.participants.length;
    const c = document.createElement('canvas');
    c.width = size * DPR;
    c.height = size * DPR;
    const cctx = c.getContext('2d');
    cctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2 - 8;

    if (n === 0) {
      cctx.beginPath();
      cctx.arc(cx, cy, radius, 0, Math.PI * 2);
      cctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
      cctx.fill();
      cctx.lineWidth = 4;
      cctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      cctx.stroke();
      wheelCache = c;
      wheelCacheSize = size;
      wheelCacheN = 0;
      return;
    }

    const segAngle = (Math.PI * 2) / n;

    // Draw all segments
    for (let i = 0; i < n; i++) {
      const startAngle = -Math.PI / 2 + i * segAngle;
      const endAngle = startAngle + segAngle;
      cctx.beginPath();
      cctx.moveTo(cx, cy);
      cctx.arc(cx, cy, radius, startAngle, endAngle);
      cctx.closePath();
      const color = SEGMENT_COLORS[i % SEGMENT_COLORS.length];
      cctx.fillStyle = color;
      cctx.fill();

      // Separator — skip when very dense to save work & look cleaner
      if (n <= 60) {
        cctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
        cctx.lineWidth = 1.2;
        cctx.stroke();
      }
    }

    // Text pass — only when segments are big enough to read
    if (n <= 40) {
      for (let i = 0; i < n; i++) {
        const startAngle = -Math.PI / 2 + i * segAngle;
        const midAngle = startAngle + segAngle / 2;
        const color = SEGMENT_COLORS[i % SEGMENT_COLORS.length];
        const luminance = hexLuminance(color);
        const textColor = luminance > 0.55 ? '#0a0e27' : '#ffffff';

        const p = state.participants[i];
        let fontSize = 16;
        if (n > 8) fontSize = 14;
        if (n > 14) fontSize = 12;
        if (n > 22) fontSize = 10;
        if (n > 32) fontSize = 9;

        const maxChars = n > 20 ? 8 : n > 14 ? 12 : 18;
        const label = truncate(p.name, maxChars);

        cctx.save();
        cctx.translate(cx, cy);
        cctx.rotate(midAngle);
        cctx.font = `800 ${fontSize}px Cairo, Tajawal, sans-serif`;
        cctx.textAlign = 'right';
        cctx.textBaseline = 'middle';
        cctx.direction = 'rtl';
        cctx.fillStyle = textColor;
        cctx.fillText(label, radius - 14, 0);

        if (n <= 18) {
          cctx.font = `600 ${Math.max(9, fontSize - 3)}px Cairo, sans-serif`;
          cctx.globalAlpha = 0.75;
          cctx.fillText('#' + p.empId, radius - 14, fontSize);
          cctx.globalAlpha = 1;
        }
        cctx.restore();
      }
    } else {
      // Dense mode: just draw segment indices every few segments for reference
      for (let i = 0; i < n; i += Math.ceil(n / 20)) {
        const midAngle = -Math.PI / 2 + i * segAngle + segAngle / 2;
        const color = SEGMENT_COLORS[i % SEGMENT_COLORS.length];
        const textColor = hexLuminance(color) > 0.55 ? '#0a0e27' : '#ffffff';
        cctx.save();
        cctx.translate(cx, cy);
        cctx.rotate(midAngle);
        cctx.font = '800 11px Cairo, sans-serif';
        cctx.textAlign = 'right';
        cctx.textBaseline = 'middle';
        cctx.fillStyle = textColor;
        cctx.fillText('#' + state.participants[i].empId, radius - 10, 0);
        cctx.restore();
      }
    }

    // Outer gold ring
    cctx.beginPath();
    cctx.arc(cx, cy, radius, 0, Math.PI * 2);
    cctx.lineWidth = 6;
    cctx.strokeStyle = 'rgba(255, 209, 102, 0.7)';
    cctx.stroke();

    cctx.beginPath();
    cctx.arc(cx, cy, radius + 3, 0, Math.PI * 2);
    cctx.lineWidth = 2;
    cctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    cctx.stroke();

    wheelCache = c;
    wheelCacheSize = size;
    wheelCacheN = n;
  }

  /**
   * Called per-frame during spin. Very cheap:
   * - clear canvas
   * - translate + rotate
   * - draw cached wheel image
   */
  function drawWheel() {
    if (dom.screenDraw && dom.screenDraw.hidden) return;

    const size = setupMainCanvas();
    const n = state.participants.length;

    // Rebuild cache if size changed, count changed, or first draw
    if (!wheelCache || wheelCacheSize !== size || wheelCacheN !== n) {
      buildWheelCache(size);
    }

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, size, size);

    // Toggle empty-state overlay text
    dom.wheelEmpty.hidden = (n !== 0);

    const cx = size / 2;
    const cy = size / 2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(state.rotation);
    ctx.drawImage(wheelCache, -size / 2, -size / 2, size, size);
    ctx.restore();
  }

  // ============ Draw Button & Status ============
  function updateDrawButton() {
    const n = state.participants.length;
    dom.drawBtn.disabled = (n < 1 || state.isSpinning);
  }
  function setStatus(kind, text) {
    dom.status.className = 'status status-' + kind;
    dom.statusText.textContent = text;
  }

  // ============ Spin Logic ============
  function performDraw() {
    if (state.isSpinning) return;
    if (state.participants.length < 1) {
      showToast('لا يوجد مشاركون للسحب', 'error');
      return;
    }

    // 1) Securely pick a winner from the FULL list (every draw is independent & fair)
    const n = state.participants.length;
    const winnerIndex = secureRandomIndex(n);
    const winner = state.participants[winnerIndex];

    // 2) Start spinning
    state.isSpinning = true;
    document.body.classList.add('spinning');
    updateDrawButton();
    setStatus('spinning', 'جاري السحب...');
    cancelEdit();

    const segAngle = (Math.PI * 2) / n;

    // Target rotation where segment winnerIndex lands under the top pointer
    const targetAbsolute = ((Math.PI * 2) - (winnerIndex + 0.5) * segAngle) % (Math.PI * 2);

    // Tiny visual jitter within the segment (±25%) so the pointer never stops dead-center
    const jitterBuf = new Uint32Array(1);
    crypto.getRandomValues(jitterBuf);
    const jitter = ((jitterBuf[0] / 0xFFFFFFFF) - 0.5) * segAngle * 0.5;

    const currentNorm = ((state.rotation % (Math.PI * 2)) + (Math.PI * 2)) % (Math.PI * 2);
    let delta = targetAbsolute - currentNorm + jitter;
    while (delta < 0) delta += Math.PI * 2;

    // Duration and spin count tuned for smoothness + drama
    // Fewer total rotations = less work per frame, but still feels dramatic
    const extraSpins = 5 + Math.floor(Math.random() * 2); // 5–6 full turns
    const totalDelta = delta + extraSpins * Math.PI * 2;

    const startRot = state.rotation;
    const endRot = startRot + totalDelta;
    const duration = 4800 + Math.floor(Math.random() * 600); // 4.8–5.4s
    const t0 = performance.now();

    // Smoother easing — easeOutCubic decelerates gracefully without the sudden late-stop of quint
    function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

    function step(now) {
      const elapsed = now - t0;
      const t = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(t);
      state.rotation = startRot + (endRot - startRot) * eased;
      drawWheel();

      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        state.rotation = endRot;
        drawWheel();
        finishDraw(winner);
      }
    }
    requestAnimationFrame(step);
  }

  async function finishDraw(winner) {
    state.isSpinning = false;
    document.body.classList.remove('spinning');

    const entry = {
      id: uid(),
      name: winner.name,
      empId: winner.empId,
      at: new Date().toISOString(),
      totalParticipants: state.participants.length
    };
    // Save to DB
    if (DB.isOnline) {
      await DB.addDraw(winner.name, winner.empId, state.participants.length);
    }
    state.history.unshift(entry);
    if (state.history.length > 100) state.history.length = 100;
    saveHistory();
    renderHistory();

    setStatus('done', 'تم اختيار الفائز');
    updateDrawButton();

    setTimeout(() => showWinner(winner, entry.at), 300);
  }

  // ============ Winner Display ============
  function showWinner(winner, atIso) {
    dom.winnerName.textContent = winner.name;
    dom.winnerEmp.textContent = winner.empId;
    dom.winnerTime.textContent = 'وقت السحب: ' + formatDate(atIso);
    dom.winnerAvatar.textContent = initials(winner.name);
    dom.winnerOverlay.hidden = false;
    launchConfetti();
  }
  function hideWinner() {
    dom.winnerOverlay.hidden = true;
    stopConfetti();
    setStatus('ready', 'جاهز للسحب');
  }

  // ============ Confetti ============
  let confettiRAF = null;
  let confettiParticles = [];
  function launchConfetti() {
    const cvs = dom.confetti;
    const parentRect = cvs.parentElement.getBoundingClientRect();
    cvs.width = parentRect.width * DPR;
    cvs.height = parentRect.height * DPR;
    const cctx = cvs.getContext('2d');
    cctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    const colors = ['#FFD166', '#EF476F', '#06D6A0', '#118AB2', '#9D7CE0', '#FF6B9D'];
    confettiParticles = [];
    for (let i = 0; i < 120; i++) {
      confettiParticles.push({
        x: parentRect.width / 2,
        y: parentRect.height / 2,
        vx: (Math.random() - 0.5) * 18,
        vy: (Math.random() - 0.9) * 18,
        g: 0.4,
        size: 4 + Math.random() * 6,
        color: colors[Math.floor(Math.random() * colors.length)],
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.3
      });
    }

    const start = performance.now();
    function animate(now) {
      const elapsed = now - start;
      cctx.clearRect(0, 0, parentRect.width, parentRect.height);
      const life = Math.max(0, 1 - elapsed / 4000);
      confettiParticles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        p.vy += p.g; p.vx *= 0.995;
        p.rot += p.vr;
        cctx.save();
        cctx.translate(p.x, p.y);
        cctx.rotate(p.rot);
        cctx.globalAlpha = life;
        cctx.fillStyle = p.color;
        cctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        cctx.restore();
      });
      if (elapsed < 4000) confettiRAF = requestAnimationFrame(animate);
      else cctx.clearRect(0, 0, parentRect.width, parentRect.height);
    }
    cancelAnimationFrame(confettiRAF);
    confettiRAF = requestAnimationFrame(animate);
  }
  function stopConfetti() {
    cancelAnimationFrame(confettiRAF);
    const cctx = dom.confetti.getContext('2d');
    cctx.clearRect(0, 0, dom.confetti.width, dom.confetti.height);
  }

  // ============ History ============
  function renderHistory() {
    dom.historyList.innerHTML = '';
    dom.historyCount.textContent = state.history.length;
    if (state.history.length === 0) {
      dom.historyEmpty.style.display = 'block';
      dom.historyList.style.display = 'none';
      return;
    }
    dom.historyEmpty.style.display = 'none';
    dom.historyList.style.display = 'flex';
    const frag = document.createDocumentFragment();
    state.history.forEach((h, idx) => {
      const li = document.createElement('li');
      li.className = 'history-item';
      li.innerHTML = `
        <div class="h-index">${idx + 1}</div>
        <div class="h-info">
          <div class="h-name">${escapeHtml(h.name)}</div>
          <div class="h-meta">الرقم: <span>${escapeHtml(h.empId)}</span> · ${formatDate(h.at)} · ${h.totalParticipants} مشاركاً</div>
        </div>
      `;
      frag.appendChild(li);
    });
    dom.historyList.appendChild(frag);
  }

  function openHistory() {
    dom.historyDrawer.classList.add('open');
    dom.historyDrawer.setAttribute('aria-hidden', 'false');
    dom.drawerBackdrop.hidden = false;
    dom.toggleHistory.setAttribute('aria-expanded', 'true');
  }
  function closeHistoryDrawer() {
    dom.historyDrawer.classList.remove('open');
    dom.historyDrawer.setAttribute('aria-hidden', 'true');
    dom.drawerBackdrop.hidden = true;
    dom.toggleHistory.setAttribute('aria-expanded', 'false');
  }

  // ============ Confirm Dialog ============
  function askConfirm(title, message) {
    return new Promise((resolve) => {
      dom.confirmTitle.textContent = title;
      dom.confirmMsg.textContent = message;
      dom.confirmOverlay.hidden = false;
      const onYes = () => { cleanup(); resolve(true); };
      const onNo = () => { cleanup(); resolve(false); };
      function cleanup() {
        dom.confirmOverlay.hidden = true;
        dom.confirmYes.removeEventListener('click', onYes);
        dom.confirmNo.removeEventListener('click', onNo);
      }
      dom.confirmYes.addEventListener('click', onYes);
      dom.confirmNo.addEventListener('click', onNo);
    });
  }

  // ============ Events ============
  function attachEvents() {
    dom.form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = sanitize(dom.name.value);
      const empId = sanitize(dom.emp.value);
      if (!validateInputs(name, empId, state.editingId)) return;
      if (state.editingId) {
        updateParticipant(state.editingId, name, empId);
        cancelEdit();
      } else {
        addParticipant(name, empId);
        dom.form.reset();
      }
      dom.name.focus();
    });

    dom.name.addEventListener('input', () => setFieldError(dom.name, ''));
    dom.emp.addEventListener('input', () => setFieldError(dom.emp, ''));
    dom.cancelEditBtn.addEventListener('click', cancelEdit);

    dom.participants.addEventListener('click', async (e) => {
      const btn = e.target.closest('.icon-btn');
      if (!btn) return;
      if (state.isSpinning) { showToast('انتظر انتهاء السحب', 'info'); return; }
      const li = btn.closest('.participant');
      const id = li && li.dataset.id;
      if (!id) return;
      const act = btn.dataset.act;
      if (act === 'edit') startEdit(id);
      else if (act === 'delete') {
        const ok = await askConfirm('حذف مشارك', 'هل تريد حذف هذا المشارك من القائمة؟');
        if (ok) deleteParticipant(id);
      }
    });

    dom.clearAll.addEventListener('click', async () => {
      if (state.participants.length === 0 || state.isSpinning) return;
      const ok = await askConfirm('تصفير القائمة', 'سيتم حذف جميع المشاركين. هل أنت متأكد؟');
      if (ok) clearAllParticipants();
    });

    if (dom.loadSample) dom.loadSample.addEventListener('click', loadSampleData);

    dom.drawBtn.addEventListener('click', performDraw);

    dom.goToDraw.addEventListener('click', () => {
      if (state.participants.length < 1) {
        showToast('أضف مشاركاً واحداً على الأقل قبل الانتقال للسحب', 'error');
        return;
      }
      showScreen('draw');
    });
    dom.backToRegister.addEventListener('click', () => {
      if (state.isSpinning) { showToast('انتظر انتهاء السحب قبل الرجوع', 'info'); return; }
      showScreen('register');
    });

    dom.drawAgain.addEventListener('click', () => {
      hideWinner();
      setTimeout(() => performDraw(), 220);
    });
    dom.closeWinner.addEventListener('click', hideWinner);
    dom.winnerOverlay.addEventListener('click', (e) => {
      if (e.target === dom.winnerOverlay) hideWinner();
    });

    dom.toggleHistory.addEventListener('click', () => {
      if (dom.historyDrawer.classList.contains('open')) closeHistoryDrawer();
      else openHistory();
    });
    dom.closeHistory.addEventListener('click', closeHistoryDrawer);
    dom.drawerBackdrop.addEventListener('click', closeHistoryDrawer);
    dom.clearHistory.addEventListener('click', async () => {
      if (state.history.length === 0) return;
      const ok = await askConfirm('مسح السجل', 'سيتم حذف كل سجل السحوبات السابق. متابعة؟');
      if (ok) {
        if (DB.isOnline) await DB.clearDraws();
        state.history = [];
        saveHistory();
        renderHistory();
        showToast('تم مسح السجل', 'info');
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!dom.winnerOverlay.hidden) hideWinner();
        else if (dom.historyDrawer.classList.contains('open')) closeHistoryDrawer();
        else if (!dom.confirmOverlay.hidden) dom.confirmNo.click();
      }
    });

    // Resize — invalidate cache so it rebuilds at new size
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        invalidateWheelCache();
        drawWheel();
      }, 150);
    });
  }

  // ============ Boot ============
  async function init() {
    // Initialize database (Supabase or localStorage fallback)
    DB.init();

    // Load data from DB (async)
    await loadState();
    renderParticipants();
    renderHistory();
    updateDrawButton();
    setStatus('ready', 'جاهز للسحب');
    attachEvents();
    showScreen('register');

    // Show connection status
    if (DB.isOnline) {
      showToast('متصل بقاعدة البيانات — المزامنة مفعّلة', 'success');
      if (dom.dbStatus) {
        dom.dbStatus.classList.add('online');
        dom.dbStatus.querySelector('.db-label').textContent = 'متصل';
      }
    }

    // Real-time sync: when another device changes data, refresh automatically
    DB.onChange = async function () {
      state.participants = await DB.getParticipants();
      state.history = await DB.getDraws();
      saveParticipants();
      saveHistory();
      invalidateWheelCache();
      renderParticipants();
      renderHistory();
      drawWheel();
      updateDrawButton();
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      invalidateWheelCache();
      if (dom.screenDraw && !dom.screenDraw.hidden) drawWheel();
    }).catch(() => {});
  }
})();
