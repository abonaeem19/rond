/* ================================================
   Database Layer — Supabase
   ================================================
   Provides CRUD operations for participants & draws.
   If Supabase is not configured, falls back to localStorage.
   ================================================ */

(function () {
  'use strict';

  // ============ Supabase Config ============
  // ⚠️ Replace these with your Supabase project values
  const SUPABASE_URL  = 'https://ehvbtwpilxxiafjrsvuq.supabase.co';
  const SUPABASE_KEY  = 'sb_publishable_6gRHoxDzB-Mr4BrjxX3n1w_9rm5_YH0';

  // ============ State ============
  let supabase = null;
  let isOnline = false;
  let onChangeCallback = null; // called when data changes from another device

  // ============ Init ============
  function init() {
    if (SUPABASE_URL && SUPABASE_KEY && window.supabase) {
      try {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        isOnline = true;
        console.log('✅ Database: Supabase connected');
        subscribeToChanges();
      } catch (e) {
        console.warn('⚠️ Database: Supabase init failed, using localStorage', e);
        isOnline = false;
      }
    } else {
      console.log('ℹ️ Database: No Supabase config — using localStorage');
      isOnline = false;
    }
  }

  // ============ Realtime Subscription ============
  function subscribeToChanges() {
    if (!supabase) return;
    supabase
      .channel('roulette-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participants' }, () => {
        if (onChangeCallback) onChangeCallback();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'draws' }, () => {
        if (onChangeCallback) onChangeCallback();
      })
      .subscribe();
  }

  // ============ Participants CRUD ============
  async function getParticipants() {
    if (!isOnline) return getLocal('roulette_participants_v1');
    const { data, error } = await supabase
      .from('participants')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) { console.error('DB getParticipants error:', error); return getLocal('roulette_participants_v1'); }
    // Map to app format
    return (data || []).map(r => ({
      id: r.id,
      name: r.name,
      empId: r.emp_id,
      createdAt: r.created_at
    }));
  }

  async function addParticipant(name, empId) {
    if (!isOnline) return null; // caller handles localStorage
    const { data, error } = await supabase
      .from('participants')
      .insert({ name, emp_id: empId })
      .select()
      .single();
    if (error) { console.error('DB addParticipant error:', error); return null; }
    return { id: data.id, name: data.name, empId: data.emp_id, createdAt: data.created_at };
  }

  async function updateParticipant(id, name, empId) {
    if (!isOnline) return false;
    const { error } = await supabase
      .from('participants')
      .update({ name, emp_id: empId })
      .eq('id', id);
    if (error) { console.error('DB updateParticipant error:', error); return false; }
    return true;
  }

  async function deleteParticipant(id) {
    if (!isOnline) return false;
    const { error } = await supabase
      .from('participants')
      .delete()
      .eq('id', id);
    if (error) { console.error('DB deleteParticipant error:', error); return false; }
    return true;
  }

  async function clearAllParticipants() {
    if (!isOnline) return false;
    const { error } = await supabase
      .from('participants')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // delete all
    if (error) { console.error('DB clearAll error:', error); return false; }
    return true;
  }

  async function addBulkParticipants(list) {
    if (!isOnline) return false;
    // list = [{name, empId}, ...]
    const rows = list.map(p => ({ name: p.name, emp_id: p.empId }));
    const { error } = await supabase
      .from('participants')
      .insert(rows);
    if (error) { console.error('DB addBulk error:', error); return false; }
    return true;
  }

  // ============ Draws CRUD ============
  async function getDraws() {
    if (!isOnline) return getLocal('roulette_history_v1');
    const { data, error } = await supabase
      .from('draws')
      .select('*')
      .order('drawn_at', { ascending: false })
      .limit(100);
    if (error) { console.error('DB getDraws error:', error); return getLocal('roulette_history_v1'); }
    return (data || []).map(r => ({
      id: r.id,
      name: r.winner_name,
      empId: r.winner_emp_id,
      at: r.drawn_at,
      totalParticipants: r.total_participants
    }));
  }

  async function addDraw(winnerName, winnerEmpId, totalParticipants) {
    if (!isOnline) return null;
    const { data, error } = await supabase
      .from('draws')
      .insert({ winner_name: winnerName, winner_emp_id: winnerEmpId, total_participants: totalParticipants })
      .select()
      .single();
    if (error) { console.error('DB addDraw error:', error); return null; }
    return { id: data.id, name: data.winner_name, empId: data.winner_emp_id, at: data.drawn_at, totalParticipants: data.total_participants };
  }

  async function clearDraws() {
    if (!isOnline) return false;
    const { error } = await supabase
      .from('draws')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) { console.error('DB clearDraws error:', error); return false; }
    return true;
  }

  // ============ localStorage Fallback ============
  function getLocal(key) {
    try {
      const d = localStorage.getItem(key);
      return d ? JSON.parse(d) : [];
    } catch (_) { return []; }
  }

  // ============ Public API ============
  window.DB = {
    init,
    get isOnline() { return isOnline; },
    set onChange(fn) { onChangeCallback = fn; },
    getParticipants,
    addParticipant,
    updateParticipant,
    deleteParticipant,
    clearAllParticipants,
    addBulkParticipants,
    getDraws,
    addDraw,
    clearDraws
  };
})();
