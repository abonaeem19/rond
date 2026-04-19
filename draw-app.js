/* ================================================
   صفحة السحب — Draw Page Logic
   ================================================ */
(function () {
  'use strict';

  var COLORS = [
    '#FFD166','#EF476F','#06D6A0','#118AB2','#F78C6B','#9D7CE0',
    '#FF6B9D','#4ECDC4','#FFE66D','#95E1D3','#C44569','#48DBFB',
    '#A8E6CF','#FF8C94','#B4A7E5','#FBBF24'
  ];
  var DPR = Math.min(window.devicePixelRatio || 1, 2);

  var participants = [];
  var history = [];
  var isSpinning = false;
  var rotation = 0;
  var wheelCache = null, wheelCacheSize = 0, wheelCacheN = 0;

  var $ = function (s) { return document.querySelector(s); };
  var dom = {
    wheel: $('#wheel'), wheelEmpty: $('#wheelEmpty'), drawBtn: $('#drawBtn'),
    drawCount: $('#drawCount'), status: $('#status'), statusText: $('#status .status-text'),
    winnerOverlay: $('#winnerOverlay'), winnerName: $('#winnerName'), winnerEmp: $('#winnerEmp'),
    winnerTime: $('#winnerTime'), winnerAvatar: $('#winnerAvatar'),
    drawAgain: $('#drawAgain'), closeWinner: $('#closeWinner'), confetti: $('#confetti'),
    toggleHistory: $('#toggleHistory'), historyDrawer: $('#historyDrawer'),
    closeHistory: $('#closeHistory'), historyList: $('#historyList'),
    historyEmpty: $('#historyEmpty'), historyCount: $('#historyCount'),
    clearHistory: $('#clearHistory'), drawerBackdrop: $('#drawerBackdrop'),
    dbStatus: $('#dbStatus'),
    confirmOverlay: $('#confirmOverlay'), confirmTitle: $('#confirmTitle'),
    confirmMsg: $('#confirmMsg'), confirmYes: $('#confirmYes'), confirmNo: $('#confirmNo'),
    toast: $('#toast')
  };
  var ctx = dom.wheel.getContext('2d');

  // ===== Utilities =====
  function uid() { return 'd_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function truncate(s, n) { return s && s.length > n ? s.slice(0, n - 1) + '…' : s || ''; }
  function escapeHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function initials(n) { var p = n.split(' '); return p.length < 2 ? p[0][0] : p[0][0] + p[p.length - 1][0]; }
  function hexLum(h) { var c = h.replace('#',''); return 0.299*(parseInt(c.slice(0,2),16)/255) + 0.587*(parseInt(c.slice(2,4),16)/255) + 0.114*(parseInt(c.slice(4,6),16)/255); }
  function formatDate(iso) {
    var d = new Date(iso), pad = function (n) { return String(n).padStart(2, '0'); };
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() + ' — ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }
  function secureRandomIndex(max) {
    if (max <= 1) return 0;
    var buf = new Uint32Array(1), limit = 0xFFFFFFFF - (0xFFFFFFFF % max) - 1, r;
    do { crypto.getRandomValues(buf); r = buf[0]; } while (r > limit);
    return r % max;
  }

  function showToast(msg, type) {
    dom.toast.className = 'toast'; dom.toast.textContent = msg;
    void dom.toast.offsetWidth;
    dom.toast.className = 'toast show ' + (type || 'info');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { dom.toast.className = 'toast'; }, 2800);
  }

  function askConfirm(title, message) {
    return new Promise(function (resolve) {
      dom.confirmTitle.textContent = title;
      dom.confirmMsg.textContent = message;
      dom.confirmOverlay.hidden = false;
      function yes() { cleanup(); resolve(true); }
      function no() { cleanup(); resolve(false); }
      function cleanup() { dom.confirmOverlay.hidden = true; dom.confirmYes.removeEventListener('click', yes); dom.confirmNo.removeEventListener('click', no); }
      dom.confirmYes.addEventListener('click', yes);
      dom.confirmNo.addEventListener('click', no);
    });
  }

  // ===== Canvas: Wheel =====
  function setupCanvas() {
    var rect = dom.wheel.getBoundingClientRect();
    var size = Math.max(300, Math.floor(rect.width));
    dom.wheel.width = size * DPR; dom.wheel.height = size * DPR;
    return size;
  }

  function buildCache(size) {
    var n = participants.length;
    var c = document.createElement('canvas');
    c.width = size * DPR; c.height = size * DPR;
    var cc = c.getContext('2d');
    cc.setTransform(DPR, 0, 0, DPR, 0, 0);
    var cx = size / 2, cy = size / 2, r = size / 2 - 8;
    if (n === 0) {
      cc.beginPath(); cc.arc(cx, cy, r, 0, Math.PI * 2);
      cc.fillStyle = 'rgba(255,255,255,0.03)'; cc.fill();
      cc.lineWidth = 4; cc.strokeStyle = 'rgba(255,255,255,0.08)'; cc.stroke();
      wheelCache = c; wheelCacheSize = size; wheelCacheN = 0; return;
    }
    var seg = (Math.PI * 2) / n;
    for (var i = 0; i < n; i++) {
      var sa = -Math.PI / 2 + i * seg, ea = sa + seg;
      cc.beginPath(); cc.moveTo(cx, cy); cc.arc(cx, cy, r, sa, ea); cc.closePath();
      var col = COLORS[i % COLORS.length]; cc.fillStyle = col; cc.fill();
      if (n <= 60) { cc.strokeStyle = 'rgba(0,0,0,0.15)'; cc.lineWidth = 1.2; cc.stroke(); }
    }
    if (n <= 40) {
      for (var i = 0; i < n; i++) {
        var sa = -Math.PI / 2 + i * seg, mid = sa + seg / 2;
        var col = COLORS[i % COLORS.length], lum = hexLum(col);
        var tc = lum > 0.55 ? '#0a0e27' : '#fff';
        var fs = n > 32 ? 9 : n > 22 ? 10 : n > 14 ? 12 : n > 8 ? 14 : 16;
        var mc = n > 20 ? 8 : n > 14 ? 12 : 18;
        cc.save(); cc.translate(cx, cy); cc.rotate(mid);
        cc.font = '800 ' + fs + 'px Cairo,Tajawal,sans-serif';
        cc.textAlign = 'right'; cc.textBaseline = 'middle'; cc.direction = 'rtl';
        cc.fillStyle = tc; cc.fillText(truncate(participants[i].name, mc), r - 14, 0);
        if (n <= 18) { cc.font = '600 ' + Math.max(9, fs - 3) + 'px Cairo,sans-serif'; cc.globalAlpha = 0.75; cc.fillText('#' + participants[i].empId, r - 14, fs); cc.globalAlpha = 1; }
        cc.restore();
      }
    }
    cc.beginPath(); cc.arc(cx, cy, r, 0, Math.PI * 2);
    cc.lineWidth = 6; cc.strokeStyle = 'rgba(255,209,102,0.7)'; cc.stroke();
    cc.beginPath(); cc.arc(cx, cy, r + 3, 0, Math.PI * 2);
    cc.lineWidth = 2; cc.strokeStyle = 'rgba(0,0,0,0.4)'; cc.stroke();
    wheelCache = c; wheelCacheSize = size; wheelCacheN = n;
  }

  function drawWheel() {
    var size = setupCanvas();
    if (!wheelCache || wheelCacheSize !== size || wheelCacheN !== participants.length) buildCache(size);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, size, size);
    dom.wheelEmpty.hidden = (participants.length !== 0);
    var cx = size / 2, cy = size / 2;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rotation);
    ctx.drawImage(wheelCache, -size / 2, -size / 2, size, size);
    ctx.restore();
  }

  function setStatus(kind, text) { dom.status.className = 'status status-' + kind; dom.statusText.textContent = text; }
  function updateBtn() { dom.drawBtn.disabled = (participants.length < 1 || isSpinning); dom.drawCount.textContent = participants.length; }

  // ===== Spin =====
  function performDraw() {
    if (isSpinning || participants.length < 1) return;
    var n = participants.length;
    var wi = secureRandomIndex(n);
    var winner = participants[wi];

    isSpinning = true;
    document.body.classList.add('spinning');
    updateBtn(); setStatus('spinning', 'جاري السحب...');

    var seg = (Math.PI * 2) / n;
    var target = ((Math.PI * 2) - (wi + 0.5) * seg) % (Math.PI * 2);
    var jBuf = new Uint32Array(1); crypto.getRandomValues(jBuf);
    var jitter = ((jBuf[0] / 0xFFFFFFFF) - 0.5) * seg * 0.5;
    var curNorm = ((rotation % (Math.PI * 2)) + (Math.PI * 2)) % (Math.PI * 2);
    var delta = target - curNorm + jitter;
    while (delta < 0) delta += Math.PI * 2;
    var extra = 5 + Math.floor(Math.random() * 2);
    var totalDelta = delta + extra * Math.PI * 2;
    var startRot = rotation, endRot = startRot + totalDelta;
    var duration = 4800 + Math.floor(Math.random() * 600);
    var t0 = performance.now();

    function step(now) {
      var t = Math.min((now - t0) / duration, 1);
      var eased = 1 - Math.pow(1 - t, 3);
      rotation = startRot + (endRot - startRot) * eased;
      drawWheel();
      if (t < 1) requestAnimationFrame(step);
      else { rotation = endRot; drawWheel(); finishDraw(winner); }
    }
    requestAnimationFrame(step);
  }

  async function finishDraw(winner) {
    isSpinning = false;
    document.body.classList.remove('spinning');
    var entry = { id: uid(), name: winner.name, empId: winner.empId, at: new Date().toISOString(), totalParticipants: participants.length };
    if (DB.isOnline) await DB.addDraw(winner.name, winner.empId, participants.length);
    history.unshift(entry);
    if (history.length > 100) history.length = 100;
    try { localStorage.setItem('roulette_history_v1', JSON.stringify(history)); } catch (_) {}
    renderHistory();
    setStatus('done', 'تم اختيار الفائز');
    updateBtn();
    setTimeout(function () { showWinner(winner, entry.at); }, 300);
  }

  // ===== Winner =====
  function showWinner(w, at) {
    dom.winnerName.textContent = w.name;
    dom.winnerEmp.textContent = w.empId;
    dom.winnerTime.textContent = 'وقت السحب: ' + formatDate(at);
    dom.winnerAvatar.textContent = initials(w.name);
    dom.winnerOverlay.hidden = false;
    launchConfetti();
  }
  function hideWinner() {
    dom.winnerOverlay.hidden = true; stopConfetti();
    setStatus('ready', 'جاهز للسحب');
  }

  // ===== Confetti =====
  var confettiRAF = null;
  function launchConfetti() {
    var cvs = dom.confetti, pr = cvs.parentElement.getBoundingClientRect();
    cvs.width = pr.width * DPR; cvs.height = pr.height * DPR;
    var cc = cvs.getContext('2d'); cc.setTransform(DPR, 0, 0, DPR, 0, 0);
    var cols = ['#FFD166','#EF476F','#06D6A0','#118AB2','#9D7CE0','#FF6B9D'];
    var parts = [];
    for (var i = 0; i < 120; i++) parts.push({ x: pr.width / 2, y: pr.height / 2, vx: (Math.random() - 0.5) * 18, vy: (Math.random() - 0.9) * 18, g: 0.4, sz: 4 + Math.random() * 6, c: cols[Math.floor(Math.random() * cols.length)], r: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 0.3 });
    var st = performance.now();
    function anim(now) {
      var el = now - st, life = Math.max(0, 1 - el / 4000);
      cc.clearRect(0, 0, pr.width, pr.height);
      parts.forEach(function (p) {
        p.x += p.vx; p.y += p.vy; p.vy += p.g; p.vx *= 0.995; p.r += p.vr;
        cc.save(); cc.translate(p.x, p.y); cc.rotate(p.r); cc.globalAlpha = life;
        cc.fillStyle = p.c; cc.fillRect(-p.sz / 2, -p.sz / 2, p.sz, p.sz * 0.6); cc.restore();
      });
      if (el < 4000) confettiRAF = requestAnimationFrame(anim);
      else cc.clearRect(0, 0, pr.width, pr.height);
    }
    cancelAnimationFrame(confettiRAF); confettiRAF = requestAnimationFrame(anim);
  }
  function stopConfetti() { cancelAnimationFrame(confettiRAF); dom.confetti.getContext('2d').clearRect(0, 0, dom.confetti.width, dom.confetti.height); }

  // ===== History =====
  function renderHistory() {
    dom.historyList.innerHTML = '';
    dom.historyCount.textContent = history.length;
    if (history.length === 0) { dom.historyEmpty.style.display = 'block'; dom.historyList.style.display = 'none'; return; }
    dom.historyEmpty.style.display = 'none'; dom.historyList.style.display = 'flex';
    var frag = document.createDocumentFragment();
    history.forEach(function (h, i) {
      var li = document.createElement('li'); li.className = 'history-item';
      li.innerHTML = '<div class="h-index">' + (i + 1) + '</div><div class="h-info"><div class="h-name">' + escapeHtml(h.name) + '</div><div class="h-meta">الرقم: <span>' + escapeHtml(h.empId) + '</span> · ' + formatDate(h.at) + ' · ' + h.totalParticipants + ' مشاركاً</div></div>';
      frag.appendChild(li);
    });
    dom.historyList.appendChild(frag);
  }

  function openHistory() { dom.historyDrawer.classList.add('open'); dom.drawerBackdrop.hidden = false; }
  function closeHistoryDrawer() { dom.historyDrawer.classList.remove('open'); dom.drawerBackdrop.hidden = true; }

  // ===== Events =====
  dom.drawBtn.addEventListener('click', performDraw);
  dom.drawAgain.addEventListener('click', function () { hideWinner(); setTimeout(performDraw, 220); });
  dom.closeWinner.addEventListener('click', hideWinner);
  dom.winnerOverlay.addEventListener('click', function (e) { if (e.target === dom.winnerOverlay) hideWinner(); });
  dom.toggleHistory.addEventListener('click', function () { dom.historyDrawer.classList.contains('open') ? closeHistoryDrawer() : openHistory(); });
  dom.closeHistory.addEventListener('click', closeHistoryDrawer);
  dom.drawerBackdrop.addEventListener('click', closeHistoryDrawer);
  dom.clearHistory.addEventListener('click', async function () {
    if (history.length && (await askConfirm('مسح السجل', 'سيتم حذف كل سجل السحوبات. متابعة؟'))) {
      if (DB.isOnline) await DB.clearDraws();
      history = [];
      try { localStorage.setItem('roulette_history_v1', JSON.stringify(history)); } catch (_) {}
      renderHistory(); showToast('تم مسح السجل', 'info');
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (!dom.winnerOverlay.hidden) hideWinner();
      else if (dom.historyDrawer.classList.contains('open')) closeHistoryDrawer();
      else if (!dom.confirmOverlay.hidden) dom.confirmNo.click();
    }
  });
  var rTimer;
  window.addEventListener('resize', function () { clearTimeout(rTimer); rTimer = setTimeout(function () { wheelCache = null; drawWheel(); }, 150); });

  // ===== Admin PIN =====
  var ADMIN_PIN = '2026';  // ← غيّر الرقم السري هنا

  var pinGate = $('#pinGate');
  var pinInput = $('#pinInput');
  var pinSubmit = $('#pinSubmit');
  var pinErr = $('#pinErr');
  var appEl = document.querySelector('.app');

  // Hide app content until PIN is verified
  if (appEl) appEl.style.visibility = 'hidden';

  function verifyPin() {
    var val = (pinInput.value || '').trim();
    if (!val) { pinErr.textContent = 'أدخل الرقم السري'; pinInput.classList.add('shake'); setTimeout(function () { pinInput.classList.remove('shake'); }, 500); return; }
    if (val !== ADMIN_PIN) { pinErr.textContent = 'الرقم السري غير صحيح'; pinInput.value = ''; pinInput.classList.add('shake'); setTimeout(function () { pinInput.classList.remove('shake'); }, 500); return; }
    // Correct PIN
    pinGate.classList.add('unlocked');
    if (appEl) appEl.style.visibility = 'visible';
    init();
  }

  if (pinSubmit) pinSubmit.addEventListener('click', verifyPin);
  if (pinInput) pinInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') verifyPin(); });
  if (pinInput) pinInput.focus();

  // ===== Init (called after PIN) =====
  async function init() {
    DB.init();
    try { participants = await DB.getParticipants(); } catch (_) {}
    if (!participants.length) {
      try { var d = localStorage.getItem('roulette_participants_v1'); if (d) participants = JSON.parse(d) || []; } catch (_) {}
    }
    try { history = await DB.getDraws(); } catch (_) {}
    if (!history.length) {
      try { var h = localStorage.getItem('roulette_history_v1'); if (h) history = JSON.parse(h) || []; } catch (_) {}
    }

    drawWheel(); updateBtn(); renderHistory();
    setStatus('ready', 'جاهز للسحب');

    if (DB.isOnline && dom.dbStatus) {
      dom.dbStatus.classList.add('online');
      dom.dbStatus.querySelector('.db-label').textContent = 'متصل';
      showToast('متصل بقاعدة البيانات', 'success');
    }

    DB.onChange = async function () {
      participants = await DB.getParticipants();
      history = await DB.getDraws();
      wheelCache = null;
      drawWheel(); updateBtn(); renderHistory();
    };
  }

  // Init is called ONLY after correct PIN — no auto-start

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { wheelCache = null; drawWheel(); }).catch(function () {});
  }
})();
