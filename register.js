/* ================================================
   صفحة التسجيل — Register Page Logic
   ================================================ */
(function () {
  'use strict';

  const COLORS = [
    '#FFD166','#EF476F','#06D6A0','#118AB2','#F78C6B','#9D7CE0',
    '#FF6B9D','#4ECDC4','#FFE66D','#95E1D3','#C44569','#48DBFB',
    '#A8E6CF','#FF8C94','#B4A7E5','#FBBF24'
  ];

  let participants = [];
  let editingId = null;

  const $ = s => document.querySelector(s);
  const dom = {
    form: $('#addForm'), name: $('#name'), emp: $('#empId'),
    submitLabel: $('#submitLabel'), cancelBtn: $('#cancelEditBtn'),
    list: $('#participants'), badge: $('#countBadge'),
    clearAll: $('#clearAll'), loadSample: $('#loadSample'),
    emptyHint: $('#emptyHint'), counter: $('#counterSummary'),
    dbStatus: $('#dbStatus'),
    confirmOverlay: $('#confirmOverlay'), confirmTitle: $('#confirmTitle'),
    confirmMsg: $('#confirmMsg'), confirmYes: $('#confirmYes'), confirmNo: $('#confirmNo'),
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
    showToast._t = setTimeout(() => { dom.toast.className = 'toast'; }, 2800);
  }

  function askConfirm(title, message) {
    return new Promise(resolve => {
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

  function secureRandomIndex(max) {
    if (max <= 1) return 0;
    var buf = new Uint32Array(1), limit = 0xFFFFFFFF - (0xFFFFFFFF % max) - 1, r;
    do { crypto.getRandomValues(buf); r = buf[0]; } while (r > limit);
    return r % max;
  }

  // ===== Validation =====
  function setErr(field, msg) {
    var c = field.closest('.field'), e = c.querySelector('.err');
    if (msg) { c.classList.add('has-error'); e.textContent = msg; }
    else { c.classList.remove('has-error'); e.textContent = ''; }
  }

  function validate(name, empId, exId) {
    var ok = true;
    if (!name) { setErr(dom.name, 'الاسم مطلوب'); ok = false; }
    else {
      var parts = name.split(/\s+/).filter(Boolean);
      if (parts.length < 3) { setErr(dom.name, 'يجب إدخال الاسم ثلاثياً'); ok = false; }
      else if (parts.some(p => p.length < 2)) { setErr(dom.name, 'كل مقطع حرفين على الأقل'); ok = false; }
      else setErr(dom.name, '');
    }
    if (!empId) { setErr(dom.emp, 'الرقم الوظيفي مطلوب'); ok = false; }
    else if (participants.find(p => p.empId === empId && p.id !== exId)) { setErr(dom.emp, 'الرقم موجود مسبقاً'); ok = false; }
    else setErr(dom.emp, '');
    return ok;
  }

  // ===== Render =====
  function render() {
    dom.list.innerHTML = '';
    var n = participants.length;
    dom.badge.textContent = n;
    dom.counter.querySelector('.big').textContent = n;
    if (n === 0) { dom.emptyHint.style.display = 'grid'; dom.list.style.display = 'none'; dom.clearAll.style.visibility = 'hidden'; return; }
    dom.emptyHint.style.display = 'none'; dom.list.style.display = ''; dom.clearAll.style.visibility = 'visible';
    var frag = document.createDocumentFragment();
    participants.forEach(function (p, i) {
      var li = document.createElement('li');
      li.className = 'participant' + (p.id === editingId ? ' editing' : '');
      li.dataset.id = p.id;
      li.innerHTML = '<div class="avatar" style="background:' + COLORS[i % COLORS.length] + '">' + escapeHtml(initials(p.name)) + '</div>'
        + '<div class="p-info"><div class="p-name">' + escapeHtml(p.name) + '</div><div class="p-emp">الرقم: ' + escapeHtml(p.empId) + '</div></div>'
        + '<div class="p-actions">'
        + '<button class="icon-btn" data-act="edit" title="تعديل"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>'
        + '<button class="icon-btn danger" data-act="delete" title="حذف"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button>'
        + '</div>';
      frag.appendChild(li);
    });
    dom.list.appendChild(frag);
  }

  function cancelEdit() {
    editingId = null;
    dom.submitLabel.textContent = 'إضافة';
    dom.cancelBtn.hidden = true;
    dom.form.reset();
    setErr(dom.name, ''); setErr(dom.emp, '');
    render();
  }

  // ===== CRUD =====
  async function addP(name, empId) {
    var p;
    if (DB.isOnline) { p = await DB.addParticipant(name, empId); if (!p) { showToast('خطأ في الحفظ', 'error'); return; } }
    else p = { id: uid(), name: name, empId: empId, createdAt: new Date().toISOString() };
    participants.push(p);
    saveLocal();
    render();
    showToast('تمت إضافة المشارك', 'success');
  }

  async function updateP(id, name, empId) {
    if (DB.isOnline) { if (!(await DB.updateParticipant(id, name, empId))) { showToast('خطأ في التحديث', 'error'); return; } }
    var p = participants.find(x => x.id === id);
    if (p) { p.name = name; p.empId = empId; }
    saveLocal(); render();
    showToast('تم تحديث المشارك', 'success');
  }

  async function deleteP(id) {
    if (DB.isOnline) { if (!(await DB.deleteParticipant(id))) { showToast('خطأ في الحذف', 'error'); return; } }
    participants = participants.filter(x => x.id !== id);
    if (editingId === id) cancelEdit();
    saveLocal(); render();
    showToast('تم حذف المشارك', 'info');
  }

  async function clearAllP() {
    if (DB.isOnline) { if (!(await DB.clearAllParticipants())) { showToast('خطأ', 'error'); return; } }
    participants = [];
    cancelEdit(); saveLocal(); render();
    showToast('تم تصفير القائمة', 'info');
  }

  function saveLocal() { try { localStorage.setItem('roulette_participants_v1', JSON.stringify(participants)); } catch (_) {} }

  // ===== Sample Data =====
  var FIRST = ['محمد','أحمد','عبدالله','خالد','سعد','فهد','عبدالعزيز','علي','عمر','سلمان','ناصر','تركي','بندر','فيصل','نواف','ماجد','هشام','ياسر','طارق','سامي','وليد','عادل','راشد','مازن','غازي','سلطان','عبدالرحمن','إبراهيم','يوسف','حسن','مشعل','عبدالمجيد','بدر','سعود','فارس','رامي','زياد','مروان','أنس','باسم','فاطمة','نورة','سارة','منى','هدى','أمل','ريم','دانة','جواهر','لطيفة','العنود','روان','شهد','لمى','ليان','جود','رهف','غلا','أسماء','مها'];
  var MID = ['محمد','أحمد','عبدالله','خالد','سعد','فهد','عبدالعزيز','علي','عمر','سلمان','ناصر','إبراهيم','يوسف','حسن','حسين','صالح','سعيد','طلال','عبدالرحمن','بدر'];
  var LAST = ['العتيبي','القحطاني','الحربي','الزهراني','الشمري','الغامدي','المطيري','الدوسري','السبيعي','السلمي','البلوي','العنزي','الرشيدي','الخالدي','الشهري','الأحمدي','العمري','القرشي','الجهني','البقمي','الثقفي','المالكي','الفيفي','العسيري','الحازمي','الصاعدي','المولد','الرويلي','العصيمي','الخثعمي'];

  async function loadSample() {
    var msg = participants.length > 0 ? 'ستتم إضافة 100 مشارك تجريبي. متابعة؟' : 'سيتم تحميل 100 مشارك تجريبي. متابعة؟';
    if (!(await askConfirm('تحميل بيانات تجريبية', msg))) return;
    var list = [], usedN = new Set(), usedI = new Set(participants.map(p => p.empId));
    var nextId = 10001;
    while (usedI.has(String(nextId))) nextId++;
    var g = 0;
    while (list.length < 100 && g < 2000) {
      g++;
      var f = FIRST[secureRandomIndex(FIRST.length)], m = MID[secureRandomIndex(MID.length)], l = LAST[secureRandomIndex(LAST.length)];
      var full = f + ' ' + m + ' ' + l;
      if (usedN.has(full)) continue;
      usedN.add(full);
      while (usedI.has(String(nextId))) nextId++;
      usedI.add(String(nextId));
      list.push({ id: uid(), name: full, empId: String(nextId++) });
    }
    if (DB.isOnline) {
      if (await DB.addBulkParticipants(list)) { participants = await DB.getParticipants(); }
      else { showToast('خطأ في الحفظ', 'error'); return; }
    } else {
      participants = participants.concat(list);
    }
    saveLocal(); render();
    showToast('تمت إضافة ' + list.length + ' مشارك', 'success');
  }

  // ===== Events =====
  dom.form.addEventListener('submit', async function (e) {
    e.preventDefault();
    var name = sanitize(dom.name.value), empId = sanitize(dom.emp.value);
    if (!validate(name, empId, editingId)) return;
    if (editingId) { await updateP(editingId, name, empId); cancelEdit(); }
    else { await addP(name, empId); dom.form.reset(); }
    dom.name.focus();
  });

  dom.name.addEventListener('input', () => setErr(dom.name, ''));
  dom.emp.addEventListener('input', () => setErr(dom.emp, ''));
  dom.cancelBtn.addEventListener('click', cancelEdit);

  dom.list.addEventListener('click', async function (e) {
    var btn = e.target.closest('.icon-btn'); if (!btn) return;
    var li = btn.closest('.participant'), id = li && li.dataset.id; if (!id) return;
    if (btn.dataset.act === 'edit') {
      var p = participants.find(x => x.id === id); if (!p) return;
      editingId = id;
      dom.name.value = p.name; dom.emp.value = p.empId;
      dom.submitLabel.textContent = 'حفظ التعديل';
      dom.cancelBtn.hidden = false;
      setErr(dom.name, ''); setErr(dom.emp, '');
      dom.name.focus(); render();
    } else if (btn.dataset.act === 'delete') {
      if (await askConfirm('حذف مشارك', 'هل تريد حذف هذا المشارك؟')) await deleteP(id);
    }
  });

  dom.clearAll.addEventListener('click', async function () {
    if (participants.length && (await askConfirm('تصفير القائمة', 'سيتم حذف جميع المشاركين. متأكد؟'))) await clearAllP();
  });

  if (dom.loadSample) dom.loadSample.addEventListener('click', loadSample);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !dom.confirmOverlay.hidden) dom.confirmNo.click();
  });

  // ===== Init =====
  async function init() {
    DB.init();
    try {
      participants = await DB.getParticipants();
    } catch (_) {}
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
