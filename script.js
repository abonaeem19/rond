/* ================================================
   روليت السحب العشوائي — Application Logic
   ================================================
   - إدخال وتحقق المشاركين
   - سحب عشوائي آمن عبر crypto.getRandomValues
   - رسم العجلة على Canvas مع رسوم متحركة سلسة
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

  // ============ State ============
  const state = {
    participants: [],   // { id, name, empId, createdAt }
    history: [],        // { id, name, empId, at, totalParticipants }
    isSpinning: false,
    rotation: 0,        // current radians
    editingId: null,
    lastWinnerId: null
  };

  // ============ DOM Shortcuts ============
  const $ = (sel) => document.querySelector(sel);
  const dom = {
    form: $('#addForm'),
    name: $('#name'),
    emp: $('#empId'),
    nameErr: document.querySelector('.err[data-for="name"]'),
    empErr: document.querySelector('.err[data-for="empId"]'),
    submitBtn: $('#submitBtn'),
    submitLabel: $('#submitLabel'),
    cancelEditBtn: $('#cancelEditBtn'),
    participants: $('#participants'),
    countBadge: $('#countBadge'),
    clearAll: $('#clearAll'),
    emptyHint: $('#emptyHint'),
    wheel: $('#wheel'),
    wheelEmpty: $('#wheelEmpty'),
    wheelStage: document.querySelector('.wheel-stage'),
    drawBtn: $('#drawBtn'),
    status: $('#status'),
    statusText: document.querySelector('#status .status-text'),
    excludeWinner: $('#excludeWinner'),

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

  // ============ Utilities ============
  function uid() {
    return 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function sanitize(s) {
    return String(s || '').trim().replace(/\s+/g, ' ');
  }

  /**
   * Cryptographically-secure random index in [0, max)
   * Uses rejection sampling to avoid modulo bias.
   */
  function secureRandomIndex(max) {
    if (max <= 1) return 0;
    const buf = new Uint32Array(1);
    const MAX_U32 = 0xFFFFFFFF;
    // Largest multiple of `max` less than or equal to 2^32
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
    const date = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    return `${date} — ${time}`;
  }

  function showToast(message, type = 'info') {
    dom.toast.className = 'toast';
    dom.toast.textContent = message;
    // Force reflow to restart transition
    void dom.toast.offsetWidth;
    dom.toast.className = 'toast show ' + type;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      dom.toast.className = 'toast';
    }, 2800);
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

  // ============ Persistence ============
  function saveParticipants() {
    try { localStorage.setItem(STORAGE_PARTICIPANTS, JSON.stringify(state.participants)); } catch (_) {}
  }
  function saveHistory() {
    try { localStorage.setItem(STORAGE_HISTORY, JSON.stringify(state.history)); } catch (_) {}
  }
  function loadState() {
    try {
      const p = localStorage.getItem(STORAGE_PARTICIPANTS);
      if (p) state.participants = JSON.parse(p) || [];
      const h = localStorage.getItem(STORAGE_HISTORY);
      if (h) state.history = JSON.parse(h) || [];
    } catch (_) {
      state.participants = [];
      state.history = [];
    }
  }

  // ============ Validation ============
  function setFieldError(field, msg) {
    const container = field.closest('.field');
    const err = container.querySelector('.err');
    if (msg) {
      container.classList.add('has-error');
      err.textContent = msg;
    } else {
      container.classList.remove('has-error');
      err.textContent = '';
    }
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
      // check duplicate
      const dup = state.participants.find(p => p.empId === empId && p.id !== excludeId);
      if (dup) { setFieldError(dom.emp, 'هذا الرقم الوظيفي موجود مسبقاً'); valid = false; }
      else { setFieldError(dom.emp, ''); }
    }
    return valid;
  }

  // ============ Participants CRUD ============
  function addParticipant(name, empId) {
    const p = { id: uid(), name, empId, createdAt: new Date().toISOString() };
    state.participants.push(p);
    saveParticipants();
    renderParticipants();
    drawWheel();
    updateDrawButton();
    showToast('تمت إضافة المشارك', 'success');
  }

  function updateParticipant(id, name, empId) {
    const p = state.participants.find(p => p.id === id);
    if (!p) return;
    p.name = name;
    p.empId = empId;
    saveParticipants();
    renderParticipants();
    drawWheel();
    showToast('تم تحديث المشارك', 'success');
  }

  function deleteParticipant(id) {
    const idx = state.participants.findIndex(p => p.id === id);
    if (idx < 0) return;
    state.participants.splice(idx, 1);
    if (state.editingId === id) cancelEdit();
    saveParticipants();
    renderParticipants();
    drawWheel();
    updateDrawButton();
    showToast('تم حذف المشارك', 'info');
  }

  function clearAllParticipants() {
    state.participants = [];
    cancelEdit();
    saveParticipants();
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

  // ============ Rendering: Participants ============
  function renderParticipants() {
    dom.participants.innerHTML = '';
    const count = state.participants.length;
    dom.countBadge.textContent = count;

    if (count === 0) {
      dom.emptyHint.style.display = 'grid';
      dom.participants.style.display = 'none';
      dom.clearAll.style.visibility = 'hidden';
      return;
    }
    dom.emptyHint.style.display = 'none';
    dom.participants.style.display = 'flex';
    dom.clearAll.style.visibility = 'visible';

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
      dom.participants.appendChild(li);
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ============ Rendering: Wheel (Canvas) ============
  function setupCanvas() {
    const rect = dom.wheel.getBoundingClientRect();
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    const size = Math.max(300, Math.floor(rect.width));
    dom.wheel.width = size * DPR;
    dom.wheel.height = size * DPR;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(DPR, DPR);
    return size;
  }

  function drawWheel() {
    const size = setupCanvas();
    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2 - 8;

    ctx.clearRect(0, 0, size, size);

    const n = state.participants.length;
    if (n === 0) {
      dom.wheelEmpty.style.display = 'grid';
      // Draw empty circle
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.stroke();
      return;
    }
    dom.wheelEmpty.style.display = 'none';

    const segAngle = (Math.PI * 2) / n;
    const rot = state.rotation;

    // Draw segments
    for (let i = 0; i < n; i++) {
      // Start at top (-π/2), go clockwise
      const startAngle = -Math.PI / 2 + i * segAngle + rot;
      const endAngle = startAngle + segAngle;

      // Segment fill
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, startAngle, endAngle);
      ctx.closePath();
      const color = SEGMENT_COLORS[i % SEGMENT_COLORS.length];
      ctx.fillStyle = color;
      ctx.fill();

      // Segment separator line
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Text
      ctx.save();
      ctx.translate(cx, cy);
      const midAngle = startAngle + segAngle / 2;
      ctx.rotate(midAngle);

      // Text color based on luminance — simple rule: darken
      const luminance = hexLuminance(color);
      const textColor = luminance > 0.55 ? '#0a0e27' : '#ffffff';

      const p = state.participants[i];
      const label = formatLabel(p.name, n);
      const empLabel = p.empId;

      // Adjust text size based on count
      let fontSize = 16;
      if (n > 8) fontSize = 14;
      if (n > 14) fontSize = 12;
      if (n > 20) fontSize = 11;

      ctx.font = `800 ${fontSize}px Cairo, Tajawal, sans-serif`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.direction = 'rtl';
      ctx.fillStyle = textColor;

      const textX = radius - 14;
      const textY = 0;

      // Stroke behind text for better contrast
      ctx.lineWidth = 3;
      ctx.strokeStyle = luminance > 0.55 ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.3)';
      try { ctx.strokeText(label, textX, textY); } catch (_) {}
      ctx.fillText(label, textX, textY);

      // Employee id (smaller, below)
      if (n <= 16) {
        ctx.font = `600 ${Math.max(9, fontSize - 3)}px Cairo, sans-serif`;
        ctx.fillStyle = textColor;
        ctx.globalAlpha = 0.75;
        ctx.fillText('#' + empLabel, textX, textY + fontSize);
        ctx.globalAlpha = 1;
      }

      ctx.restore();
    }

    // Outer decorative ring
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(255, 209, 102, 0.7)';
    ctx.stroke();

    // Outer shadow ring
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 3, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.stroke();

    // Dots around the ring (decorative)
    const dotCount = Math.min(n * 2, 24);
    for (let i = 0; i < dotCount; i++) {
      const a = (Math.PI * 2 / dotCount) * i + rot;
      const dx = cx + Math.cos(a) * (radius - 12);
      const dy = cy + Math.sin(a) * (radius - 12);
      ctx.beginPath();
      ctx.arc(dx, dy, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.fill();
    }
  }

  function formatLabel(name, total) {
    const maxChars = total > 14 ? 8 : total > 8 ? 12 : 18;
    return truncate(name, maxChars);
  }

  function hexLuminance(hex) {
    const c = hex.replace('#', '');
    const r = parseInt(c.slice(0, 2), 16) / 255;
    const g = parseInt(c.slice(2, 4), 16) / 255;
    const b = parseInt(c.slice(4, 6), 16) / 255;
    // Perceptual luminance
    return 0.299 * r + 0.587 * g + 0.114 * b;
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

    // Build the eligible pool (maybe exclude last winner)
    let pool = state.participants.slice();
    if (dom.excludeWinner.checked && state.lastWinnerId && pool.length > 1) {
      pool = pool.filter(p => p.id !== state.lastWinnerId);
    }
    if (pool.length === 0) {
      showToast('لا يوجد مشاركون مؤهلون — قم بإلغاء استبعاد الفائز', 'error');
      return;
    }

    // 1) SECURELY pick a random winner from the pool
    const winnerPoolIndex = secureRandomIndex(pool.length);
    const winner = pool[winnerPoolIndex];

    // 2) Find winner's position in the full wheel (drawn order = state.participants order)
    const winnerWheelIndex = state.participants.findIndex(p => p.id === winner.id);

    // 3) Start spinning
    state.isSpinning = true;
    document.body.classList.add('spinning');
    updateDrawButton();
    setStatus('spinning', 'جاري السحب...');
    cancelEdit();

    const n = state.participants.length;
    const segAngle = (Math.PI * 2) / n;

    // Calculate target rotation so that segment `winnerWheelIndex` lands under the top pointer.
    // Segment i center (at rot=0) is at angle: -π/2 + (i + 0.5) * segAngle
    // We want that angle (+ rotation) to equal -π/2 (the pointer direction)
    //   rotation = -π/2 - (-π/2 + (i + 0.5) * segAngle) = -(i + 0.5) * segAngle
    //   normalize to positive:  rotation = 2π - (i + 0.5) * segAngle
    const targetAbsolute = ((Math.PI * 2) - (winnerWheelIndex + 0.5) * segAngle) % (Math.PI * 2);

    // Add a small random visual offset within ±30% of the segment so it doesn't always stop dead-center
    const jitterBuf = new Uint32Array(1);
    crypto.getRandomValues(jitterBuf);
    const jitter = ((jitterBuf[0] / 0xFFFFFFFF) - 0.5) * segAngle * 0.55;

    // Current normalized rotation
    const currentNorm = ((state.rotation % (Math.PI * 2)) + (Math.PI * 2)) % (Math.PI * 2);

    // Delta: go from currentNorm to targetAbsolute, always forward
    let delta = targetAbsolute - currentNorm + jitter;
    while (delta < 0) delta += Math.PI * 2;

    // Add dramatic extra full rotations (7-9 full turns)
    const extraSpins = 7 + Math.floor(Math.random() * 3);
    const totalDelta = delta + extraSpins * Math.PI * 2;

    const startRot = state.rotation;
    const endRot = startRot + totalDelta;
    const duration = 5500 + Math.floor(Math.random() * 800); // 5.5 – 6.3s
    const t0 = performance.now();

    function easeOutQuint(t) {
      return 1 - Math.pow(1 - t, 5);
    }

    function step(now) {
      const elapsed = now - t0;
      const t = Math.min(elapsed / duration, 1);
      const eased = easeOutQuint(t);
      state.rotation = startRot + (endRot - startRot) * eased;
      drawWheel();

      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        // Ensure exact final position
        state.rotation = endRot;
        drawWheel();
        finishDraw(winner);
      }
    }
    requestAnimationFrame(step);
  }

  function finishDraw(winner) {
    state.isSpinning = false;
    document.body.classList.remove('spinning');
    state.lastWinnerId = winner.id;

    // Record history
    const entry = {
      id: uid(),
      name: winner.name,
      empId: winner.empId,
      at: new Date().toISOString(),
      totalParticipants: state.participants.length
    };
    state.history.unshift(entry);
    if (state.history.length > 100) state.history.length = 100;
    saveHistory();
    renderHistory();

    setStatus('done', 'تم اختيار الفائز');
    updateDrawButton();

    // Show the winner overlay with a small delay for drama
    setTimeout(() => showWinner(winner, entry.at), 350);
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
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    cvs.width = parentRect.width * DPR;
    cvs.height = parentRect.height * DPR;
    const cctx = cvs.getContext('2d');
    cctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    const colors = ['#FFD166', '#EF476F', '#06D6A0', '#118AB2', '#9D7CE0', '#FF6B9D'];
    confettiParticles = [];
    for (let i = 0; i < 140; i++) {
      confettiParticles.push({
        x: parentRect.width / 2,
        y: parentRect.height / 2,
        vx: (Math.random() - 0.5) * 18,
        vy: (Math.random() - 0.9) * 18,
        g: 0.4,
        size: 4 + Math.random() * 6,
        color: colors[Math.floor(Math.random() * colors.length)],
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.3,
        life: 1
      });
    }

    const start = performance.now();
    function animate(now) {
      const elapsed = now - start;
      cctx.clearRect(0, 0, parentRect.width, parentRect.height);
      confettiParticles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.g;
        p.vx *= 0.995;
        p.rot += p.vr;
        p.life = Math.max(0, 1 - elapsed / 4000);
        cctx.save();
        cctx.translate(p.x, p.y);
        cctx.rotate(p.rot);
        cctx.globalAlpha = p.life;
        cctx.fillStyle = p.color;
        cctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        cctx.restore();
      });
      if (elapsed < 4000) {
        confettiRAF = requestAnimationFrame(animate);
      } else {
        cctx.clearRect(0, 0, parentRect.width, parentRect.height);
      }
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
      dom.historyList.appendChild(li);
    });
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
    // Form submit
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

    // Clear errors on input
    dom.name.addEventListener('input', () => setFieldError(dom.name, ''));
    dom.emp.addEventListener('input', () => setFieldError(dom.emp, ''));

    dom.cancelEditBtn.addEventListener('click', cancelEdit);

    // Participants list (delegated)
    dom.participants.addEventListener('click', async (e) => {
      const btn = e.target.closest('.icon-btn');
      if (!btn) return;
      if (state.isSpinning) { showToast('انتظر انتهاء السحب', 'info'); return; }
      const li = btn.closest('.participant');
      const id = li && li.dataset.id;
      if (!id) return;
      const act = btn.dataset.act;
      if (act === 'edit') {
        startEdit(id);
      } else if (act === 'delete') {
        const ok = await askConfirm('حذف مشارك', 'هل تريد حذف هذا المشارك من القائمة؟');
        if (ok) deleteParticipant(id);
      }
    });

    // Clear all
    dom.clearAll.addEventListener('click', async () => {
      if (state.participants.length === 0) return;
      if (state.isSpinning) return;
      const ok = await askConfirm('تصفير القائمة', 'سيتم حذف جميع المشاركين. هل أنت متأكد؟');
      if (ok) clearAllParticipants();
    });

    // Draw
    dom.drawBtn.addEventListener('click', performDraw);

    // Exclude winner toggle (visual persistence only needed locally)
    dom.excludeWinner.addEventListener('change', () => {
      const mode = dom.excludeWinner.checked ? 'سيتم استبعاد الفائز السابق' : 'جميع المشاركين مؤهلون';
      showToast(mode, 'info');
    });

    // Winner overlay buttons
    dom.drawAgain.addEventListener('click', () => {
      hideWinner();
      setTimeout(() => {
        // If exclude-winner is on and only one person remains, warn
        performDraw();
      }, 220);
    });
    dom.closeWinner.addEventListener('click', hideWinner);
    dom.winnerOverlay.addEventListener('click', (e) => {
      if (e.target === dom.winnerOverlay) hideWinner();
    });

    // History drawer
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
        state.history = [];
        state.lastWinnerId = null;
        saveHistory();
        renderHistory();
        showToast('تم مسح السجل', 'info');
      }
    });

    // ESC key closes overlays
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!dom.winnerOverlay.hidden) hideWinner();
        else if (dom.historyDrawer.classList.contains('open')) closeHistoryDrawer();
        else if (!dom.confirmOverlay.hidden) {
          dom.confirmNo.click();
        }
      }
    });

    // Window resize → redraw wheel
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(drawWheel, 120);
    });
  }

  // ============ Boot ============
  function init() {
    loadState();
    renderParticipants();
    renderHistory();
    drawWheel();
    updateDrawButton();
    setStatus('ready', 'جاهز للسحب');
    attachEvents();
  }

  // Wait for fonts + layout before initial wheel draw
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  // Redraw once fonts load (canvas needs font metrics)
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(drawWheel).catch(() => {});
  }
})();
