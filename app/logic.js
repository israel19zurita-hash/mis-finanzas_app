/* Mis Finanzas - lógica pura (sin DOM). Se usa en el navegador (window.Fin) y en Node para pruebas. */
(function (root) {
  'use strict';

  const FOOD = 'Alimentación';
  const GUSTOS = 'Gustos y salidas';
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const pad = (n) => String(n).padStart(2, '0');
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  function todayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function monthAdd(m, k) {
    let [y, mo] = m.split('-').map(Number);
    mo += k;
    y += Math.floor((mo - 1) / 12);
    mo = (((mo - 1) % 12) + 12) % 12 + 1;
    return y + '-' + pad(mo);
  }
  function monthDiff(a, b) {
    const [ya, ma] = a.split('-').map(Number);
    const [yb, mb] = b.split('-').map(Number);
    return (yb - ya) * 12 + (mb - ma);
  }
  function daysInMonth(m) {
    const [y, mo] = m.split('-').map(Number);
    return new Date(y, mo, 0).getDate();
  }
  function monthLabel(m, short) {
    const [y, mo] = m.split('-').map(Number);
    const n = MONTHS[mo - 1];
    return short ? n.slice(0, 3) + ' ' + y : n.charAt(0).toUpperCase() + n.slice(1) + ' ' + y;
  }
  function parseNum(s) {
    if (typeof s === 'number') return s;
    s = String(s == null ? '' : s).trim().replace(/[$\s]/g, '');
    if (!s) return 0;
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }
  function fmt(n) {
    n = r2(n);
    const neg = n < 0;
    const parts = Math.abs(n).toFixed(2).split('.');
    const ip = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (neg ? '-' : '') + '$' + ip + ',' + parts[1];
  }

  /* ---------- Datos iniciales: plantilla NEUTRA con montos de ejemplo ---------- */
  function defaultState(today) {
    const m = (today || todayStr()).slice(0, 7);
    return {
      v: 1,
      startMonth: m,
      settings: {
        sample: true,
        fresh: false,
        salary: 800,
        reserve: 0,
        iess: 0,
        payDay: 1,
        alertPct: 80,
        alloc: { ahorro: 100, gustos: 40, imprevistos: 40 },
        goalName: 'Meta de ahorro',
        goalAmount: 1200,
        ahorro0: 0,
        imprev0: 0,
        theme: 'auto',
        pinHash: null,
        pinSalt: null,
        autoLock: 30,
      },
      budget: [
        { id: 'b_vivienda', name: 'Vivienda', amount: 150, day: 5, active: true, kind: 'fijo' },
        { id: 'b_servicios', name: 'Servicios básicos', amount: 60, day: 10, active: true, kind: 'fijo' },
        { id: 'b_educacion', name: 'Educación', amount: 80, day: 5, active: true, kind: 'fijo' },
        { id: 'b_tarjeta', name: 'Tarjeta', amount: 50, day: 15, active: true, kind: 'fijo', debtId: 'd_tarjeta' },
        { id: 'b_prestamo', name: 'Préstamo', amount: 100, day: 20, active: true, kind: 'fijo', debtId: 'd_prestamo' },
        { id: 'b_food', name: FOOD, amount: 100, day: 1, active: true, kind: 'variable', isFood: true },
        { id: 'b_transp', name: 'Transporte', amount: 40, day: 1, active: true, kind: 'variable' },
        { id: 'b_salud', name: 'Salud', amount: 40, day: 25, active: true, kind: 'fijo', future: true },
      ],
      debts: [
        { id: 'd_tarjeta', name: 'Tarjeta', payment: 50, total: 3, paidBase: 0, principal: null },
        { id: 'd_prestamo', name: 'Préstamo', payment: 100, total: 12, paidBase: 0, principal: null },
      ],
      txs: [],
      skipped: [],
    };
  }

  function netIncome(set) {
    return r2(set.salary + set.reserve - set.iess);
  }

  /* ---------- Deudas ---------- */
  function debtStats(S, d) {
    const px = S.txs.filter((t) => t.type === 'deuda' && t.debtId === d.id && t.paid);
    const paid = Math.min(d.total, d.paidBase + px.length);
    const remaining = Math.max(0, d.total - paid);
    let next = S.startMonth;
    if (px.length) {
      const last = px.map((t) => t.date.slice(0, 7)).sort().pop();
      next = monthAdd(last, 1);
    }
    return {
      paid,
      remaining,
      progress: d.total ? paid / d.total : 0,
      next,
      end: monthAdd(next, remaining), // primer mes sin pago
      paidAmount: r2(paid * d.payment),
      remainingAmount: r2(remaining * d.payment),
      txCount: px.length,
    };
  }
  function setDebtRemaining(S, d, remaining) {
    const st = debtStats(S, d);
    d.paidBase = Math.max(0, d.total - remaining - st.txCount);
  }

  function budgetActive(S, b, m) {
    if (!b.active) return false;
    if (b.debtId) {
      const d = S.debts.find((x) => x.id === b.debtId);
      if (d) {
        if (m < S.startMonth) return true;
        return m < debtStats(S, d).end;
      }
    }
    return true;
  }
  function budgetItems(S, m) {
    return S.budget.filter((b) => budgetActive(S, b, m));
  }
  function budgetTotal(S, m) {
    return r2(budgetItems(S, m).reduce((a, b) => a + b.amount, 0));
  }

  /* ---------- Resumen mensual ---------- */
  function monthTxs(S, m) {
    return S.txs.filter((t) => t.date.slice(0, 7) === m);
  }

  function summary(S, m, today) {
    today = today || todayStr();
    const net = netIncome(S.settings);
    const txs = monthTxs(S, m);
    let extra = 0, extraPending = 0, spentPaid = 0, pending = 0, ahorroMes = 0, imprevMes = 0;
    const byCat = {};
    for (const t of txs) {
      if (t.type === 'ingreso') {
        if (t.paid) extra += t.amount; else extraPending += t.amount;
      } else if (t.type === 'gasto' || t.type === 'deuda') {
        byCat[t.category] = (byCat[t.category] || 0) + t.amount;
        if (t.paid) spentPaid += t.amount; else pending += t.amount;
      } else if (t.type === 'ahorro' && t.paid) {
        const v = (t.withdraw ? -1 : 1) * t.amount;
        if (t.fund === 'imprevistos') imprevMes += v; else ahorroMes += v;
      }
    }
    const income = r2(net + extra);
    const items = budgetItems(S, m);
    const handled = new Set();
    let commit = 0;
    const lines = items.map((b) => {
      const spent = r2(byCat[b.name] || 0);
      handled.add(b.name);
      const c = Math.max(b.amount, spent);
      commit += c;
      return { id: b.id, name: b.name, budget: b.amount, spent, commit: r2(c), over: spent > b.amount + 0.004, variable: b.kind === 'variable' };
    });
    let others = 0;
    for (const k in byCat) if (!handled.has(k) && k !== GUSTOS) others += byCat[k];
    commit = r2(commit);
    others = r2(others);
    const disponible = r2(income - commit - others);

    const foodItem = S.budget.find((b) => b.isFood);
    const limit = foodItem ? foodItem.amount : 0;
    const foodTx = txs.filter((t) => t.type === 'gasto' && t.category === FOOD);
    const sub = { supermercado: 0, casa: 0, salida: 0 };
    let card = 0;
    for (const t of foodTx) {
      sub[t.sub in sub ? t.sub : 'supermercado'] += t.amount;
      if (t.method === 'credito') card += t.amount;
    }
    const foodSpent = r2(foodTx.reduce((a, t) => a + t.amount, 0));
    const food = {
      limit, spent: foodSpent, avail: r2(limit - foodSpent),
      pct: limit ? (foodSpent / limit) * 100 : 0,
      sub: { supermercado: r2(sub.supermercado), casa: r2(sub.casa), salida: r2(sub.salida) },
      card: r2(card),
    };
    const gustosSpent = r2(byCat[GUSTOS] || 0);
    const gustos = { plan: S.settings.alloc.gustos, spent: gustosSpent, avail: r2(S.settings.alloc.gustos - gustosSpent) };

    return {
      month: m, net, extra: r2(extra), extraPending: r2(extraPending), income,
      budget: budgetTotal(S, m), commit, others, disponible,
      spentPaid: r2(spentPaid), pending: r2(pending), byCat, lines,
      ahorroMes: r2(ahorroMes), imprevMes: r2(imprevMes), food, gustos,
    };
  }

  function alerts(S, sm, today) {
    today = today || todayStr();
    const a = [];
    const f = sm.food;
    if (f.limit > 0) {
      if (f.spent > f.limit + 0.004) a.push({ lvl: 'bad', t: 'Superaste el presupuesto de alimentación por ' + fmt(f.spent - f.limit) + '.' });
      else if (f.pct >= S.settings.alertPct) a.push({ lvl: 'warn', t: 'Llevas el ' + Math.round(f.pct) + '% de tu presupuesto de alimentación. Te quedan ' + fmt(f.avail) + '.' });
    }
    for (const l of sm.lines) {
      if (l.over && l.name !== FOOD) a.push({ lvl: 'warn', t: l.name + ' superó su presupuesto (' + fmt(l.spent) + ' de ' + fmt(l.budget) + ').' });
    }
    if (sm.gustos.avail < -0.004) a.push({ lvl: 'warn', t: 'Gastaste ' + fmt(-sm.gustos.avail) + ' más de lo previsto en gustos y salidas.' });
    const overdue = S.txs.filter((t) => !t.paid && (t.type === 'gasto' || t.type === 'deuda') && t.date < today && t.date.slice(0, 7) === sm.month);
    if (overdue.length) a.push({ lvl: 'bad', t: overdue.length + (overdue.length === 1 ? ' pago vencido sin marcar como pagado.' : ' pagos vencidos sin marcar como pagados.') });
    if (sm.disponible < -0.004) a.push({ lvl: 'bad', t: 'Tus gastos superan tu ingreso del mes por ' + fmt(-sm.disponible) + '.' });
    return a;
  }

  function upcoming(S, today, limit) {
    return S.txs
      .filter((t) => !t.paid && (t.type === 'gasto' || t.type === 'deuda'))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .filter((t) => t.date >= monthAdd(today.slice(0, 7), -1) + '-01')
      .slice(0, limit || 5);
  }

  /* ---------- Ahorro ---------- */
  function savings(S) {
    let a = S.settings.ahorro0 || 0, i = S.settings.imprev0 || 0;
    for (const t of S.txs) {
      if (t.type !== 'ahorro' || !t.paid) continue;
      const v = (t.withdraw ? -1 : 1) * t.amount;
      if (t.fund === 'imprevistos') i += v; else a += v;
    }
    a = r2(a); i = r2(i);
    const goal = S.settings.goalAmount || 0;
    return { ahorro: a, imprevistos: i, goal, goalPct: goal ? Math.max(0, Math.min(100, (a / goal) * 100)) : 0, goalLeft: r2(Math.max(0, goal - a)) };
  }

  /* En el mes de instalación, las fechas que ya pasaron se mueven a hoy para no mostrar "vencidos" falsos. */
  function dueDate(S, m, day, today) {
    let d = m + '-' + pad(Math.min(day || 1, daysInMonth(m)));
    if (m === S.startMonth && m === today.slice(0, 7) && d < today) d = today;
    return d;
  }

  /* ---------- Generación de pagos recurrentes (sin duplicar) ---------- */
  function generateMonth(S, m, today) {
    today = today || todayStr();
    let n = 0;
    for (const b of S.budget) {
      if (b.kind === 'variable') continue;
      if (!budgetActive(S, b, m)) continue;
      const key = 'b:' + b.id + ':' + m;
      if (S.txs.some((t) => t.recKey === key) || S.skipped.includes(key)) continue;
      // ya existe un registro manual de esa categoría en el mes -> no crear otro
      if (S.txs.some((t) => t.date.slice(0, 7) === m && (t.type === 'gasto' || t.type === 'deuda') && t.category === b.name)) continue;
      S.txs.push({
        id: uid(), type: b.debtId ? 'deuda' : 'gasto', amount: b.amount, category: b.name,
        date: dueDate(S, m, b.day, today), method: 'transferencia',
        desc: '', recurring: true, paid: false, budgetId: b.id, debtId: b.debtId || null, recKey: key,
      });
      n++;
    }
    const sources = S.txs.filter((t) => t.recurring && !t.recKey && !t.budgetId && t.date.slice(0, 7) < m);
    for (const t of sources) {
      const key = 'r:' + t.id + ':' + m;
      if (S.txs.some((x) => x.recKey === key) || S.skipped.includes(key)) continue;
      const day = Math.min(Number(t.date.slice(8, 10)), daysInMonth(m));
      S.txs.push(Object.assign({}, t, { id: uid(), date: m + '-' + pad(day), paid: false, recurring: false, srcId: t.id, recKey: key }));
      n++;
    }
    return n;
  }

  /* ---------- Validaciones anti-duplicado ---------- */
  function checkTx(S, t, isEdit) {
    const res = {};
    if (!(t.amount > 0)) return { block: 'Ingresa un valor mayor a $0,00.' };
    const debtNames = S.debts.map((d) => d.name);
    if (t.type === 'gasto' && debtNames.includes(t.category)) {
      return { block: 'Los pagos de tarjeta o préstamo se registran como "Pago de deuda", no como gasto.' };
    }
    if (t.type === 'deuda') {
      if (t.category === FOOD) return { block: 'El pago de la tarjeta no es un gasto de alimentación. Las compras de comida se registran como gasto.' };
      if (!t.debtId || !S.debts.find((d) => d.id === t.debtId)) return { block: 'Elige a qué deuda corresponde el pago.' };
    }
    if (isEdit) return res;
    const mon = t.date.slice(0, 7);
    if ((t.type === 'gasto' || t.type === 'deuda') && t.paid) {
      const pend = S.txs.find((x) => !x.paid && x.id !== t.id && x.type === t.type && x.category === t.category &&
        x.date.slice(0, 7) === mon && (x.budgetId || x.srcId) && (t.type !== 'deuda' || x.debtId === t.debtId));
      if (pend) {
        res.complete = pend;
        res.msg = 'Ya existe "' + pend.category + '" pendiente este mes (' + fmt(pend.amount) + '). ¿Marcarlo como pagado en lugar de crear otro registro?';
        return res;
      }
    }
    if (t.type === 'deuda' && t.paid) {
      const already = S.txs.find((x) => x.type === 'deuda' && x.paid && x.debtId === t.debtId && x.date.slice(0, 7) === mon);
      if (already) { res.warn = 'Ya registraste un pago de ' + t.category + ' en este mes. ¿Guardar otro de todos modos?'; return res; }
      const d = S.debts.find((x) => x.id === t.debtId);
      if (d && debtStats(S, d).remaining === 0) { res.warn = t.category + ' no tiene cuotas pendientes. ¿Registrar el pago igualmente?'; return res; }
    }
    const dup = S.txs.find((x) => x.type === t.type && x.amount === t.amount && x.date === t.date &&
      x.category === t.category && x.method === t.method && (x.desc || '') === (t.desc || ''));
    if (dup) res.warn = 'Ya existe un movimiento idéntico (mismo valor, fecha, categoría y método). ¿Guardar de todos modos?';
    return res;
  }

  /* ---------- Proyección ---------- */
  function projection(S, thisMonth) {
    const net = netIncome(S.settings);
    const now = budgetTotal(S, thisMonth);
    const out = {
      now: { income: net, budget: now, disp: r2(net - now) },
      timeline: [],
      after: null,
    };
    let best = null;
    for (const d of S.debts) {
      const st = debtStats(S, d);
      if (st.remaining > 0 && (!best || st.end < best.st.end)) best = { d, st };
    }
    if (best) {
      const b = budgetTotal(S, best.st.end);
      out.after = { name: best.d.name, month: best.st.end, income: net, budget: b, disp: r2(net - b), remaining: best.st.remaining };
    }
    for (let i = 0; i < 12; i++) {
      const m = monthAdd(thisMonth, i);
      const b = budgetTotal(S, m);
      out.timeline.push({ month: m, budget: b, disp: r2(net - b) });
    }
    return out;
  }
  function capacity(S, disp) {
    const a = S.settings.alloc;
    return r2(disp - a.gustos - a.imprevistos);
  }

  /* ---------- Exportar / importar ---------- */
  function toCSV(S) {
    const head = ['fecha', 'tipo', 'categoria', 'detalle', 'valor', 'metodo', 'estado', 'descripcion'];
    const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const rows = S.txs.slice().sort((a, b) => (a.date < b.date ? -1 : 1)).map((t) => [
      t.date, t.type, t.category, t.sub || t.fund || '', String(t.amount).replace('.', ','), t.method, t.paid ? 'pagado' : 'pendiente', t.desc || '',
    ]);
    return '\ufeff' + [head].concat(rows).map((r) => r.map(esc).join(';')).join('\r\n');
  }
  function normalizeState(x, today) {
    const d = defaultState(today);
    if (!x || typeof x !== 'object') return d;
    const s = Object.assign({}, d, x);
    s.settings = Object.assign({}, d.settings, x.settings || {});
    s.settings.alloc = Object.assign({}, d.settings.alloc, (x.settings && x.settings.alloc) || {});
    ['budget', 'debts', 'txs', 'skipped'].forEach((k) => { if (!Array.isArray(s[k])) s[k] = d[k]; });
    if (!s.startMonth) s.startMonth = d.startMonth;
    if (s.settings.fresh) { s.startMonth = (today || todayStr()).slice(0, 7); s.settings.fresh = false; }
    return s;
  }

  const api = {
    FOOD, GUSTOS, MONTHS, r2, pad, uid, todayStr, monthAdd, monthDiff, daysInMonth, monthLabel, parseNum, fmt,
    defaultState, netIncome, debtStats, setDebtRemaining, budgetActive, budgetItems, budgetTotal,
    monthTxs, summary, alerts, upcoming, savings, generateMonth, checkTx, projection, capacity, toCSV, normalizeState,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Fin = api;
})(typeof window !== 'undefined' ? window : globalThis);
