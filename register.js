/* ================================================
   صفحة التسجيل — Register Page Logic
   إضافة مشاركين فقط — لا حذف ولا تعديل
   ================================================ */
(function () {
  'use strict';

  var COLORS = [
    '#FFD166','#EF476F','#06D6A0','#118AB2','#F78C6B','#9D7CE0',
    '#FF6B9D','#4ECDC4','#FFE66D','#95E1D3','#C44569','#48DBFB',
    '#A8E6CF','#FF8C94','#B4A7E5','#FBBF24'
  ];

  var participants = [];

  var $ = function (s) { return document.querySelector(s); };
  var dom = {
    form: $('#addForm'), name: $('#name'), emp: $('#empId'),
    list: $('#participants'), badge: $('#countBadge'),
    emptyHint: $('#emptyHint'), counter: $('#counterSummary'),
    dbStatus: $('#dbStatus'),
    toast: $('#toast')
  };

  // ===== Utilities =====
  function uid() { return 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function sanitize(s) { return String(s || '').trim().replace(/\s+/g, ' '); }
  function escapeHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function initials(n) { var p = n.split(' '); return p.length < 2 ? p[0][0] : p[0][0] + p[p.length - 1][0]; }

  function showToast(msg, type) {
    dom.toast.className = 'toast'; dom.toast.textContent = msg;
    void dom.toast.offsetWidth;
    dom.toast.className = 'toast show ' + (type || 'info');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { dom.toast.className = 'toast'; }, 2800);
  }

  function setErr(field, msg) {
    var c = field.closest('.field'), e = c.querySelector('.err');
    if (msg) { c.classList.add('has-error'); e.textContent = msg; }
    else { c.classList.remove('has-error'); e.textContent = ''; }
  }

  function secureRandomIndex(max) {
    if (max <= 1) return 0;
    var buf = new Uint32Array(1), limit = 0xFFFFFFFF - (0xFFFFFFFF % max) - 1, r;
    do { crypto.getRandomValues(buf); r = buf[0]; } while (r > limit);
    return r % max;
  }

  // ===== Validation =====
  function validate(name, empId) {
    var ok = true;
    if (!name) { setErr(dom.name, 'الاسم مطلوب'); ok = false; }
    else {
      var parts = name.split(/\s+/).filter(Boolean);
      if (parts.length < 3) { setErr(dom.name, 'يجب إدخال الاسم ثلاثياً'); ok = false; }
      else if (parts.some(function (p) { return p.length < 2; })) { setErr(dom.name, 'كل مقطع حرفين على الأقل'); ok = false; }
      else setErr(dom.name, '');
    }
    if (!empId) { setErr(dom.emp, 'الرقم الوظيفي مطلوب'); ok = false; }
    else {
      if (participants.find(function (p) { return p.empId === empId; })) { setErr(dom.emp, 'هذا الرقم موجود مسبقاً'); ok = false; }
      else setErr(dom.emp, '');
    }
    return ok;
  }

  // ===== Render (view only — no edit/delete buttons) =====
  function render() {
    dom.list.innerHTML = '';
    var n = participants.length;
    dom.badge.textContent = n;
    if (dom.counter) dom.counter.querySelector('.big').textContent = n;
    if (n === 0) { dom.emptyHint.style.display = 'grid'; dom.list.style.display = 'none'; return; }
    dom.emptyHint.style.display = 'none'; dom.list.style.display = '';
    var frag = document.createDocumentFragment();
    participants.forEach(function (p, i) {
      var li = document.createElement('li');
      li.className = 'participant';
      li.innerHTML = '<div class="avatar" style="background:' + COLORS[i % COLORS.length] + '">' + escapeHtml(initials(p.name)) + '</div>'
        + '<div class="p-info"><div class="p-name">' + escapeHtml(p.name) + '</div><div class="p-emp">الرقم: ' + escapeHtml(p.empId) + '</div></div>';
      frag.appendChild(li);
    });
    dom.list.appendChild(frag);
  }

  // ===== Add only =====
  async function addP(name, empId) {
    var p;
    if (DB.isOnline) {
      p = await DB.addParticipant(name, empId);
      if (!p) { showToast('خطأ في الحفظ', 'error'); return; }
    } else {
      p = { id: uid(), name: name, empId: empId, createdAt: new Date().toISOString() };
    }
    participants.push(p);
    saveLocal();
    render();
    showToast('تمت إضافة المشارك', 'success');
  }

  function saveLocal() { try { localStorage.setItem('roulette_participants_v1', JSON.stringify(participants)); } catch (_) {} }

  // ===== Events =====
  dom.form.addEventListener('submit', async function (e) {
    e.preventDefault();
    var name = sanitize(dom.name.value), empId = sanitize(dom.emp.value);
    if (!validate(name, empId)) return;
    await addP(name, empId);
    dom.form.reset();
    dom.name.focus();
  });

  dom.name.addEventListener('input', function () { setErr(dom.name, ''); });
  dom.emp.addEventListener('input', function () { setErr(dom.emp, ''); });

  // ===== Init =====
  async function init() {
    DB.init();
    try { participants = await DB.getParticipants(); } catch (_) {}
    if (!participants.length) {
      try { var d = localStorage.getItem('roulette_participants_v1'); if (d) participants = JSON.parse(d) || []; } catch (_) {}
    }
    render();

    if (DB.isOnline && dom.dbStatus) {
      dom.dbStatus.classList.add('online');
      dom.dbStatus.querySelector('.db-label').textContent = 'متصل';
      showToast('متصل بقاعدة البيانات', 'success');
    }

    // Realtime sync
    DB.onChange = async function () {
      participants = await DB.getParticipants();
      saveLocal(); render();
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
