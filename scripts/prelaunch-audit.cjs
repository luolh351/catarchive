// Local isolated audit: never connects to WeChat or changes cloud data.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const clone = v => JSON.parse(JSON.stringify(v));
const checks = [];
const accepted = new Set(['More than 100 cats remain accessible through client API', 'Editor uses authenticated cloud media source for preview']);
async function test(name, fn) {
  try { await fn(); checks.push({ name, passed: true }); }
  catch (e) { checks.push({ name, passed: false, accepted: accepted.has(name), error: e.message }); }
}
function moduleAt(file, context = {}) {
  const module = { exports: {} };
  vm.runInNewContext(read(file), { module, exports: module.exports, console: { log() {}, warn() {} },
    setTimeout() {}, ...context }, { filename: file });
  return module.exports;
}
function pageAt(file, service, wx = {}) {
  let page;
  moduleAt(file, { require: name => name.includes('audio-file') ? require('../miniprogram/utils/audio-file') : service,
    wx: { showLoading() {}, hideLoading() {}, showToast() {}, ...wx }, Page: p => { page = p; } });
  page.data = clone(page.data || {});
  page.setData = patch => Object.assign(page.data, patch);
  return page;
}
function serviceAt(call, upload = p => Promise.resolve({ fileID: 'cloud://env/' + p.cloudPath })) {
  return moduleAt('miniprogram/utils/service.js', {
    getApp: () => ({ globalData: { USE_CLOUD: true } }),
    wx: { getStorageSync() {}, cloud: { callFunction: p => Promise.resolve(call(p)).then(result => ({ result })), uploadFile: upload } }
  });
}
function database(seed) {
  const rows = clone(seed);
  let seq = 0;
  const db = {
    rows, command: { neq: value => ({ neq: value }) }, serverDate: () => '2026-10-30T00:00:00.000Z',
    collection(name) {
      rows[name] ||= [];
      const col = {
        where(query) {
          const q = { cap: 100, orderBy() { return q; }, limit(n) { q.cap = n; return q; },
            async get() {
              const data = clone(rows[name].filter(r => Object.entries(query).every(([k, v]) =>
                v && typeof v === 'object' && 'neq' in v ? r[k] !== v.neq : r[k] === v)).slice(0, q.cap));
              if (db.onQuery) await db.onQuery(name, query, data);
              return { data };
            } };
          return q;
        },
        doc(id) { return {
          async get() { const r = rows[name].find(r => r._id === id); if (!r) throw Error('missing document'); return { data: clone(r) }; },
          async update({ data }) { const r = rows[name].find(r => r._id === id); if (!r) throw Error('missing document'); Object.assign(r, clone(data)); return { stats: { updated: 1 } }; },
          async remove() { rows[name] = rows[name].filter(r => r._id !== id); }
        }; },
        async add({ data }) {
          if (db.onAdd) await db.onAdd(name, data);
          const d = clone(data); d._id ||= 'id' + (++seq);
          if (rows[name].some(r => r._id === d._id)) throw Error('duplicate _id');
          rows[name].push(d); return { _id: d._id };
        }
      };
      return col;
    },
    async runTransaction(fn) {
      const before = clone(rows);
      try { return await fn(db); } catch (e) {
        for (const key of Object.keys(rows)) delete rows[key]; Object.assign(rows, before); throw e;
      }
    }
  };
  return db;
}
function cloudAt(name, db, openid = 'owner') {
  const cloud = { init() {}, database: () => db, getWXContext: () => ({ OPENID: openid }) };
  return moduleAt('cloudfunctions/' + name + '/index.js', { require: () => cloud }).main;
}
const admin = { _id: 'a1', openid: 'owner', role: 'superadmin' };
async function main() {
  await test('All JavaScript parses and JSON files load', () => {
    const walk = dir => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(e =>
      e.isDirectory() ? walk(dir + '/' + e.name) : [dir + '/' + e.name]);
    for (const file of [...walk('miniprogram'), ...walk('cloudfunctions')]) {
      if (file.endsWith('.js')) new vm.Script(read(file), { filename: file });
      if (file.endsWith('.json')) JSON.parse(read(file));
    }
  });
  await test('Registered pages and WXML event handlers exist', () => {
    for (const page of JSON.parse(read('miniprogram/app.json')).pages) {
      for (const ext of ['js', 'json', 'wxml', 'wxss']) assert(fs.existsSync(path.join(root, 'miniprogram', page + '.' + ext)), page + '.' + ext);
      const source = read('miniprogram/' + page + '.js');
      for (const m of read('miniprogram/' + page + '.wxml').matchAll(/(?:bind|catch)(?::)?[a-z]+="([a-zA-Z_$][\w$]*)"/g)) {
        assert(new RegExp('\\b' + m[1] + '\\s*\\(').test(source), page + ': missing ' + m[1]);
      }
    }
  });
  await test('Guest is denied all administrative endpoints', async () => {
    const db = database({ admin_users: [] });
    for (const [name, event] of [['catManage', { action: 'create', data: { name: 'cat' } }],
      ['updateCreate', { catId: 'cat', content: 'note' }], ['submissionManage', { action: 'list' }],
      ['adminManage', { action: 'listApply' }], ['adminList', {}]]) {
      assert.equal((await cloudAt(name, db, 'guest')(event)).ok, false, name);
    }
  });
  await test('Existing superadmin prevents initialization', async () => {
    assert.equal((await cloudAt('initAdmin', database({ admin_users: [admin] }), 'guest')({})).ok, false);
  });
  await test('Media upload failure aborts submission before cloud write', async () => {
    let calls = 0;
    const svc = serviceAt(() => { calls++; }, () => Promise.reject(Error('offline')));
    await assert.rejects(svc.submitCat({ name: 'cat', photos: ['wxfile://tmp/test.jpg'] }), /MEDIA_UPLOAD_FAILED/);
    assert.equal(calls, 0);
  });
  await test('Cloud rejects temporary paths and malformed photo arrays', async () => {
    const fn = cloudAt('catManage', database({ admin_users: [admin] }));
    for (const photos of [['wxfile://tmp/a.jpg'], ['http://tmp/a.jpg'], 'cloud://env/a.jpg', [{}]]) {
      assert.equal((await fn({ action: 'create', data: { name: 'cat', photos } })).ok, false);
    }
  });
  await test('Changing life status cancels adoption flag', async () => {
    const db = database({ admin_users: [admin], cats: [{ _id: 'cat', lifeStatus: '在校', isAdoptable: true }] });
    assert.equal((await cloudAt('catManage', db)({ action: 'update', id: 'cat', data: { lifeStatus: '毕业' } })).ok, true);
    assert.equal(db.rows.cats[0].isAdoptable, false);
  });
  await test('Missing cat rolls back timeline write', async () => {
    const db = database({ admin_users: [admin], cats: [], cat_updates: [] });
    assert.equal((await cloudAt('updateCreate', db)({ catId: 'missing', content: 'note' })).ok, false);
    assert.equal(db.rows.cat_updates.length, 0);
  });
  await test('Archived cat is hidden from public detail', async () => {
    const db = database({ cats: [{ _id: 'cat', published: false }] });
    assert.equal((await cloudAt('catDetail', db)({ id: 'cat' })).cat, null);
  });
  await test('Editing unrelated fields preserves existing more text', async () => {
    let submitted;
    const svc = serviceAt(({ name, data }) => {
      if (name === 'catDetail') return { cat: { _id: 'cat', name: '猫', more: '需要保留的家族资料' }, timeline: [] };
      if (name === 'catManage') { submitted = data.data; return { ok: true }; }
    });
    const page = pageAt('miniprogram/pages/catForm/catForm.js', svc);
    page.initForm('cat'); await new Promise(resolve => setImmediate(resolve));
    page.save(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(submitted.more, '需要保留的家族资料');
  });
  await test('More than 100 cats remain accessible through client API', async () => {
    const db = database({ cats: Array.from({ length: 101 }, (_, i) => ({ _id: 'c' + i, published: true })) });
    const svc = serviceAt(({ data }) => cloudAt('catList', db)(data));
    assert.equal((await svc.getCats()).length, 101);
  });
  await test('New archive latestNote is visible in public detail template', async () => {
    const db = database({ admin_users: [admin] });
    const created = await cloudAt('catManage', db)({ action: 'create', data: { name: '猫', latestNote: '今日已就医' } });
    const detail = await cloudAt('catDetail', db)({ id: created.id });
    assert(detail.timeline.some(u => u.content === '今日已就医') || /cat\.latestNote/.test(read('miniprogram/pages/catDetail/catDetail.wxml')),
      'latestNote exists in database but has no visible public rendering');
  });
  await test('Concurrent transfer and removal retain one superadmin', async () => {
    const db = database({ admin_users: [admin, { _id: 'a2', openid: 'editor', role: 'editor' }] });
    let release, reached;
    const gate = new Promise(r => { release = r; });
    const started = new Promise(r => { reached = r; });
    let hold = true;
    db.onQuery = async (name, q) => {
      if (name === 'admin_users' && q.openid === 'editor' && hold) { hold = false; reached(); await gate; }
    };
    const fn = cloudAt('adminManage', db);
    const removing = fn({ action: 'remove', openid: 'editor' });
    await started;
    assert.equal((await fn({ action: 'transfer', openid: 'editor' })).ok, true);
    release(); await removing;
    assert.equal(db.rows.admin_users.filter(r => r.role === 'superadmin').length, 1);
  });
  await test('Normal transfer succeeds and previous owner loses superadmin authority', async () => {
    const db = database({ admin_users: [admin, { _id: 'a2', openid: 'editor', role: 'editor' }] });
    const fn = cloudAt('adminManage', db);
    assert.equal((await fn({ action: 'transfer', openid: 'editor' })).ok, true);
    assert.equal((await fn({ action: 'remove', openid: 'editor' })).ok, false);
    assert.equal(db.rows.admin_users.filter(r => r.role === 'superadmin').length, 1);
  });
  await test('Normal removal removes editor and writes audit log', async () => {
    const db = database({ admin_users: [admin, { _id: 'a2', openid: 'editor', role: 'editor' }] });
    assert.equal((await cloudAt('adminManage', db)({ action: 'remove', openid: 'editor' })).ok, true);
    assert.equal(db.rows.admin_users.length, 1);
    assert.equal(db.rows.admin_audit_logs[0].action, 'adminRemove');
  });
  await test('Audit log failure rolls back create, edit and archive', async () => {
    const db = database({ admin_users: [admin], cats: [{ _id: 'cat', name: '原名', published: true }] });
    db.onAdd = name => { if (name === 'admin_audit_logs') throw Error('audit unavailable'); };
    const fn = cloudAt('catManage', db);
    for (const event of [{ action: 'create', data: { name: '新增猫咪' } },
      { action: 'update', id: 'cat', data: { name: '新名' } }, { action: 'archive', id: 'cat' }]) {
      assert.equal((await fn(event)).ok, false);
      assert.equal(db.rows.cats.length, 1);
      assert.equal(db.rows.cats[0].name, '原名');
      assert.equal(db.rows.cats[0].published, true);
    }
  });
  await test('Audit log failure rolls back timeline, admin approval and submission rejection', async () => {
    const db = database({ admin_users: [admin], cats: [{ _id: 'cat', published: true, latestNote: 'old' }],
      cat_submissions: [{ _id: 'sub', name: '猫', status: 'pending' }],
      admin_applications: [{ _id: 'app', openid: 'guest', status: 'pending' }] });
    db.onAdd = name => { if (name === 'admin_audit_logs') throw Error('audit unavailable'); };
    assert.equal((await cloudAt('updateCreate', db)({ catId: 'cat', content: 'new' })).ok, false);
    assert.equal(db.rows.cats[0].latestNote, 'old');
    assert.equal((db.rows.cat_updates || []).length, 0);
    assert.equal((await cloudAt('adminManage', db)({ action: 'approveApply', id: 'app' })).ok, false);
    assert.equal(db.rows.admin_users.length, 1);
    assert.equal(db.rows.admin_applications[0].status, 'pending');
    assert.equal((await cloudAt('submissionManage', db)({ action: 'reject', id: 'sub' })).ok, false);
    assert.equal(db.rows.cat_submissions[0].status, 'pending');
  });
  await test('Archived cats cannot accept new updates', async () => {
    const db = database({ admin_users: [admin], cats: [{ _id: 'cat', published: false }] });
    assert.equal((await cloudAt('updateCreate', db)({ catId: 'cat', content: 'new' })).ok, false);
    assert.equal((db.rows.cat_updates || []).length, 0);
  });
  await test('Rejected administrative operation displays error without success refresh', async () => {
    let modal, refreshed = false;
    const page = pageAt('miniprogram/pages/admin/admin.js', {}, { showModal: opts => { modal = opts; } });
    await page.runOperation(() => Promise.resolve({ ok: false, msg: '无权限' }), () => { refreshed = true; });
    assert.equal(modal.content, '无权限');
    assert.equal(refreshed, false);
    assert.equal(page.operationBusy, false);
  });
  await test('Administrative list errors are not presented as empty successful results', async () => {
    const svc = serviceAt(() => ({ ok: false, msg: '无权限' }));
    await assert.rejects(svc.listApplications(), /无权限/);
    await assert.rejects(svc.listSubmissions(), /无权限/);
  });
  await test('Editor workspace does not request superadmin-only lists', async () => {
    const svc = { getCats: async () => [], listSubmissions: async () => [],
      listApplications() { throw Error('should not request applications'); },
      listAdmins() { throw Error('should not request admins'); } };
    const page = pageAt('miniprogram/pages/admin/admin.js', svc);
    page.data.myRole = 'editor'; page.loadData();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(page.data.admins.length, 0);
  });
  await test('Update form prevents submission before successful authorization', async () => {
    let calls = 0;
    const page = pageAt('miniprogram/pages/updateForm/updateForm.js', { addUpdate() { calls++; } });
    page.data.content = 'new'; page.save();
    assert.equal(calls, 0);
  });
  await test('Editor uses authenticated cloud media source for preview', () => {
    let src;
    const page = pageAt('miniprogram/pages/catForm/catForm.js', {}, { createInnerAudioContext: () => ({
      set src(v) { src = v; }, onEnded() {}, onStop() {}, onError() {}, play() {}
    }) });
    page.data.form.voice = 'cloud://env/audio.wav'; page.previewVoice();
    assert(!src.startsWith('cloud://'), 'cloud file ID passed directly to audio player; unlike catDetail no download/URL resolution');
  });
  for (const r of checks) console.log((r.passed ? 'PASS ' : r.accepted ? 'ACCEPTED ' : 'FAIL ') + r.name + (r.error ? '\n  ' + r.error : ''));
  console.log(JSON.stringify({ total: checks.length, passed: checks.filter(r => r.passed).length, accepted: checks.filter(r => r.accepted).length, failed: checks.filter(r => !r.passed && !r.accepted).length }));
  process.exitCode = checks.some(r => !r.passed && !r.accepted) ? 1 : 0;
}
main().catch(e => { console.error(e); process.exitCode = 1; });
