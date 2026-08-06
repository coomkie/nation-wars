const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

type Nation = { id: string; name: string; flagUrl: string };
type UnitType = {
  id: string;
  name: string;
  spriteKey: string;
  spriteUrl?: string | null;
  baseHp: number;
  baseAttackDamage: number;
  attackSpeed: number;
  moveSpeed: number;
  attackRange: string;
  attackRangeValue: number;
  detectionRange: number;
  scale?: number;
  isSplash?: boolean;
  splashRadius?: number | null;
  stunChance?: number;
  stunDuration?: number;
  knockbackForce?: number;
  stunResist?: number;
  knockbackResist?: number;
  aoeDamage?: number;
  blocking?: number;
};

function password(): string {
  return (
    (document.getElementById('adminPassword') as HTMLInputElement).value ||
    'changeme'
  );
}

function toast(msg: string, isError = false) {
  const el = document.getElementById('toast')!;
  el.textContent = msg;
  el.classList.toggle('error', isError);
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}

async function api(
  path: string,
  options: RequestInit & { admin?: boolean } = {},
) {
  const headers = new Headers(options.headers || {});
  if (options.admin) headers.set('x-admin-password', password());
  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = data?.message
      ? Array.isArray(data.message)
        ? data.message.join(', ')
        : data.message
      : res.statusText;
    throw new Error(msg);
  }
  return data;
}

function flagSrc(url: string) {
  if (!url) return '';
  return url.startsWith('http') ? url : `${API_URL}${url}`;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

document.querySelectorAll<HTMLButtonElement>('.nav').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`page-${btn.dataset.page}`)?.classList.add('active');
  });
});

const pwInput = document.getElementById('adminPassword') as HTMLInputElement;
pwInput.value = localStorage.getItem('nw_admin_pw') || 'changeme';
pwInput.addEventListener('change', () => {
  localStorage.setItem('nw_admin_pw', pwInput.value);
});

let nations: Nation[] = [];
let unitTypes: UnitType[] = [];

async function refreshNations() {
  nations = await api('/nations');
  const list = document.getElementById('nationList')!;
  list.innerHTML = nations
    .map(
      (n) => `
    <div class="nation-card" data-id="${n.id}">
      <img src="${flagSrc(n.flagUrl)}" alt="" />
      <strong>${escapeHtml(n.name)}</strong>
      <div class="muted" style="font-size:11px">${n.id}</div>
      <button data-del="${n.id}" class="danger" style="margin-top:8px">Delete</button>
    </div>`,
    )
    .join('');

  list.querySelectorAll<HTMLButtonElement>('[data-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete nation?')) return;
      try {
        await api(`/nations/${btn.dataset.del}`, { method: 'DELETE', admin: true });
        toast('Deleted');
        await refreshNations();
        fillSelects();
      } catch (e: any) {
        toast(e.message, true);
      }
    });
  });

  const pick = document.getElementById('bracketNationPick')!;
  pick.innerHTML = nations
    .map(
      (n) =>
        `<label><input type="checkbox" value="${n.id}" /> ${escapeHtml(n.name)}</label>`,
    )
    .join('');

  fillSelects();
}

function setUnitTypeFormMode(editing: UnitType | null) {
  const form = document.getElementById('unitTypeForm') as HTMLFormElement;
  const submitBtn = document.getElementById(
    'unitTypeSubmitBtn',
  ) as HTMLButtonElement;
  const cancelBtn = document.getElementById(
    'unitTypeCancelEdit',
  ) as HTMLButtonElement;
  const idInput = form.elements.namedItem('id') as HTMLInputElement;

  if (!editing) {
    form.reset();
    idInput.value = '';
    submitBtn.textContent = 'Create unit type';
    cancelBtn.hidden = true;
    return;
  }

  idInput.value = editing.id;
  (form.elements.namedItem('name') as HTMLInputElement).value = editing.name;
  (form.elements.namedItem('spriteKey') as HTMLInputElement).value =
    editing.spriteKey || '';
  (form.elements.namedItem('attackRange') as HTMLSelectElement).value =
    editing.attackRange || 'melee';
  (form.elements.namedItem('baseHp') as HTMLInputElement).value = String(
    editing.baseHp,
  );
  (form.elements.namedItem('baseAttackDamage') as HTMLInputElement).value =
    String(editing.baseAttackDamage);
  (form.elements.namedItem('attackSpeed') as HTMLInputElement).value = String(
    editing.attackSpeed,
  );
  (form.elements.namedItem('moveSpeed') as HTMLInputElement).value = String(
    editing.moveSpeed,
  );
  (form.elements.namedItem('attackRangeValue') as HTMLInputElement).value =
    String(editing.attackRangeValue);
  (form.elements.namedItem('detectionRange') as HTMLInputElement).value =
    String(editing.detectionRange);
  (form.elements.namedItem('scale') as HTMLInputElement).value = String(
    editing.scale ?? 1,
  );
  (form.elements.namedItem('isSplash') as HTMLInputElement).checked = !!editing.isSplash;
  (form.elements.namedItem('splashRadius') as HTMLInputElement).value = String(
    editing.splashRadius ?? 90,
  );
  (form.elements.namedItem('stunChance') as HTMLInputElement).value = String(
    editing.stunChance ?? 0,
  );
  (form.elements.namedItem('stunDuration') as HTMLInputElement).value = String(
    editing.stunDuration ?? 0,
  );
  (form.elements.namedItem('knockbackForce') as HTMLInputElement).value =
    String(editing.knockbackForce ?? 0);
  (form.elements.namedItem('stunResist') as HTMLInputElement).value = String(
    editing.stunResist ?? 0,
  );
  (form.elements.namedItem('knockbackResist') as HTMLInputElement).value =
    String(editing.knockbackResist ?? 0);
  (form.elements.namedItem('aoeDamage') as HTMLInputElement).value = String(
    editing.aoeDamage ?? 0,
  );
  (form.elements.namedItem('blocking') as HTMLInputElement).value = String(
    editing.blocking ?? 0,
  );
  (form.elements.namedItem('spriteUrl') as HTMLInputElement).value =
    editing.spriteUrl || '';

  submitBtn.textContent = 'Update unit type';
  cancelBtn.hidden = false;
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function refreshUnitTypes() {
  unitTypes = await api('/unit-types');
  const list = document.getElementById('unitTypeList')!;
  list.innerHTML = unitTypes
    .map(
      (t) => `
    <div class="nation-card">
      <strong>${escapeHtml(t.name)}</strong>
      <div class="muted">${escapeHtml(t.spriteKey)} · ${t.attackRange}</div>
      <div style="font-size:12px;margin-top:6px">
        HP ${t.baseHp} · DMG ${t.baseAttackDamage} · Atk/s ${t.attackSpeed}<br/>
        Move ${t.moveSpeed} · Range ${t.attackRangeValue} · Detect ${t.detectionRange} · Scale ${t.scale ?? 1}<br/>
        ${t.isSplash ? `AoE r=${t.splashRadius ?? 0} dmg=${t.aoeDamage ?? 0} · ` : ''}Stun ${Math.round((t.stunChance ?? 0) * 100)}%/${t.stunDuration ?? 0}s · KB ${t.knockbackForce ?? 0}<br/>
        Resist stun ${Math.round((t.stunResist ?? 0) * 100)}% · KB ${Math.round((t.knockbackResist ?? 0) * 100)}% · Block ${Math.round((t.blocking ?? 0) * 100)}%
      </div>
      <div class="muted" style="font-size:10px;margin-top:4px">${t.id}</div>
      <div class="row" style="margin-top:8px;gap:8px">
        <button type="button" data-edit-ut="${t.id}">Edit</button>
        <button type="button" data-del-ut="${t.id}" class="danger">Delete</button>
      </div>
    </div>`,
    )
    .join('');

  list.querySelectorAll<HTMLButtonElement>('[data-edit-ut]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const t = unitTypes.find((u) => u.id === btn.dataset.editUt);
      if (t) setUnitTypeFormMode(t);
    });
  });

  list.querySelectorAll<HTMLButtonElement>('[data-del-ut]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete unit type?')) return;
      try {
        await api(`/unit-types/${btn.dataset.delUt}`, {
          method: 'DELETE',
          admin: true,
        });
        toast('Deleted');
        const form = document.getElementById('unitTypeForm') as HTMLFormElement;
        const idInput = form.elements.namedItem('id') as HTMLInputElement;
        if (idInput.value === btn.dataset.delUt) setUnitTypeFormMode(null);
        await refreshUnitTypes();
      } catch (e: any) {
        toast(e.message, true);
      }
    });
  });

  fillUnitTypeSelects();
}

function fillUnitTypeSelects() {
  const opts = unitTypes
    .map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`)
    .join('');
  const def = document.getElementById(
    'defaultUnitTypeSelect',
  ) as HTMLSelectElement;
  if (def) {
    const prev = def.value;
    def.innerHTML = opts;
    if (prev) def.value = prev;
  }
  const mock = document.getElementById(
    'mockUnitTypeSelect',
  ) as HTMLSelectElement;
  if (mock) {
    const prev = mock.value;
    mock.innerHTML =
      `<option value="">Default unit type</option>` + opts;
    if (prev) mock.value = prev;
  }
}

function fillSelects() {
  const opts = nations
    .map((n) => `<option value="${n.id}">${escapeHtml(n.name)}</option>`)
    .join('');
  for (const name of ['nationAId', 'nationBId', 'defaultNationId']) {
    const el = document.querySelector<HTMLSelectElement>(
      `#matchForm [name="${name}"]`,
    );
    if (el) {
      const prev = el.value;
      el.innerHTML = opts;
      if (prev) el.value = prev;
    }
  }
  syncDefaultOptions();
  fillUnitTypeSelects();
}

function syncDefaultOptions() {
  const a = document.querySelector<HTMLSelectElement>(
    '#matchForm [name="nationAId"]',
  );
  const b = document.querySelector<HTMLSelectElement>(
    '#matchForm [name="nationBId"]',
  );
  const d = document.querySelector<HTMLSelectElement>(
    '#matchForm [name="defaultNationId"]',
  );
  if (!a || !b || !d) return;
  const allowed = new Set([a.value, b.value]);
  [...d.options].forEach((o) => {
    o.hidden = !allowed.has(o.value);
  });
  if (!allowed.has(d.value)) d.value = a.value;
}

document
  .querySelectorAll('#matchForm [name="nationAId"], #matchForm [name="nationBId"]')
  .forEach((el) => el.addEventListener('change', syncDefaultOptions));

document.getElementById('nationForm')!.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target as HTMLFormElement;
  const fd = new FormData(form);
  if (!(fd.get('flag') as File)?.size && !fd.get('flagUrl')) {
    toast('Provide a flag file or URL', true);
    return;
  }
  if (!(fd.get('flag') as File)?.size) fd.delete('flag');
  try {
    await api('/nations', { method: 'POST', body: fd, admin: true });
    form.reset();
    toast('Nation created');
    await refreshNations();
  } catch (err: any) {
    toast(err.message, true);
  }
});

document
  .getElementById('unitTypeCancelEdit')!
  .addEventListener('click', () => setUnitTypeFormMode(null));

document.getElementById('unitTypeForm')!.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target as HTMLFormElement;
  const fd = new FormData(form);
  const editingId = String(fd.get('id') || '').trim();
  const body: Record<string, unknown> = {
    name: fd.get('name'),
    spriteKey: fd.get('spriteKey') || undefined,
    attackRange: fd.get('attackRange'),
    baseHp: Number(fd.get('baseHp')),
    baseAttackDamage: Number(fd.get('baseAttackDamage')),
    attackSpeed: Number(fd.get('attackSpeed')),
    moveSpeed: Number(fd.get('moveSpeed')),
    attackRangeValue: Number(fd.get('attackRangeValue')),
    detectionRange: Number(fd.get('detectionRange')),
    scale: Number(fd.get('scale') || 1),
    isSplash: fd.get('isSplash') === 'on',
    splashRadius: Number(fd.get('splashRadius') || 0) || null,
    stunChance: Number(fd.get('stunChance') || 0),
    stunDuration: Number(fd.get('stunDuration') || 0),
    knockbackForce: Number(fd.get('knockbackForce') || 0),
    stunResist: Number(fd.get('stunResist') || 0),
    knockbackResist: Number(fd.get('knockbackResist') || 0),
    aoeDamage: Number(fd.get('aoeDamage') || 0),
    blocking: Number(fd.get('blocking') || 0),
  };
  const spriteUrl = String(fd.get('spriteUrl') || '').trim();
  body.spriteUrl = spriteUrl || null;
  try {
    if (editingId) {
      await api(`/unit-types/${editingId}`, {
        method: 'PATCH',
        admin: true,
        body: JSON.stringify(body),
      });
      toast('Unit type updated');
    } else {
      await api('/unit-types', {
        method: 'POST',
        admin: true,
        body: JSON.stringify(body),
      });
      toast('Unit type created');
    }
    setUnitTypeFormMode(null);
    await refreshUnitTypes();
  } catch (err: any) {
    toast(err.message, true);
  }
});

async function refreshBracket() {
  const data = await api('/brackets/latest');
  const view = document.getElementById('bracketView')!;
  if (!data) {
    view.textContent = 'null (no bracket yet)';
    return;
  }
  const nameOf = (id: string | null) =>
    id ? nations.find((n) => n.id === id)?.name ?? id.slice(0, 8) : 'TBD';
  const summary = (data.nodes as any[])
    .filter((n) => n.leftChildId && n.rightChildId)
    .sort((a, b) => b.round - a.round)
    .map((n) => {
      const left = data.nodes.find((x: any) => x.id === n.leftChildId);
      const right = data.nodes.find((x: any) => x.id === n.rightChildId);
      return `R${n.round} ${nameOf(left?.nationId)} vs ${nameOf(right?.nationId)} → ${nameOf(n.nationId)}${n.id === data.rootNodeId ? ' [FINAL]' : ''}`;
    });
  view.textContent =
    `Champion: ${nameOf(data.championNationId)} | status: ${data.status}\n\n` +
    summary.join('\n') +
    `\n\n` +
    JSON.stringify(data, null, 2);
}

document.getElementById('createBracketBtn')!.addEventListener('click', async () => {
  const ids = [
    ...document.querySelectorAll<HTMLInputElement>(
      '#bracketNationPick input:checked',
    ),
  ].map((c) => c.value);
  try {
    await api('/brackets', {
      method: 'POST',
      admin: true,
      body: JSON.stringify({ nationIds: ids }),
    });
    toast('Bracket created');
    await refreshBracket();
  } catch (e: any) {
    toast(e.message, true);
  }
});

document.getElementById('archiveBracketBtn')!.addEventListener('click', async () => {
  try {
    await api('/brackets/archive', { method: 'POST', admin: true });
    toast('Archived');
    await refreshBracket();
  } catch (e: any) {
    toast(e.message, true);
  }
});

document.getElementById('matchForm')!.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target as HTMLFormElement;
  const fd = new FormData(form);

  let giftMappings: unknown[] | undefined;
  let giftUnitTypeMappings: unknown[] | undefined;
  const rawMap = String(fd.get('giftMappings') || '').trim();
  const rawType = String(fd.get('giftUnitTypeMappings') || '').trim();
  if (rawMap) {
    try {
      giftMappings = JSON.parse(rawMap);
    } catch {
      toast('Invalid giftMappings JSON', true);
      return;
    }
  }
  if (rawType) {
    try {
      giftUnitTypeMappings = JSON.parse(rawType);
    } catch {
      toast('Invalid giftUnitTypeMappings JSON', true);
      return;
    }
  }

  const body: Record<string, unknown> = {
    nationAId: fd.get('nationAId'),
    nationBId: fd.get('nationBId'),
    defaultNationId: fd.get('defaultNationId'),
    defaultUnitTypeId: fd.get('defaultUnitTypeId'),
    baseMaxHp: Number(fd.get('baseMaxHp') || 1000),
    baseAttackRange: Number(fd.get('baseAttackRange') || 220),
    baseAttackDamage: Number(fd.get('baseAttackDamage') || 8),
    baseAttackSpeed: Number(fd.get('baseAttackSpeed') || 0.5),
    durationMinutes: Number(fd.get('durationMinutes') || 15),
    intermissionSeconds: Number(fd.get('intermissionSeconds') || 20),
  };
  const nodeId = String(fd.get('bracketNodeId') || '').trim();
  if (nodeId) body.bracketNodeId = nodeId;
  if (giftMappings) body.giftMappings = giftMappings;
  if (giftUnitTypeMappings) body.giftUnitTypeMappings = giftUnitTypeMappings;

  try {
    await api('/matches', {
      method: 'POST',
      admin: true,
      body: JSON.stringify(body),
    });
    toast('Match started');
    await refreshMatch();
  } catch (err: any) {
    toast(err.message, true);
  }
});

document.getElementById('endMatchBtn')!.addEventListener('click', async () => {
  try {
    await api('/matches/end', { method: 'POST', admin: true });
    toast('Match ended');
    await refreshMatch();
    await refreshBracket();
  } catch (e: any) {
    toast(e.message, true);
  }
});

document.getElementById('nextMatchBtn')!.addEventListener('click', async () => {
  try {
    const started = await api('/matches/next', { method: 'POST', admin: true });
    if (!started) {
      toast('No playable bracket match', true);
      return;
    }
    toast('Next match started');
    await refreshMatch();
    await refreshBracket();
  } catch (e: any) {
    toast(e.message, true);
  }
});

document.getElementById('resetMatchBtn')!.addEventListener('click', async () => {
  try {
    await api('/matches/reset', { method: 'POST', admin: true });
    toast('Reset');
    await refreshMatch();
  } catch (e: any) {
    toast(e.message, true);
  }
});

document.getElementById('mockGiftForm')!.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target as HTMLFormElement;
  const fd = new FormData(form);
  const payload: Record<string, unknown> = {
    username: fd.get('username'),
    displayName: fd.get('displayName') || fd.get('username'),
    nationId: fd.get('nationId'),
    giftId: Number(fd.get('giftId')),
    giftName: fd.get('giftName'),
    diamondCount: Number(fd.get('diamondCount')),
    repeatCount: Number(fd.get('repeatCount') || 1),
  };
  const ut = String(fd.get('unitTypeId') || '').trim();
  if (ut) payload.unitTypeId = ut;
  try {
    await api('/matches/mock-gift', {
      method: 'POST',
      admin: true,
      body: JSON.stringify(payload),
    });
    toast('Gift sent');
    await refreshMatch();
  } catch (err: any) {
    toast(err.message, true);
  }
});

document.getElementById('randomGiftBtn')!.addEventListener('click', async () => {
  try {
    const match = await api('/matches/current');
    if (match.status !== 'active') {
      toast('No active match', true);
      return;
    }
    const sides = [
      { id: match.nationA.nationId, label: 'A' },
      { id: match.nationB.nationId, label: 'B' },
    ].filter((s) => s.id);
    const side = sides[Math.floor(Math.random() * sides.length)];
    const diamonds = 1 + Math.floor(Math.random() * 10);
    const n = Math.floor(Math.random() * 9000) + 1000;
    const username = `rand_user_${n}`;
    const displayName = `Rand ${n}`;
    const ut =
      unitTypes.length > 0
        ? unitTypes[Math.floor(Math.random() * unitTypes.length)]
        : null;
    const nationName =
      nations.find((x) => x.id === side.id)?.name ?? `Nation ${side.label}`;

    await api('/matches/mock-gift', {
      method: 'POST',
      admin: true,
      body: JSON.stringify({
        username,
        displayName,
        nationId: side.id,
        unitTypeId: ut?.id,
        giftId: 5655,
        giftName: 'Rose',
        diamondCount: diamonds,
        repeatCount: 1,
      }),
    });
    toast(
      `${displayName} → ${nationName}${ut ? ` (${ut.name})` : ''}: ${diamonds}💎`,
    );
    await refreshMatch();
  } catch (err: any) {
    toast(err.message, true);
  }
});

function setImagePreview(elId: string, url: string | null | undefined) {
  const img = document.getElementById(elId) as HTMLImageElement | null;
  if (!img) return;
  if (url) {
    img.src = flagSrc(url);
    img.style.display = 'block';
  } else {
    img.removeAttribute('src');
    img.style.display = 'none';
  }
}

function setBattlefieldPreview(url: string | null | undefined) {
  setImagePreview('battlefieldBgPreview', url);
}

function setStagePreview(url: string | null | undefined) {
  setImagePreview('stageBgPreview', url);
}

async function refreshBattlefieldSettings() {
  try {
    const settings = await api('/matches/settings');
    setStagePreview(settings?.stageBgUrl);
    setBattlefieldPreview(settings?.battlefieldBgUrl);
    const range = document.querySelector(
      '#matchForm [name="baseAttackRange"]',
    ) as HTMLInputElement | null;
    const dmg = document.querySelector(
      '#matchForm [name="baseAttackDamage"]',
    ) as HTMLInputElement | null;
    const spd = document.querySelector(
      '#matchForm [name="baseAttackSpeed"]',
    ) as HTMLInputElement | null;
    const hp = document.querySelector(
      '#matchForm [name="baseMaxHp"]',
    ) as HTMLInputElement | null;
    if (range && settings?.baseAttackRange != null)
      range.value = String(settings.baseAttackRange);
    if (dmg && settings?.baseAttackDamage != null)
      dmg.value = String(settings.baseAttackDamage);
    if (spd && settings?.baseAttackSpeed != null)
      spd.value = String(settings.baseAttackSpeed);
    if (hp && settings?.baseMaxHp != null) hp.value = String(settings.baseMaxHp);
  } catch {
    /* ignore */
  }
}

async function uploadBg(kind: 'stage' | 'arena', inputId: string) {
  const input = document.getElementById(inputId) as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) {
    toast('Choose an image first', true);
    return;
  }
  const fd = new FormData();
  fd.append('file', file);
  const path = kind === 'stage' ? '/matches/stage-bg' : '/matches/battlefield-bg';
  try {
    const settings = await api(path, {
      method: 'POST',
      admin: true,
      body: fd,
    });
    setStagePreview(settings?.stageBgUrl);
    setBattlefieldPreview(settings?.battlefieldBgUrl);
    input.value = '';
    toast(kind === 'stage' ? 'Stage background uploaded' : 'Arena image uploaded');
    await refreshMatch();
  } catch (e: any) {
    toast(e.message, true);
  }
}

document
  .getElementById('stageBgUploadBtn')!
  .addEventListener('click', () => void uploadBg('stage', 'stageBgFile'));

document
  .getElementById('stageBgClearBtn')!
  .addEventListener('click', async () => {
    try {
      await api('/matches/stage-bg', { method: 'DELETE', admin: true });
      setStagePreview(null);
      toast('Stage background cleared (white)');
      await refreshMatch();
    } catch (e: any) {
      toast(e.message, true);
    }
  });

document
  .getElementById('battlefieldBgUploadBtn')!
  .addEventListener('click', () => void uploadBg('arena', 'battlefieldBgFile'));

document
  .getElementById('battlefieldBgClearBtn')!
  .addEventListener('click', async () => {
    try {
      await api('/matches/battlefield-bg', { method: 'DELETE', admin: true });
      setBattlefieldPreview(null);
      toast('Arena image cleared (blue/red tint)');
      await refreshMatch();
    } catch (e: any) {
      toast(e.message, true);
    }
  });

async function refreshMatch() {
  const data = await api('/matches/current');
  document.getElementById('matchView')!.textContent = JSON.stringify(
    data,
    null,
    2,
  );
  fillMockNationSelect(data);
  setStagePreview(data?.stageBgUrl);
  setBattlefieldPreview(data?.battlefieldBgUrl);
}

function fillMockNationSelect(match: any) {
  const sel = document.getElementById('mockNationSelect') as HTMLSelectElement;
  if (!sel) return;
  const prev = sel.value;
  const aId = match?.nationA?.nationId;
  const bId = match?.nationB?.nationId;
  if (!aId || !bId || match.status !== 'active') {
    sel.innerHTML = '<option value="">No active match</option>';
    return;
  }
  const aName = nations.find((n) => n.id === aId)?.name ?? 'Nation A';
  const bName = nations.find((n) => n.id === bId)?.name ?? 'Nation B';
  sel.innerHTML = `
    <option value="${aId}">${escapeHtml(aName)} (A)</option>
    <option value="${bId}">${escapeHtml(bName)} (B)</option>
  `;
  if (prev === aId || prev === bId) sel.value = prev;
}

document.getElementById('tiktokForm')!.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target as HTMLFormElement;
  const fd = new FormData(form);
  try {
    const res = await api('/tiktok/connect', {
      method: 'POST',
      admin: true,
      body: JSON.stringify({ username: fd.get('username') }),
    });
    toast(res.message || 'Connected');
    await refreshTiktok();
  } catch (err: any) {
    toast(err.message, true);
  }
});

document.getElementById('tiktokDisconnect')!.addEventListener('click', async () => {
  try {
    await api('/tiktok/disconnect', { method: 'POST', admin: true });
    toast('Disconnected');
    await refreshTiktok();
  } catch (e: any) {
    toast(e.message, true);
  }
});

async function refreshTiktok() {
  const data = await api('/tiktok/status');
  document.getElementById('tiktokStatus')!.textContent = JSON.stringify(
    data,
    null,
    2,
  );
}

async function boot() {
  try {
    await refreshNations();
    await refreshUnitTypes();
    await refreshBracket();
    await refreshBattlefieldSettings();
    await refreshMatch();
    await refreshTiktok();
  } catch (e: any) {
    toast(`API unreachable: ${e.message}`, true);
  }
  setInterval(() => {
    void refreshMatch().catch(() => undefined);
    void refreshTiktok().catch(() => undefined);
    void refreshBracket().catch(() => undefined);
  }, 3000);
}

boot();
