/* Mis Finanzas - interfaz. Depende de logic.js (window.Fin). Todo se guarda en localStorage de tu dispositivo. */
(function () {
  'use strict';
  const L = window.Fin;
  const KEY = 'finanzas_pwa_v1';
  const fmt = L.fmt;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ns = (n) => (n == null || n === '' ? '' : String(n).replace('.', ','));

  /* ---------- Estado ---------- */
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return L.normalizeState(JSON.parse(raw));
    } catch (e) { /* datos dañados: se parte de cero */ }
    return L.defaultState();
  }
  let S = load();
  const curMonth = () => L.todayStr().slice(0, 7);
  const ui = {
    tab: 'home', lastTab: null, month: curMonth(), curMonth: curMonth(), plan: 'ahorro', filter: 'all', calSel: null,
    locked: false, pin: '', sim: { base: 'now', dInc: '0', dExp: '0' }, form: null, gen: null, hiddenAt: 0,
  };
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); return true; }
    catch (e) { toast('No se pudo guardar: el almacenamiento está lleno o bloqueado.'); return false; }
  }
  function ensureMonth(m) {
    if (m >= curMonth() && m >= S.startMonth && L.generateMonth(S, m)) save();
  }

  /* ---------- Utilidades de interfaz ---------- */
  const ICON_RULES = [
    [/alimen|comida|super/i, '🍽️'], [/transporte|bus|taxi|gasolina/i, '🚌'], [/gimnas/i, '🏋️'], [/univers|educaci|colegio|curso/i, '🎓'],
    [/internet/i, '🌐'], [/celular|telef|móvil|movil/i, '📱'], [/luz|agua|servicio/i, '💡'], [/dental|diente/i, '🦷'],
    [/seguro/i, '🛡️'], [/salud|médic|medic/i, '🩺'], [/tarjeta|visa|master/i, '💳'], [/préstamo|prestamo|banco|cr[eé]dito/i, '🏦'],
    [/vivienda|arriendo|alquiler|hipoteca/i, '🏠'], [/gustos|salida/i, '🎉'], [/ahorro/i, '🐖'], [/imprevisto/i, '🧯'],
  ];
  const ic = (c, type) => {
    for (const [re, e] of ICON_RULES) if (re.test(c || '')) return e;
    return { ingreso: '💵', ahorro: '🐖', deuda: '💳', gasto: '🧾' }[type] || '🧾';
  };
  const METHODS = [['efectivo', 'Efectivo'], ['credito', 'T. crédito'], ['debito', 'Débito'], ['transferencia', 'Transfer.']];
  const METHOD_LBL = { efectivo: 'Efectivo', credito: 'Tarjeta de crédito', debito: 'Débito', transferencia: 'Transferencia' };
  const SUBS = [['supermercado', 'Supermercado'], ['casa', 'Comida en casa'], ['salida', 'Salida a comer']];
  const SUB_LBL = { supermercado: 'Supermercado', casa: 'Comida en casa', salida: 'Salida a comer' };
  const PALETTE = ['#2f5fe3', '#1f9d63', '#d9821a', '#8b5cf6', '#0ea5b7', '#d93f45', '#8a94a6'];

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('on'), 3200);
  }
  function applyTheme() {
    const t = S.settings.theme;
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  }
  const bar = (pct, cls) => '<div class="bar"><i class="' + (cls || '') + '" style="width:' + Math.max(0, Math.min(100, pct)) + '%"></i></div>';
  const monthName = (m) => L.monthLabel(m);

  /* ---------- Hojas (modales) ---------- */
  function openSheet(html, keep) {
    const sh = $('#sheet');
    if (keep && sh.classList.contains('open') && sh.querySelector('.panel')) {
      const p = sh.querySelector('.panel');
      const st = p.scrollTop;
      p.innerHTML = '<div class="grab"></div>' + html;
      p.scrollTop = st;
      return;
    }
    sh.innerHTML = '<div class="back" data-act="closeSheet"></div><div class="panel"><div class="grab"></div>' + html + '</div>';
    sh.classList.add('open');
  }
  function closeSheet() {
    const sh = $('#sheet');
    sh.classList.remove('open');
    sh.innerHTML = '';
    ui.form = null;
    ui.gen = null;
  }

  /* ---------- Formulario de movimiento ---------- */
  function newForm(over) {
    return Object.assign({
      id: null, type: 'gasto', amount: '', category: L.FOOD, date: L.todayStr(), method: S.settings.lastMethod || 'efectivo',
      desc: '', recurring: false, paid: true, sub: 'supermercado', debtId: null, fund: 'ahorro', withdraw: false,
    }, over || {});
  }
  function openTx(over) {
    ui.form = newForm(over);
    renderTx(false);
    setTimeout(() => { const i = $('#famt'); if (i && !ui.form.id) i.focus(); }, 60);
  }
  function gastoCats() {
    const names = S.budget.filter((b) => !b.debtId && b.active).map((b) => b.name);
    [L.GUSTOS, 'Otros'].forEach((n) => { if (!names.includes(n)) names.push(n); });
    if (ui.form && ui.form.category && !names.includes(ui.form.category) && ui.form.type === 'gasto') names.push(ui.form.category);
    return names;
  }
  function chips(list, cur, act) {
    return '<div class="chips">' + list.map(([v, l]) => '<button class="chip ' + (cur === v ? 'on' : '') + '" data-act="' + act + '" data-v="' + esc(v) + '">' + esc(l) + '</button>').join('') + '</div>';
  }
  function renderTx(keep) {
    const f = ui.form;
    const types = [['gasto', 'Gasto'], ['ingreso', 'Ingreso'], ['ahorro', 'Ahorro'], ['deuda', 'Pago deuda']];
    let h = '<h2>' + (f.id ? 'Editar movimiento' : 'Nuevo movimiento') + '</h2>';
    h += '<div class="seg">' + types.map(([k, l]) => '<button data-act="ftype" data-v="' + k + '" class="' + (f.type === k ? 'on' : '') + '">' + l + '</button>').join('') + '</div>';
    h += '<div class="amt"><span>$</span><input id="famt" data-f="amount" inputmode="decimal" placeholder="0,00" autocomplete="off" value="' + esc(f.amount) + '"></div>';
    if (f.type === 'gasto') {
      h += '<label class="lab">Categoría</label>' + chips(gastoCats().map((c) => [c, c]), f.category, 'fcat');
      if (f.category === L.FOOD) h += '<label class="lab">¿Qué tipo de gasto fue?</label>' + chips(SUBS, f.sub, 'fsub');
    } else if (f.type === 'ingreso') {
      h += '<label class="lab">Categoría</label>' + chips(['Ingreso extra', 'Reembolso', 'Regalo', 'Otros'].map((c) => [c, c]), f.category, 'fcat');
    } else if (f.type === 'ahorro') {
      h += '<label class="lab">Destino</label>' + chips([['ahorro', 'Ahorro'], ['imprevistos', 'Fondo de imprevistos']], f.fund, 'ffund');
      h += '<div class="sw-row"><span>Es un retiro (saca dinero del fondo)</span><label class="sw"><input type="checkbox" data-f="withdraw" ' + (f.withdraw ? 'checked' : '') + '><span></span></label></div>';
      h += '<p class="tiny mut">El ahorro no cuenta como gasto de consumo.</p>';
    } else {
      h += '<label class="lab">¿A qué deuda corresponde?</label>' + chips(S.debts.map((d) => [d.id, d.name + ' · faltan ' + L.debtStats(S, d).remaining]), f.debtId, 'fdebt');
      h += '<p class="tiny mut mt">El pago de la tarjeta o préstamo no se suma a alimentación ni a otros gastos: solo reduce la deuda.</p>';
    }
    h += '<label class="lab">Fecha</label><input class="fld" type="date" data-f="date" value="' + esc(f.date) + '">';
    h += '<label class="lab">Método de pago</label>' + chips(METHODS, f.method, 'fmethod');
    h += '<label class="lab">Descripción (opcional)</label><input class="fld" data-f="desc" maxlength="80" placeholder="Ej. Supermercado Santa María" value="' + esc(f.desc) + '">';
    h += '<div class="sw-row mt"><span>Ya está pagado</span><label class="sw"><input type="checkbox" data-f="paid" ' + (f.paid ? 'checked' : '') + '><span></span></label></div>';
    h += '<div class="sw-row"><span>Se repite cada mes</span><label class="sw"><input type="checkbox" data-f="recurring" ' + (f.recurring ? 'checked' : '') + '><span></span></label></div>';
    h += '<div class="btns mt"><button class="btn" data-act="saveTx">Guardar</button>' + (f.id ? '<button class="btn danger" data-act="delTx">Eliminar</button>' : '') + '</div>';
    openSheet(h, keep);
  }
  function buildTx() {
    const f = ui.form;
    const t = { type: f.type, amount: L.r2(L.parseNum(f.amount)), date: f.date || L.todayStr(), method: f.method, desc: (f.desc || '').trim(), recurring: !!f.recurring, paid: !!f.paid };
    if (f.type === 'gasto') { t.category = f.category; if (f.category === L.FOOD) t.sub = f.sub; }
    else if (f.type === 'ingreso') t.category = f.category;
    else if (f.type === 'ahorro') { t.fund = f.fund; t.category = f.fund === 'imprevistos' ? 'Imprevistos' : 'Ahorro'; t.withdraw = !!f.withdraw; }
    else { const d = S.debts.find((x) => x.id === f.debtId); t.debtId = f.debtId; t.category = d ? d.name : ''; }
    return t;
  }
  function foodToast(t) {
    if (t.type !== 'gasto' || t.category !== L.FOOD) return false;
    const sm = L.summary(S, t.date.slice(0, 7));
    const f = sm.food;
    if (f.spent > f.limit + 0.004) { toast('⚠️ Superaste tu presupuesto de alimentación por ' + fmt(f.spent - f.limit)); return true; }
    if (f.pct >= S.settings.alertPct) { toast('⚠️ Llevas el ' + Math.round(f.pct) + '% de alimentación. Te quedan ' + fmt(f.avail)); return true; }
    return false;
  }
  function saveTx() {
    const f = ui.form;
    if (!f.type) return;
    const t = buildTx();
    if (f.id) t.id = f.id;
    const res = L.checkTx(S, t, !!f.id);
    if (res.block) { toast(res.block); return; }
    if (res.complete) {
      if (confirm(res.msg)) {
        const e = res.complete;
        e.paid = true; e.amount = t.amount; e.date = t.date; e.method = t.method;
        if (t.desc) e.desc = t.desc;
        S.settings.lastMethod = t.method;
        save(); closeSheet(); render(); toast('Marcado como pagado ✓ (sin duplicar)');
      }
      return;
    }
    if (res.warn && !confirm(res.warn)) return;
    if (f.id) {
      const o = S.txs.find((x) => x.id === f.id);
      Object.assign(o, t);
      ['sub', 'fund', 'withdraw', 'debtId'].forEach((k) => { if (!(k in t)) delete o[k]; });
    } else {
      t.id = L.uid();
      S.txs.push(t);
    }
    S.settings.lastMethod = t.method;
    if (t.date.slice(0, 7) !== ui.month) ui.month = t.date.slice(0, 7);
    save(); closeSheet(); render();
    if (!foodToast(t)) toast('Guardado ✓');
  }
  function delTx() {
    const f = ui.form;
    if (!f.id || !confirm('¿Eliminar este movimiento?')) return;
    const o = S.txs.find((x) => x.id === f.id);
    if (o && o.recKey) S.skipped.push(o.recKey); // evita que se regenere
    S.txs = S.txs.filter((x) => x.id !== f.id);
    save(); closeSheet(); render(); toast('Eliminado');
  }

  /* ---------- Formulario genérico ---------- */
  function openGen(title, fields, onSave, onDelete) {
    ui.gen = { title, fields, values: {}, onSave, onDelete };
    fields.forEach((f) => { ui.gen.values[f.k] = f.v; });
    let h = '<h2>' + esc(title) + '</h2>';
    fields.forEach((f) => {
      if (f.type === 'note') h += '<p class="small mut mt">' + f.label + '</p>';
      else if (f.type === 'check') h += '<div class="sw-row"><span>' + esc(f.label) + '</span><label class="sw"><input type="checkbox" data-g="' + f.k + '" ' + (f.v ? 'checked' : '') + '><span></span></label></div>';
      else {
        h += '<label class="lab">' + esc(f.label) + '</label>';
        if (f.type === 'pin') h += '<input class="fld" type="password" inputmode="numeric" maxlength="6" autocomplete="off" data-g="' + f.k + '" value="">';
        else h += '<input class="fld" data-g="' + f.k + '" ' + (f.type === 'num' ? 'inputmode="decimal"' : '') + ' value="' + esc(f.type === 'num' ? ns(f.v) : f.v) + '">';
      }
    });
    h += '<div class="btns mt2"><button class="btn" data-act="gsave">Guardar</button>' + (onDelete ? '<button class="btn danger" data-act="gdel">Eliminar</button>' : '') + '<button class="btn sec" data-act="closeSheet">Cancelar</button></div>';
    openSheet(h, false);
  }
  const gnum = (k) => L.parseNum(ui.gen.values[k]);

  function editIncome() {
    const s = S.settings;
    openGen('Ingresos mensuales', [
      { k: 'salary', label: 'Sueldo', type: 'num', v: s.salary },
      { k: 'reserve', label: 'Fondo de reserva', type: 'num', v: s.reserve },
      { k: 'iess', label: 'Aporte personal al IESS (se resta una sola vez)', type: 'num', v: s.iess },
      { k: 'payDay', label: 'Día del mes en que recibes el sueldo', type: 'num', v: s.payDay },
      { k: 'n', type: 'note', label: 'Ingreso neto = sueldo + fondo de reserva − IESS. Ese neto es la base del presupuesto; el IESS no se vuelve a descontar en los gastos.' },
    ], () => {
      s.salary = L.r2(gnum('salary')); s.reserve = L.r2(gnum('reserve')); s.iess = L.r2(gnum('iess'));
      s.payDay = Math.max(1, Math.min(31, Math.round(gnum('payDay')) || 1));
      save(); closeSheet(); render(); toast('Ingreso neto: ' + fmt(L.netIncome(s)));
    });
  }
  function editPrefs() {
    const s = S.settings;
    openGen('Alertas', [
      { k: 'pct', label: 'Avisar cuando alimentación llegue al (%)', type: 'num', v: s.alertPct },
    ], () => {
      const v = Math.round(gnum('pct'));
      if (!(v >= 1 && v <= 100)) { toast('Ingresa un porcentaje entre 1 y 100.'); return false; }
      s.alertPct = v; save(); closeSheet(); render();
    });
  }
  function editGoals() {
    const s = S.settings;
    openGen('Plan de ahorro y metas', [
      { k: 'ahorro', label: 'Ahorro mensual', type: 'num', v: s.alloc.ahorro },
      { k: 'gustos', label: 'Gustos y salidas (mensual)', type: 'num', v: s.alloc.gustos },
      { k: 'imprev', label: 'Fondo para imprevistos (mensual)', type: 'num', v: s.alloc.imprevistos },
      { k: 'goalName', label: 'Nombre de la meta', type: 'text', v: s.goalName },
      { k: 'goal', label: 'Monto de la meta de ahorro', type: 'num', v: s.goalAmount },
      { k: 'a0', label: 'Ahorro que ya tenías antes de usar la app', type: 'num', v: s.ahorro0 },
      { k: 'i0', label: 'Fondo de imprevistos que ya tenías', type: 'num', v: s.imprev0 },
    ], () => {
      s.alloc.ahorro = L.r2(gnum('ahorro')); s.alloc.gustos = L.r2(gnum('gustos')); s.alloc.imprevistos = L.r2(gnum('imprev'));
      s.goalName = (ui.gen.values.goalName || 'Meta de ahorro').trim() || 'Meta de ahorro';
      s.goalAmount = L.r2(gnum('goal')); s.ahorro0 = L.r2(gnum('a0')); s.imprev0 = L.r2(gnum('i0'));
      save(); closeSheet(); render();
    });
  }
  function editBudget(id) {
    const b = id ? S.budget.find((x) => x.id === id) : null;
    if (b && b.debtId) { editDebt(b.debtId); return; }
    const fields = [];
    if (b && b.isFood) fields.push({ k: 'n0', type: 'note', label: 'Este es tu presupuesto de alimentación y también el límite de tu tarjeta para comida. Se cuenta una sola vez.' });
    else fields.push({ k: 'name', label: 'Nombre', type: 'text', v: b ? b.name : '' });
    fields.push({ k: 'amount', label: b && b.isFood ? 'Límite mensual de alimentación' : 'Monto mensual', type: 'num', v: b ? b.amount : '' });
    fields.push({ k: 'day', label: 'Día de pago (1-31)', type: 'num', v: b ? b.day : 1 });
    if (!(b && b.isFood)) fields.push({ k: 'variable', label: 'Gasto variable (sin fecha fija; no se genera solo)', type: 'check', v: b ? b.kind === 'variable' : false });
    fields.push({ k: 'active', label: 'Incluido en el presupuesto', type: 'check', v: b ? b.active : true });
    openGen(b ? 'Editar gasto' : 'Nuevo gasto del presupuesto', fields, () => {
      const v = ui.gen.values;
      const name = b && b.isFood ? L.FOOD : String(v.name || '').trim();
      const amount = L.r2(gnum('amount'));
      if (!name) { toast('Escribe un nombre.'); return false; }
      if (!(amount > 0)) { toast('El monto debe ser mayor a $0.'); return false; }
      if (S.budget.some((x) => x.name === name && (!b || x.id !== b.id))) { toast('Ya existe un gasto con ese nombre.'); return false; }
      const day = Math.max(1, Math.min(31, Math.round(gnum('day')) || 1));
      if (b) {
        if (b.name !== name) S.txs.forEach((t) => { if (t.category === b.name && t.type === 'gasto') t.category = name; });
        Object.assign(b, { name, amount, day, active: !!v.active });
        if (!b.isFood) b.kind = v.variable ? 'variable' : 'fijo';
      } else {
        S.budget.push({ id: 'b_' + L.uid(), name, amount, day, active: !!v.active, kind: v.variable ? 'variable' : 'fijo' });
      }
      save(); closeSheet(); render();
    }, b && !b.isFood ? () => {
      if (!confirm('¿Quitar "' + b.name + '" del presupuesto? Los movimientos ya registrados se conservan.')) return false;
      S.budget = S.budget.filter((x) => x.id !== b.id); save(); closeSheet(); render();
    } : null);
  }
  function editDebt(id) {
    const d = id ? S.debts.find((x) => x.id === id) : null;
    const st = d ? L.debtStats(S, d) : null;
    const fields = [];
    if (!d) fields.push({ k: 'name', label: 'Nombre de la deuda', type: 'text', v: '' });
    fields.push({ k: 'payment', label: 'Cuota mensual', type: 'num', v: d ? d.payment : '' });
    fields.push({ k: 'total', label: 'Número total de cuotas', type: 'num', v: d ? d.total : '' });
    fields.push({ k: 'remaining', label: 'Cuotas que te faltan (incluye la de este mes si aún no la pagas)', type: 'num', v: d ? st.remaining : '' });
    fields.push({ k: 'principal', label: 'Capital pendiente según tu estado de cuenta (opcional)', type: 'num', v: d && d.principal != null ? d.principal : '' });
    fields.push({ k: 'n1', type: 'note', label: 'Si dejas el capital vacío, la app no lo calcula: las cuotas pueden incluir intereses.' });
    openGen(d ? 'Editar ' + d.name : 'Nueva deuda', fields, () => {
      const v = ui.gen.values;
      const payment = L.r2(gnum('payment'));
      const total = Math.round(gnum('total'));
      const rem = Math.round(gnum('remaining'));
      const name = d ? d.name : String(v.name || '').trim();
      if (!name) { toast('Escribe un nombre.'); return false; }
      if (!(payment > 0) || !(total > 0)) { toast('Cuota y número de cuotas deben ser mayores a 0.'); return false; }
      if (rem < 0 || rem > total) { toast('Las cuotas faltantes deben estar entre 0 y ' + total + '.'); return false; }
      if (!d && (S.debts.some((x) => x.name === name) || S.budget.some((x) => x.name === name))) { toast('Ya existe algo con ese nombre.'); return false; }
      const pr = String(v.principal || '').trim() === '' ? null : L.r2(gnum('principal'));
      let debt = d;
      if (!debt) {
        debt = { id: 'd_' + L.uid(), name, payment, total, paidBase: 0, principal: pr };
        S.debts.push(debt);
        S.budget.push({ id: 'b_' + debt.id, name, amount: payment, day: 15, active: true, kind: 'fijo', debtId: debt.id });
      }
      debt.payment = payment; debt.total = total; debt.principal = pr;
      L.setDebtRemaining(S, debt, rem);
      const bi = S.budget.find((x) => x.debtId === debt.id);
      if (bi) bi.amount = payment;
      save(); closeSheet(); render(); toast('Deuda actualizada ✓');
    }, d ? () => {
      if (!confirm('¿Eliminar la deuda "' + d.name + '" y su línea del presupuesto? Los movimientos ya registrados se conservan.')) return false;
      S.debts = S.debts.filter((x) => x.id !== d.id); S.budget = S.budget.filter((x) => x.debtId !== d.id);
      save(); closeSheet(); render();
    } : null);
  }

  /* ---------- Vistas ---------- */
  function monthBar() {
    return '<div class="mbar"><button data-act="mprev" aria-label="Mes anterior">‹</button><div class="lbl">' + monthName(ui.month) + '</div><button data-act="mnext" aria-label="Mes siguiente">›</button></div>';
  }
  function donut(items) {
    const total = items.reduce((a, x) => a + x.v, 0);
    if (!total) return '';
    let off = 0;
    const segs = items.map((x) => {
      const p = (x.v / total) * 100;
      const s = '<circle cx="21" cy="21" r="15.9155" fill="none" stroke="' + x.c + '" stroke-width="6" stroke-dasharray="' + p + ' ' + (100 - p) + '" stroke-dashoffset="' + -off + '"></circle>';
      off += p;
      return s;
    }).join('');
    return '<svg viewBox="0 0 42 42" role="img" aria-label="Distribución de gastos">' + segs + '</svg>';
  }
  function txRow(t) {
    const title = t.desc || t.category;
    const bits = [];
    if (t.desc) bits.push(t.category);
    if (t.type === 'gasto' && t.category === L.FOOD && t.sub) bits.push(SUB_LBL[t.sub]);
    if (t.type === 'ahorro' && t.withdraw) bits.push('Retiro');
    bits.push(METHOD_LBL[t.method] || '');
    if (t.recurring || t.recKey) bits.push('Mensual');
    const sign = t.type === 'ingreso' ? '+' : t.type === 'ahorro' ? (t.withdraw ? '−' : '') : '−';
    const cls = t.type === 'ingreso' ? 'ok' : t.type === 'ahorro' ? 'bad' : '';
    const acls = t.type === 'ahorro' ? (t.withdraw ? 'warn' : '') : cls;
    return '<div class="it" data-act="edit" data-id="' + t.id + '"><div class="ico">' + ic(t.category, t.type) + '</div>' +
      '<div class="grow"><div class="t">' + esc(title) + '</div><div class="d">' + esc(bits.filter(Boolean).join(' · ')) + (t.paid ? '' : ' · <span class="warn">Pendiente</span>') + '</div></div>' +
      '<div class="a ' + acls + '">' + sign + fmt(t.amount) + '</div>' +
      '<button class="chk ' + (t.paid ? 'on' : '') + '" data-act="togglePaid" data-id="' + t.id + '" aria-label="Marcar pagado">' + (t.paid ? '✓' : '') + '</button></div>';
  }
  function dayLabel(d) {
    return new Date(d + 'T12:00:00').toLocaleDateString('es-EC', { weekday: 'long', day: 'numeric', month: 'short' });
  }

  function homeView() {
    const m = ui.month, today = L.todayStr();
    const sm = L.summary(S, m, today);
    const al = L.alerts(S, sm, today);
    const up = L.upcoming(S, today, 5);
    const f = sm.food;
    const fcls = f.spent > f.limit + 0.004 ? 'bad' : f.pct >= S.settings.alertPct ? 'warn' : 'ok';
    const a = S.settings.alloc;
    let h = '<h1 class="title">Mis finanzas</h1>' + monthBar();
    if (S.settings.sample) h += '<div class="card"><h3>Datos de ejemplo</h3><p class="small mut">Estos montos son de ejemplo. Edita tus ingresos y presupuesto en Ajustes, o importa tu respaldo en Ajustes → Respaldo de datos.</p><button class="btn sec sm mt" data-act="dismissSample">Entendido</button></div>';
    h += '<div class="card hero"><div class="sub">Dinero disponible</div><div class="big num ' + (sm.disponible < 0 ? 'bad' : '') + '">' + fmt(sm.disponible) + '</div>' +
      '<div class="sub">Ingreso ' + fmt(sm.income) + ' − gastos comprometidos ' + fmt(sm.commit + sm.others) + '</div></div>';
    h += '<div class="grid2">' +
      mini('Ingreso mensual', fmt(sm.income), sm.extra > 0 ? 'incluye ' + fmt(sm.extra) + ' extra' : 'neto estimado') +
      mini('Presupuesto total', fmt(sm.budget), sm.lines.length + ' conceptos') +
      mini('Gastos registrados', fmt(sm.spentPaid), 'ya pagados') +
      mini('Pendientes de pago', fmt(sm.pending), sm.pending > 0 ? 'por pagar este mes' : 'todo al día') +
      mini('Ahorro del mes', fmt(sm.ahorroMes), 'de ' + fmt(a.ahorro) + ' planeados') +
      mini('Para gustos', fmt(sm.gustos.avail), 'de ' + fmt(a.gustos) + ' del mes') + '</div>';
    h += '<div class="card"><div class="row between"><h3 style="margin:0">🍽️ Alimentación</h3><span class="pill ' + fcls + '">' + Math.round(f.pct) + '%</span></div>' +
      '<div class="row between mt"><div class="num" style="font-size:24px;font-weight:650">' + fmt(f.spent) + '<span class="mut" style="font-size:15px;font-weight:400"> de ' + fmt(f.limit) + '</span></div></div>' +
      '<div class="mt">' + bar(f.pct, fcls) + '</div>' +
      '<div class="row between small mt"><span class="mut">Disponible</span><b class="num ' + (f.avail < 0 ? 'bad' : '') + '">' + fmt(f.avail) + '</b></div>' +
      '<div class="chips mt small">' + SUBS.map(([k, l]) => '<span class="pill">' + l + ' ' + fmt(f.sub[k]) + '</span>').join('') + '</div>' +
      '<div class="tiny mut mt">Con tarjeta de crédito: ' + fmt(f.card) + ' · Es el mismo presupuesto y el mismo límite de tarjeta ($' + ns(f.limit) + '), no se cuenta dos veces.</div>' +
      '<button class="btn sec sm mt" data-act="addFood">+ Compra de comida</button></div>';
    if (al.length) h += '<div class="card"><h3>Alertas</h3>' + al.map((x) => '<div class="alert ' + x.lvl + '"><span>' + (x.lvl === 'bad' ? '⛔' : '⚠️') + '</span><span>' + esc(x.t) + '</span></div>').join('') + '</div>';
    if (S.txs.some((t) => t.paid) && (!S.settings.lastBackup || L.monthDiff(S.settings.lastBackup.slice(0, 7), curMonth()) >= 1)) {
      h += '<div class="alert ok"><span>💾</span><span>Hace tiempo que no haces un respaldo. Ve a Ajustes → Respaldo.</span></div>';
    }
    h += '<div class="card"><h3>Próximos pagos</h3>';
    if (!up.length) h += '<p class="sub">No tienes pagos pendientes. 🎉</p>';
    else h += '<div class="list">' + up.map((t) => {
      const late = t.date < today;
      return '<div class="it" data-act="edit" data-id="' + t.id + '"><div class="ico">' + ic(t.category, t.type) + '</div><div class="grow"><div class="t">' + esc(t.desc || t.category) + '</div><div class="d ' + (late ? 'bad' : '') + '">' + (late ? 'Vencido · ' : '') + dayLabel(t.date) + '</div></div><div class="a">' + fmt(t.amount) + '</div><button class="chk" data-act="togglePaid" data-id="' + t.id + '" aria-label="Marcar pagado"></button></div>';
    }).join('') + '</div>';
    h += '</div>';
    const lines = sm.lines.slice().sort((x, y) => y.commit - x.commit);
    const top = lines.slice(0, 6).map((l, i) => ({ n: l.name, v: l.commit, c: PALETTE[i] }));
    const rest = lines.slice(6).reduce((s, l) => s + l.commit, 0) + sm.others;
    if (rest > 0) top.push({ n: 'Otros', v: L.r2(rest), c: PALETTE[6] });
    h += '<div class="card"><h3>Distribución de gastos</h3><div class="donut">' + donut(top) + '<div class="legend">' +
      top.map((x) => '<div><b style="background:' + x.c + '"></b><span class="n">' + esc(x.n) + '</span><span class="num">' + fmt(x.v) + '</span></div>').join('') + '</div></div></div>';
    return h;
  }
  function mini(k, v, n) {
    return '<div class="card mini"><div class="k">' + k + '</div><div class="v num">' + v + '</div><div class="n">' + n + '</div></div>';
  }

  function movView() {
    const m = ui.month, f = ui.filter;
    let txs = L.monthTxs(S, m).filter((t) => f === 'all' || (f === 'pend' ? !t.paid : t.type === f));
    txs.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    const filters = [['all', 'Todos'], ['gasto', 'Gastos'], ['ingreso', 'Ingresos'], ['ahorro', 'Ahorro'], ['deuda', 'Deudas'], ['pend', 'Pendientes']];
    let h = '<h1 class="title">Movimientos</h1>' + monthBar();
    h += '<div class="chips" style="margin-bottom:6px">' + filters.map(([k, l]) => '<button class="chip ' + (f === k ? 'on' : '') + '" data-act="filter" data-v="' + k + '">' + l + '</button>').join('') + '</div>';
    if (!txs.length) return h + '<div class="card mt"><p class="sub">No hay movimientos en esta vista.</p></div>';
    let day = '';
    txs.forEach((t) => {
      if (t.date !== day) {
        if (day) h += '</div>';
        day = t.date;
        h += '<div class="dayh">' + dayLabel(day) + '</div><div class="card list" style="padding:4px 16px">';
      }
      h += txRow(t);
    });
    return h + '</div>';
  }

  function calView() {
    const m = ui.month, today = L.todayStr();
    const [y, mo] = m.split('-').map(Number);
    const offset = (new Date(y, mo - 1, 1).getDay() + 6) % 7;
    const dim = L.daysInMonth(m);
    const txs = L.monthTxs(S, m);
    const byDay = {};
    txs.forEach((t) => { const d = Number(t.date.slice(8, 10)); (byDay[d] = byDay[d] || []).push(t); });
    const pd = Math.min(S.settings.payDay, dim);
    const sel = ui.calSel || (today.slice(0, 7) === m ? Number(today.slice(8, 10)) : 1);
    let h = '<h1 class="title">Calendario</h1>' + monthBar();
    h += '<div class="cal">' + ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((x) => '<div class="h">' + x + '</div>').join('');
    for (let i = 0; i < offset; i++) h += '<div class="d e"></div>';
    for (let d = 1; d <= dim; d++) {
      const ds = m + '-' + L.pad(d);
      const kinds = new Set();
      (byDay[d] || []).forEach((t) => {
        if (t.type === 'ingreso') kinds.add('inc');
        else if (t.type === 'ahorro') kinds.add('sav');
        else if (t.paid) kinds.add('paid');
        else kinds.add(t.date < today ? 'exp' : 'pen');
      });
      if (d === pd) kinds.add('inc');
      h += '<button class="d ' + (ds === today ? 'today ' : '') + (d === sel ? 'sel' : '') + '" data-act="calday" data-v="' + d + '"><span>' + d + '</span><div class="dots">' + Array.from(kinds).map((k) => '<i class="dot ' + k + '"></i>').join('') + '</div></button>';
    }
    h += '</div><div class="key"><span><i class="dot pen"></i>Pendiente</span><span><i class="dot exp"></i>Vencido</span><span><i class="dot paid"></i>Pagado</span><span><i class="dot inc"></i>Ingreso</span><span><i class="dot sav"></i>Ahorro</span></div>';
    const list = (byDay[sel] || []).slice();
    h += '<div class="dayh">' + dayLabel(m + '-' + L.pad(sel)) + '</div><div class="card list" style="padding:4px 16px">';
    if (sel === pd) h += '<div class="it"><div class="ico">💵</div><div class="grow"><div class="t">Sueldo neto (estimado)</div><div class="d">Ingreso base mensual</div></div><div class="a ok">+' + fmt(L.netIncome(S.settings)) + '</div></div>';
    if (!list.length && sel !== pd) h += '<p class="sub" style="padding:12px 0">Sin movimientos este día.</p>';
    h += list.map(txRow).join('') + '</div>';
    h += '<button class="btn sec sm mt" data-act="genMonth">Generar pagos recurrentes de este mes</button><p class="tiny mut mt">No duplica pagos ya existentes.</p>';
    return h;
  }

  function planView() {
    const segs = [['ahorro', 'Ahorro'], ['deudas', 'Deudas'], ['proy', 'Proyección']];
    let h = '<h1 class="title">Planes</h1><div class="seg" style="margin:10px 0 14px">' + segs.map(([k, l]) => '<button data-act="plan" data-v="' + k + '" class="' + (ui.plan === k ? 'on' : '') + '">' + l + '</button>').join('') + '</div>';
    if (ui.plan === 'ahorro') return h + monthBar() + ahorroView();
    if (ui.plan === 'deudas') return h + deudasView();
    return h + projView();
  }

  function ahorroView() {
    const sm = L.summary(S, ui.month, L.todayStr());
    const sv = L.savings(S);
    const a = S.settings.alloc;
    const sum = L.r2(a.ahorro + a.gustos + a.imprevistos);
    const diff = L.r2(sm.disponible - sum);
    const monthsLeft = a.ahorro > 0 ? Math.ceil(sv.goalLeft / a.ahorro) : null;
    let h = '<div class="card"><h3>🐖 Ahorro del mes</h3><div class="num" style="font-size:30px;font-weight:700">' + fmt(sm.ahorroMes) + '<span class="mut" style="font-size:15px;font-weight:400"> de ' + fmt(a.ahorro) + '</span></div><div class="mt">' + bar(a.ahorro ? (sm.ahorroMes / a.ahorro) * 100 : 0, sm.ahorroMes >= a.ahorro ? 'ok' : '') + '</div></div>';
    h += '<div class="card"><div class="row between"><h3 style="margin:0">🎯 ' + esc(S.settings.goalName) + '</h3><span class="pill">' + Math.round(sv.goalPct) + '%</span></div>' +
      '<div class="num mt" style="font-size:24px;font-weight:650">' + fmt(sv.ahorro) + '<span class="mut" style="font-size:15px;font-weight:400"> de ' + fmt(sv.goal) + '</span></div><div class="mt">' + bar(sv.goalPct, 'ok') + '</div>' +
      '<p class="small mut mt">' + (sv.goalLeft > 0 ? 'Te faltan ' + fmt(sv.goalLeft) + (monthsLeft ? ' · unos ' + monthsLeft + ' meses al ritmo de ' + fmt(a.ahorro) + ' mensuales.' : '.') : '¡Meta alcanzada! 🎉') + '</p></div>';
    h += '<div class="grid2">' + mini('Saldo de ahorro', fmt(sv.ahorro), 'acumulado') + mini('Fondo imprevistos', fmt(sv.imprevistos), 'este mes ' + fmt(sm.imprevMes) + ' de ' + fmt(a.imprevistos)) + '</div>';
    h += '<div class="card"><h3>🎉 Gustos y salidas</h3><div class="row between"><span class="mut">Disponible este mes</span><b class="num ' + (sm.gustos.avail < 0 ? 'bad' : '') + '">' + fmt(sm.gustos.avail) + '</b></div>' + bar(a.gustos ? (sm.gustos.spent / a.gustos) * 100 : 0, sm.gustos.avail < 0 ? 'bad' : '') .replace('class="bar"', 'class="bar" style="margin-top:8px"') + '<p class="tiny mut mt">Gastado ' + fmt(sm.gustos.spent) + ' de ' + fmt(a.gustos) + '. Regístralo como gasto en la categoría "Gustos y salidas".</p></div>';
    h += '<div class="card"><h3>Distribución mensual</h3>' +
      [['Ahorro', a.ahorro], ['Gustos y salidas', a.gustos], ['Fondo para imprevistos', a.imprevistos]].map(([n, v]) => '<div class="row between small" style="padding:5px 0"><span>' + n + '</span><b class="num">' + fmt(v) + '</b></div>').join('') +
      '<div class="row between small" style="padding:8px 0 0;border-top:1px solid var(--line);margin-top:6px"><span class="mut">Total del plan</span><b class="num">' + fmt(sum) + '</b></div>' +
      '<p class="tiny ' + (Math.abs(diff) < 0.005 ? 'ok' : 'warn') + ' mt">' + (Math.abs(diff) < 0.005 ? '✓ Coincide con tu dinero disponible (' + fmt(sm.disponible) + ').' : 'Tu dinero disponible del mes es ' + fmt(sm.disponible) + ' (' + (diff > 0 ? 'sobran ' + fmt(diff) + ' sin asignar' : 'faltan ' + fmt(-diff) + ' para cubrir el plan') + ').') + '</p></div>';
    h += '<div class="btns"><button class="btn" data-act="addSave" data-v="ahorro">+ Registrar ahorro</button><button class="btn sec" data-act="addSave" data-v="imprevistos">+ Registrar a fondo de imprevistos</button><button class="btn sec" data-act="editGoals">Editar metas y plan</button></div>';
    return h;
  }

  function deudasView() {
    const cur = curMonth();
    const net = L.netIncome(S.settings);
    const dispNow = L.r2(net - L.budgetTotal(S, cur));
    let h = '';
    S.debts.forEach((d) => {
      const st = L.debtStats(S, d);
      let q = '<div class="qs">';
      for (let i = 1; i <= d.total; i++) q += '<i class="q ' + (i <= st.paid ? 'p' : i === st.paid + 1 ? 'n' : '') + '">' + i + '</i>';
      q += '</div>';
      h += '<div class="card"><div class="row between"><h3 style="margin:0">' + ic(d.name, 'deuda') + ' ' + esc(d.name) + '</h3><span class="pill ' + (st.remaining ? '' : 'ok') + '">' + (st.remaining ? 'Faltan ' + st.remaining : 'Pagada ✓') + '</span></div>' +
        '<div class="num mt" style="font-size:22px;font-weight:650">' + st.paid + ' de ' + d.total + '<span class="mut" style="font-size:15px;font-weight:400"> cuotas pagadas</span></div><div class="mt">' + bar(st.progress * 100, 'ok') + '</div>' + q +
        '<div class="small mt"><div class="row between"><span class="mut">Cuota mensual</span><b class="num">' + fmt(d.payment) + '</b></div>' +
        '<div class="row between"><span class="mut">Cuotas pagadas</span><b class="num">' + fmt(st.paidAmount) + '</b></div>' +
        '<div class="row between"><span class="mut">Cuotas por pagar</span><b class="num">' + fmt(st.remainingAmount) + '</b></div>' +
        (d.principal != null ? '<div class="row between"><span class="mut">Capital pendiente (tu dato)</span><b class="num">' + fmt(d.principal) + '</b></div>' : '') + '</div>' +
        (d.principal == null ? '<p class="tiny mut mt">Las cuotas por pagar pueden incluir intereses, por eso no se muestran como capital pendiente.</p>' : '');
      if (st.remaining > 0) {
        const after = L.r2(net - L.budgetTotal(S, st.end));
        h += '<div class="alert ok mt"><span>💡</span><span>Último pago en ' + monthName(L.monthAdd(st.end, -1)) + '. Desde ' + monthName(st.end) + ' se liberan ' + fmt(d.payment) + ' al mes. Dinero disponible estimado ese mes: ' + fmt(after) + ' (hoy: ' + fmt(dispNow) + ', y puede incluir lo liberado por otras deudas que terminen antes).</span></div>';
      }
      h += '<div class="btns two mt">' + (st.remaining > 0 ? '<button class="btn sm" data-act="payDebt" data-id="' + d.id + '">Registrar pago</button>' : '<span></span>') + '<button class="btn sec sm" data-act="editDebt" data-id="' + d.id + '">Editar</button></div></div>';
    });
    h += '<button class="btn sec" data-act="addDebt">+ Agregar deuda</button>';
    return h;
  }

  function simOut() {
    const pr = L.projection(S, curMonth());
    const base = ui.sim.base === 'after' && pr.after ? pr.after : pr.now;
    const dI = L.parseNum(ui.sim.dInc), dE = L.parseNum(ui.sim.dExp);
    const income = L.r2(base.income + dI), budget = L.r2(base.budget + dE), disp = L.r2(income - budget);
    const cap = L.capacity(S, disp), capBase = L.capacity(S, base.disp);
    const d = L.r2(cap - capBase);
    return '<div class="small"><div class="row between" style="padding:4px 0"><span class="mut">Ingreso simulado</span><b class="num">' + fmt(income) + '</b></div>' +
      '<div class="row between" style="padding:4px 0"><span class="mut">Gastos simulados</span><b class="num">' + fmt(budget) + '</b></div>' +
      '<div class="row between" style="padding:4px 0"><span class="mut">Dinero disponible</span><b class="num ' + (disp < 0 ? 'bad' : 'ok') + '">' + fmt(disp) + '</b></div>' +
      '<div class="row between" style="padding:4px 0"><span class="mut">Capacidad de ahorro</span><b class="num ' + (cap < 0 ? 'bad' : '') + '">' + fmt(cap) + '</b></div>' +
      '<div class="row between" style="padding:4px 0"><span class="mut">Ahorro en 12 meses</span><b class="num">' + fmt(Math.max(0, cap) * 12) + '</b></div></div>' +
      '<p class="small mt ' + (cap < 0 ? 'bad' : d > 0 ? 'ok' : d < 0 ? 'warn' : 'mut') + '">' +
      (cap < 0 ? 'Con estos cambios no alcanzas a cubrir gustos e imprevistos (' + fmt(S.settings.alloc.gustos + S.settings.alloc.imprevistos) + ').' : d === 0 ? 'Sin cambio frente al escenario base.' : (d > 0 ? 'Tu capacidad de ahorro mejora en ' : 'Tu capacidad de ahorro baja en ') + fmt(Math.abs(d)) + ' al mes.') + '</p>' +
      '<p class="tiny mut">Capacidad de ahorro = dinero disponible − gustos (' + fmt(S.settings.alloc.gustos) + ') − imprevistos (' + fmt(S.settings.alloc.imprevistos) + ').</p>';
  }
  function projView() {
    const pr = L.projection(S, curMonth());
    const scen = (title, tag, o) => '<div class="card"><div class="row between"><h3 style="margin:0">' + title + '</h3><span class="pill">' + tag + '</span></div><div class="small mt">' +
      '<div class="row between" style="padding:4px 0"><span class="mut">Ingreso estimado</span><b class="num">' + fmt(o.income) + '</b></div>' +
      '<div class="row between" style="padding:4px 0"><span class="mut">Gastos presupuestados</span><b class="num">' + fmt(o.budget) + '</b></div>' +
      '<div class="row between" style="padding:4px 0"><span class="mut">Dinero disponible</span><b class="num ok" style="font-size:17px">' + fmt(o.disp) + '</b></div>' +
      '<div class="row between" style="padding:4px 0"><span class="mut">Capacidad de ahorro</span><b class="num">' + fmt(L.capacity(S, o.disp)) + '</b></div></div></div>';
    let h = scen('Escenario actual', monthName(curMonth()), pr.now);
    if (pr.after) h += scen('Después de terminar ' + pr.after.name, pr.after.remaining > 0 ? 'desde ' + monthName(pr.after.month) : 'ya terminó', pr.after);
    h += '<div class="card"><h3>Simulador</h3><div class="seg">' + [['now', 'Actual'], ['after', pr.after ? 'Tras ' + pr.after.name : 'Sin deudas']].map(([k, l]) => '<button data-act="simBase" data-v="' + k + '" class="' + (ui.sim.base === k ? 'on' : '') + '">' + l + '</button>').join('') + '</div>' +
      '<label class="lab">Cambio en ingresos al mes (ej. 50 o -30)</label><input class="fld" inputmode="decimal" data-sim="dInc" value="' + esc(ui.sim.dInc) + '">' +
      '<label class="lab">Cambio en gastos al mes (ej. 25 o -10)</label><input class="fld" inputmode="decimal" data-sim="dExp" value="' + esc(ui.sim.dExp) + '">' +
      '<div class="mt2" id="simout">' + simOut() + '</div></div>';
    const maxD = Math.max.apply(null, pr.timeline.map((x) => x.disp).concat([1]));
    h += '<div class="card"><h3>Próximos 12 meses</h3>' + pr.timeline.map((x, i) => {
      const prev = i ? pr.timeline[i - 1].disp : null;
      return '<div class="tl"><span class="mut">' + L.monthLabel(x.month, true) + '</span>' + bar((x.disp / maxD) * 100, prev != null && x.disp > prev ? 'ok' : '') + '<b class="num" style="text-align:right">' + fmt(x.disp) + '</b></div>';
    }).join('') + '<p class="tiny mut mt">Dinero disponible por mes según tu presupuesto actual. Sube cuando una deuda termina.</p></div>';
    return h;
  }

  function setView() {
    const s = S.settings;
    let h = '<h1 class="title">Ajustes</h1>';
    h += '<div class="card"><h3>Ingresos mensuales</h3><div class="small">' +
      [['Sueldo', s.salary], ['Fondo de reserva', s.reserve], ['Aporte personal al IESS', -s.iess]].map(([n, v]) => '<div class="row between" style="padding:4px 0"><span class="mut">' + n + '</span><b class="num">' + fmt(v) + '</b></div>').join('') +
      '<div class="row between" style="padding:8px 0 0;border-top:1px solid var(--line);margin-top:6px"><span>Ingreso neto</span><b class="num">' + fmt(L.netIncome(s)) + '</b></div></div><button class="btn sec sm mt" data-act="editIncome">Editar ingresos</button></div>';
    h += '<div class="card"><h3>Presupuesto mensual</h3><div class="list">' + S.budget.map((b) => {
      const tags = (b.future ? ' <span class="pill">Futuro</span>' : '') + (b.kind === 'variable' ? ' <span class="pill">Variable</span>' : '') + (b.debtId ? ' <span class="pill">Deuda</span>' : '');
      return '<div class="it" data-act="editBudget" data-id="' + b.id + '"><div class="ico">' + ic(b.name) + '</div><div class="grow"><div class="t">' + esc(b.name) + tags + '</div><div class="d">' + fmt(b.amount) + (b.kind === 'variable' ? '' : ' · día ' + b.day) + '</div></div>' +
        '<label class="sw" data-stop="1"><input type="checkbox" data-bsw="' + b.id + '" ' + (b.active ? 'checked' : '') + '><span></span></label></div>';
    }).join('') + '</div><div class="row between mt"><b>Total activo</b><b class="num">' + fmt(L.budgetTotal(S, curMonth())) + '</b></div>' +
      '<p class="tiny mut mt">Con el interruptor activas o desactivas cualquier gasto (útil para gastos futuros).</p><button class="btn sec sm mt" data-act="addBudget">+ Agregar gasto</button></div>';
    h += '<div class="card"><h3>Preferencias</h3><div class="seg">' + [['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']].map(([k, l]) => '<button data-act="theme" data-v="' + k + '" class="' + (s.theme === k ? 'on' : '') + '">' + l + '</button>').join('') + '</div>' +
      '<div class="row between mt"><span class="small">Alerta de alimentación al <b>' + s.alertPct + '%</b></span><button class="btn sec sm" style="width:auto;padding:0 16px" data-act="editPrefs">Cambiar</button></div></div>';
    h += '<div class="card"><h3>Seguridad</h3>' + (s.pinHash
      ? '<p class="small mut">PIN activado. Se pide al abrir la app y tras ' + s.autoLock + ' s fuera de ella.</p><div class="btns two mt"><button class="btn sec sm" data-act="lockNow">Bloquear ahora</button><button class="btn sec sm" data-act="setPin">Cambiar PIN</button></div><button class="btn danger sm mt" data-act="removePin">Quitar PIN</button>'
      : '<p class="small mut">Protege la app con un PIN de 4 a 6 dígitos.</p><button class="btn sec sm mt" data-act="setPin">Crear PIN</button>') +
      '<p class="tiny mut mt">Face ID no está disponible para apps web instaladas en el iPhone, por eso se usa PIN. Tus datos nunca salen del dispositivo.</p></div>';
    h += '<div class="card"><h3>Respaldo de datos</h3><p class="small mut">Tus datos viven solo en este dispositivo. Haz un respaldo de vez en cuando.' + (s.lastBackup ? ' Último respaldo: ' + s.lastBackup + '.' : ' Aún no has hecho uno.') + '</p>' +
      '<div class="btns mt"><button class="btn sm" data-act="exportJSON">Exportar respaldo (JSON)</button><button class="btn sec sm" data-act="exportCSV">Exportar movimientos (CSV)</button><button class="btn sec sm" data-act="importJSON">Importar respaldo</button><button class="btn danger sm" data-act="reset">Borrar todo y empezar de cero</button></div>' +
      '<input type="file" id="importFile" accept=".json,application/json" style="display:none"></div>';
    return h + '<p class="tiny mut" style="text-align:center">Mis Finanzas · versión 1.0</p>';
  }

  /* ---------- Render principal ---------- */
  const ICONS = {
    home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    mov: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    cal: '<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M8 2v4M16 2v4M3 10h18"/>',
    plan: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><path d="M12 12h.01"/>',
    set: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  };
  function tabbar() {
    const tabs = [['home', 'Inicio'], ['mov', 'Movimientos'], ['cal', 'Calendario'], ['plan', 'Planes'], ['set', 'Ajustes']];
    return '<nav class="tabbar"><div class="in">' + tabs.map(([k, l]) => '<button class="' + (ui.tab === k ? 'on' : '') + '" data-act="tab" data-v="' + k + '"><svg viewBox="0 0 24 24">' + ICONS[k] + '</svg>' + l + '</button>').join('') + '</div></nav>';
  }
  function render() {
    const y = ui.tab === ui.lastTab ? window.scrollY : 0;
    ui.lastTab = ui.tab;
    let body;
    if (ui.tab === 'home') body = homeView();
    else if (ui.tab === 'mov') body = movView();
    else if (ui.tab === 'cal') body = calView();
    else if (ui.tab === 'plan') body = planView();
    else body = setView();
    const fab = ['home', 'mov', 'cal'].includes(ui.tab) ? '<button class="fab" data-act="add">+ Registrar movimiento</button>' : '';
    $('#app').innerHTML = '<main class="page">' + body + '</main>' + fab + tabbar();
    window.scrollTo(0, y);
  }
  function setMonth(m) {
    ui.month = m; ui.calSel = null;
    ensureMonth(m);
    render();
  }

  /* ---------- PIN ---------- */
  async function hashPin(pin, salt) {
    const s = salt + ':' + pin;
    if (window.crypto && window.crypto.subtle) {
      const buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return 'x' + h;
  }
  function drawLock() {
    const n = S.settings.pinLen || 4;
    const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => '<button data-act="pk" data-v="' + k + '">' + k + '</button>').join('');
    $('#lock').innerHTML = '<div style="font-size:46px">🔒</div><h2 style="margin-top:8px">Mis Finanzas</h2><p class="sub">Ingresa tu PIN</p>' +
      '<div class="pindots">' + Array.from({ length: n }, (_, i) => '<i class="' + (i < ui.pin.length ? 'f' : '') + '"></i>').join('') + '</div>' +
      '<div class="pad">' + keys + '<span></span><button data-act="pk" data-v="0">0</button><button data-act="pk" data-v="del">⌫</button></div>';
  }
  function showLock() { ui.locked = true; ui.pin = ''; $('#lock').classList.add('on'); drawLock(); }
  function hideLock() { ui.locked = false; ui.pin = ''; $('#lock').classList.remove('on'); $('#lock').innerHTML = ''; }
  function pressKey(v) {
    const n = S.settings.pinLen || 4;
    if (v === 'del') ui.pin = ui.pin.slice(0, -1);
    else if (ui.pin.length < n) ui.pin += v;
    drawLock();
    if (ui.pin.length === n) {
      hashPin(ui.pin, S.settings.pinSalt).then((h) => {
        if (h === S.settings.pinHash) hideLock();
        else { ui.pin = ''; drawLock(); toast('PIN incorrecto'); }
      });
    }
  }
  function setPin() {
    openGen(S.settings.pinHash ? 'Cambiar PIN' : 'Crear PIN', [
      { k: 'p1', label: 'Nuevo PIN (4 a 6 dígitos)', type: 'pin', v: '' },
      { k: 'p2', label: 'Repite el PIN', type: 'pin', v: '' },
      { k: 'n', type: 'note', label: 'Si olvidas el PIN tendrás que borrar los datos de la app (Safari → Ajustes → Avanzado → Datos de sitios web). Por eso conviene tener un respaldo.' },
    ], () => {
      const p1 = String(ui.gen.values.p1 || ''), p2 = String(ui.gen.values.p2 || '');
      if (!/^\d{4,6}$/.test(p1)) { toast('El PIN debe tener de 4 a 6 números.'); return false; }
      if (p1 !== p2) { toast('Los PIN no coinciden.'); return false; }
      const salt = L.uid();
      hashPin(p1, salt).then((h) => {
        S.settings.pinSalt = salt; S.settings.pinHash = h; S.settings.pinLen = p1.length;
        save(); closeSheet(); render(); toast('PIN activado ✓');
      });
      return false;
    });
  }

  /* ---------- Respaldo ---------- */
  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  async function exportFile(name, text, type) {
    try {
      const file = new File([text], name, { type });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: name });
        return true;
      }
    } catch (e) { if (e && e.name === 'AbortError') return false; }
    download(name, text, type);
    return true;
  }
  async function exportJSON() {
    if (await exportFile('mis-finanzas-' + L.todayStr() + '.json', JSON.stringify(S, null, 2), 'application/json')) {
      S.settings.lastBackup = L.todayStr(); save(); render(); toast('Respaldo listo. Guárdalo en Archivos o iCloud.');
    }
  }
  function importJSON(file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const x = JSON.parse(r.result);
        if (!x || !Array.isArray(x.txs) || !Array.isArray(x.budget)) throw new Error('formato');
        if (!confirm('Esto reemplazará todos los datos actuales por los del respaldo (' + x.txs.length + ' movimientos). ¿Continuar?')) return;
        S = L.normalizeState(x);
        save(); applyTheme(); ensureMonth(curMonth()); render(); toast('Respaldo importado ✓');
      } catch (e) { toast('El archivo no es un respaldo válido.'); }
    };
    r.readAsText(file);
  }

  /* ---------- Eventos ---------- */
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || (e.target.closest('[data-stop]') && el.dataset.act === 'editBudget')) return;
    const act = el.dataset.act, v = el.dataset.v, id = el.dataset.id;
    const f = ui.form;
    switch (act) {
      case 'tab': ui.tab = v; ui.month = ui.month || curMonth(); ensureMonth(ui.month); render(); window.scrollTo(0, 0); break;
      case 'mprev': setMonth(L.monthAdd(ui.month, -1)); break;
      case 'mnext': setMonth(L.monthAdd(ui.month, 1)); break;
      case 'add': openTx(); break;
      case 'dismissSample': S.settings.sample = false; save(); render(); break;
      case 'addFood': openTx({ type: 'gasto', category: L.FOOD, method: 'credito' }); break;
      case 'addSave': openTx({ type: 'ahorro', fund: v, category: v === 'imprevistos' ? 'Imprevistos' : 'Ahorro', method: 'transferencia', amount: ns(v === 'imprevistos' ? S.settings.alloc.imprevistos : S.settings.alloc.ahorro) }); break;
      case 'payDebt': { const d = S.debts.find((x) => x.id === id); openTx({ type: 'deuda', debtId: id, category: d.name, method: 'transferencia', amount: ns(d.payment) }); break; }
      case 'edit': {
        const t = S.txs.find((x) => x.id === id);
        if (!t) break;
        ui.form = newForm({ id: t.id, type: t.type, amount: ns(t.amount), category: t.category, date: t.date, method: t.method, desc: t.desc || '', recurring: !!t.recurring, paid: !!t.paid, sub: t.sub || 'supermercado', debtId: t.debtId || null, fund: t.fund || 'ahorro', withdraw: !!t.withdraw });
        renderTx(false);
        break;
      }
      case 'togglePaid': {
        const t = S.txs.find((x) => x.id === id);
        if (t) { t.paid = !t.paid; save(); render(); if (t.paid && t.type === 'deuda') toast('Pago registrado ✓'); }
        break;
      }
      case 'closeSheet': closeSheet(); break;
      case 'ftype': {
        f.type = v;
        if (v === 'gasto') f.category = L.FOOD;
        else if (v === 'ingreso') f.category = 'Ingreso extra';
        else if (v === 'ahorro') { f.category = 'Ahorro'; f.fund = 'ahorro'; }
        else {
          const d = S.debts.find((x) => L.debtStats(S, x).remaining > 0) || S.debts[0];
          f.debtId = d ? d.id : null; f.category = d ? d.name : '';
          if (d && !f.amount) f.amount = ns(d.payment);
        }
        renderTx(true); break;
      }
      case 'fcat': f.category = v; renderTx(true); break;
      case 'fsub': f.sub = v; renderTx(true); break;
      case 'fmethod': f.method = v; renderTx(true); break;
      case 'ffund': f.fund = v; renderTx(true); break;
      case 'fdebt': { f.debtId = v; const d = S.debts.find((x) => x.id === v); f.category = d ? d.name : ''; if (d && !f.amount) f.amount = ns(d.payment); renderTx(true); break; }
      case 'saveTx': saveTx(); break;
      case 'delTx': delTx(); break;
      case 'filter': ui.filter = v; render(); break;
      case 'calday': ui.calSel = Number(v); render(); break;
      case 'genMonth': { const n = L.generateMonth(S, ui.month); save(); render(); toast(n ? n + ' pagos generados' : 'No había nada nuevo: no se duplicó nada ✓'); break; }
      case 'plan': ui.plan = v; render(); window.scrollTo(0, 0); break;
      case 'simBase': ui.sim.base = v; render(); break;
      case 'editDebt': editDebt(id); break;
      case 'addDebt': editDebt(null); break;
      case 'editBudget': editBudget(id); break;
      case 'addBudget': editBudget(null); break;
      case 'editIncome': editIncome(); break;
      case 'editPrefs': editPrefs(); break;
      case 'editGoals': editGoals(); break;
      case 'theme': S.settings.theme = v; save(); applyTheme(); render(); break;
      case 'setPin': setPin(); break;
      case 'removePin':
        if (confirm('¿Quitar el PIN?')) { S.settings.pinHash = null; S.settings.pinSalt = null; save(); render(); toast('PIN eliminado'); }
        break;
      case 'lockNow': showLock(); break;
      case 'pk': pressKey(v); break;
      case 'gsave': { const g = ui.gen; if (g && g.onSave() === false) { /* se queda abierto */ } break; }
      case 'gdel': { const g = ui.gen; if (g && g.onDelete) g.onDelete(); break; }
      case 'exportJSON': exportJSON(); break;
      case 'exportCSV': exportFile('mis-finanzas-' + L.todayStr() + '.csv', L.toCSV(S), 'text/csv').then((ok) => ok && toast('CSV listo')); break;
      case 'importJSON': $('#importFile').click(); break;
      case 'reset':
        if (confirm('Se borrarán TODOS tus datos de este dispositivo. ¿Continuar?') && confirm('Última confirmación: esta acción no se puede deshacer. ¿Borrar todo?')) {
          S = L.defaultState(); save(); applyTheme(); ui.month = curMonth(); ensureMonth(ui.month); render(); toast('Datos reiniciados');
        }
        break;
      default: break;
    }
  });
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.f && ui.form) ui.form[t.dataset.f] = t.type === 'checkbox' ? t.checked : t.value;
    else if (t.dataset.g && ui.gen) ui.gen.values[t.dataset.g] = t.type === 'checkbox' ? t.checked : t.value;
    else if (t.dataset.sim) { ui.sim[t.dataset.sim] = t.value; const o = $('#simout'); if (o) o.innerHTML = simOut(); }
  });
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.bsw) {
      const b = S.budget.find((x) => x.id === t.dataset.bsw);
      if (b) { b.active = t.checked; save(); render(); toast((b.active ? 'Incluido: ' : 'Excluido: ') + b.name); }
    } else if (t.id === 'importFile' && t.files && t.files[0]) {
      importJSON(t.files[0]); t.value = '';
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { ui.hiddenAt = Date.now(); return; }
    if (S.settings.pinHash && !ui.locked && ui.hiddenAt && Date.now() - ui.hiddenAt > (S.settings.autoLock || 30) * 1000) showLock();
    if (curMonth() !== ui.curMonth) { ui.curMonth = curMonth(); ui.month = ui.curMonth; ensureMonth(ui.month); render(); }
  });

  /* ---------- Inicio ---------- */
  applyTheme();
  ensureMonth(curMonth());
  save();
  render();
  if (S.settings.pinHash) showLock();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
