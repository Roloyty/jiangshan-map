#!/usr/bin/env node
/**
 * 谓无名扩展（js/wwm_*.js）的校验：同期纪年对得上公认年份、八道区划几何合法、
 * 区划只挂到存续期内的时期快照且不改动上游共用的州府数组。
 * 运行：node --test scripts/validate_wwm.js
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const JS_DIR = path.join(__dirname, '..', 'js');

function load(files) {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(JS_DIR, f), 'utf8'), sandbox, { filename: f });
  return sandbox.window;
}

const win = load([
  'map_data.js',
  'lore_data.js',
  'wwm_data.js',
  'wwm_people.js',
  'wwm_korea.js',
  'wwm_japan.js',
  'wwm_taiwan.js',
  'wwm_eastasia.js',
  'wwm_ext.js',
]);
const { WWM, WWM_EXT, DYNASTY_DATA, ATLAS_LORE_DATA: LORE } = win;

function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function pointInShape(x, y, shape) {
  const polys = shape.type === 'Polygon' ? [shape.coordinates] : shape.coordinates;
  return polys.some((poly) => pointInRing(x, y, poly[0]) && !poly.slice(1).some((hole) => pointInRing(x, y, hole)));
}

test('regnal numbers', () => {
  const cases = { 1: '元', 2: '二', 10: '十', 12: '十二', 20: '二十', 25: '二十五', 52: '五十二' };
  for (const [n, zh] of Object.entries(cases)) assert.equal(WWM.zhRegnalNumber(Number(n)), zh);
});

test('Joseon coeval era labels match well-known dates', () => {
  const cases = {
    1392: '朝鲜太祖元年', // 开国
    1400: '朝鲜定宗二年', // 第二次王子之乱
    1418: '朝鲜太宗十八年', // 世宗即位当年仍计太宗年
    1446: '朝鲜世宗二十八年', // 颁布训民正音
    1453: '朝鲜端宗元年', // 癸酉靖难
    1455: '朝鲜世祖元年', // 世祖即位当年称元
    1485: '朝鲜成宗十六年', // 《经国大典》颁行
    1506: '朝鲜中宗元年', // 中宗反正
    1592: '朝鲜宣祖二十五年', // 壬辰倭乱
    1623: '朝鲜仁祖元年', // 仁祖反正
    1636: '朝鲜仁祖十四年', // 丙子胡乱
    1720: '朝鲜肃宗四十六年',
    1762: '朝鲜英祖三十八年', // 壬午祸变
    1780: '朝鲜正祖四年', // 朴趾源燕行
    1873: '朝鲜高宗十年',
    1884: '朝鲜高宗二十一年', // 甲申政变
    1896: '朝鲜建阳元年',
    1900: '大韩帝国光武四年',
    1910: '大韩帝国隆熙四年',
  };
  for (const [y, zh] of Object.entries(cases)) assert.equal(WWM.coevalEraLabel(Number(y), 'zh'), zh, `year ${y}`);
  assert.equal(WWM.coevalEraLabel(1391, 'zh'), '');
  assert.equal(WWM.coevalEraLabel(1911, 'zh'), '');
  assert.equal(WWM.coevalEraLabel(1780, 'en'), 'Joseon: Jeongjo 4');
});

test('era spans are strictly increasing', () => {
  for (const era of WWM_EXT.coevalEras) {
    for (let i = 1; i < era.spans.length; i++) assert.ok(era.spans[i][0] > era.spans[i - 1][0], `${era.key} span ${i}`);
    assert.equal(era.spans[0][0], era.from);
  }
});

const polysOf = (shape) => (shape.type === 'Polygon' ? [shape.coordinates] : shape.coordinates);
const layerByKey = (key) => WWM_EXT.layers.find((l) => l.key === key);

test('layer titles', () => {
  // 拷成本 realm 的数组，vm 沙箱里的数组原型不同
  const titles = (key) => Array.from(layerByKey(key).features, (f) => f.title);
  assert.deepEqual(titles('joseon-paldo'), ['京畿道', '忠清道', '全罗道', '庆尚道', '江原道', '黄海道', '平安道', '咸镜道']);
  assert.deepEqual(titles('taiwan-1887'), ['台北府', '台湾府', '台南府', '台东直隶州']);
  assert.deepEqual(titles('taiwan-1926'), ['台北州', '新竹州', '台中州', '台南州', '高雄州', '花莲港厅', '台东厅', '澎湖厅']);
  const japan = titles('japan-fuken');
  assert.equal(japan.length, 47);
  for (const t of ['北海道', '东京府', '京都府', '大阪府', '冲绳县']) assert.ok(japan.includes(t), t);
  assert.equal(new Set(japan).size, 47);
});

test('every layer is valid, inside the map and labelled inside each division', () => {
  for (const layer of WWM_EXT.layers) {
    assert.ok(layer.from < layer.to, `${layer.key} years`);
    for (const f of layer.features) {
      assert.ok(WWM_EXT.enDict[f.title], `${f.title} English name`);
      assert.equal(WWM_EXT.enDict[f.title], f.titleEn, `${f.title} English name matches`);
      assert.ok(pointInShape(f.anchor[0], f.anchor[1], f.shape), `${f.title} anchor inside shape`);
      for (const poly of polysOf(f.shape)) {
        for (const ring of poly) {
          assert.ok(ring.length >= 4, `${f.title} ring length`);
          for (const [x, y] of ring) assert.ok(x >= 66 && x <= 142 && y >= 14 && y <= 55, `${f.title} ${x},${y}`);
        }
      }
    }
  }
});

test('no layer draws the Diaoyu Islands or Dokdo into a Japanese division', () => {
  const boxes = [
    ['钓鱼岛及其附属岛屿', 123.3, 124.8, 25.4, 26.1],
    ['独岛', 131.7, 132.0, 37.1, 37.4],
  ];
  for (const layer of WWM_EXT.layers) {
    for (const f of layer.features) {
      for (const poly of polysOf(f.shape)) {
        for (const ring of poly) {
          for (const [x, y] of ring) {
            for (const [name, x0, x1, y0, y1] of boxes) {
              assert.ok(!(x >= x0 && x <= x1 && y >= y0 && y <= y1), `${f.title} has a vertex at ${name} (${x},${y})`);
            }
          }
        }
      }
    }
  }
});

test('occupied-era Taiwan divisions say 日据 instead of 属 日本帝国 in hover tips', () => {
  const layers = [layerByKey('taiwan-1926'), layerByKey('japan-fuken')];
  const zh = { locale: 'zh', tr: (t) => t, belongsTo: '属 ' };
  assert.equal(
    WWM.rewriteOwner('<b>新竹州</b><div class="tt-sub">属 日本帝国 · 台湾（道/省）</div>', layers, zh),
    '<b>新竹州</b><div class="tt-sub">日据时期 · 台湾总督府辖 · 台湾（道/省）</div>'
  );
  assert.equal(
    WWM.rewriteOwner('<b>花莲港厅</b><div class="tt-sub">属 日本帝国</div><div class="tt-sub">今：台湾省</div>', layers, zh),
    '<b>花莲港厅</b><div class="tt-sub">日据时期 · 台湾总督府辖</div><div class="tt-sub">今：台湾省</div>'
  );
  const en = { locale: 'en', tr: (t) => WWM_EXT.enDict[t] || t, belongsTo: 'Realm: ' };
  assert.equal(
    WWM.rewriteOwner('<b>Taichu Prefecture</b><div class="tt-sub">Realm: Empire of Japan</div>', layers, en),
    '<b>Taichu Prefecture</b><div class="tt-sub">Under Japanese occupation (Government-General of Taiwan)</div>'
  );
  // 日本本土府县与其他提示原样不动
  const tokyo = '<b>东京府</b><div class="tt-sub">属 日本帝国</div>';
  assert.equal(WWM.rewriteOwner(tokyo, layers, zh), tokyo);
});

test('internal borders contain only edges shared by two divisions (no coastline)', () => {
  for (const [key, minLines] of [['joseon-paldo', 7], ['japan-fuken', 40], ['taiwan-1887', 3], ['taiwan-1926', 6]]) {
    const layer = layerByKey(key);
    const lines = WWM.internalBorders(layer);
    assert.ok(lines.length >= minLines, `${key} border lines: ${lines.length}`);
    const owners = (pt) =>
      layer.features.filter((f) =>
        polysOf(f.shape).some((poly) => poly.some((ring) => ring.some(([x, y]) => x === pt[0] && y === pt[1])))
      ).length;
    for (const line of lines) for (const pt of line) assert.ok(owners(pt) >= 2, `${key} border point ${pt} shared`);
  }
});

test('layers attach only to phases mostly inside their years, without mutating shared arrays', () => {
  const shared = [{ title: '顺天府' }];
  const snapshots = {};
  for (const d of DYNASTY_DATA) for (const ph of d.phases || []) snapshots[ph.snap] = { prefectures: shared };
  const ctrl = { dynasties: DYNASTY_DATA, snapshots };
  WWM.attachLayers(ctrl);
  WWM.attachLayers(ctrl); // 全量快照加载后会再次 hydrate，不能重复追加
  const count = (k, titles) => (snapshots[k] ? snapshots[k].prefectures.filter((p) => titles.includes(p.title)).length : 0);
  const expect = (titles, n, yes, no) => {
    for (const k of yes) assert.equal(count(k, titles), n, `${titles[0]} in ${k}`);
    for (const k of no) assert.equal(count(k, titles), 0, `${titles[0]} not in ${k}`);
  };
  const paldo = Array.from(layerByKey('joseon-paldo').features, (f) => f.title);
  expect(paldo, 8, ['s_ming_a', 's_ming_b', 's_qing_a0', 's_qing_d', 's_qing_f'], ['s_ming_a0', 's_qing_g0', 's_qing_g', 's_yuan']);
  expect(['台北府', '台湾府', '台南府', '台东直隶州'], 4, ['s_qing_f'], ['s_qing_f0', 's_qing_g0', 's_qing_e4']);
  expect(['台北州', '澎湖厅'], 2, ['s_roc_w4', 's_roc_a', 's_roc'], ['s_roc_w2', 's_roc_w3', 's_roc_c', 's_qing_g']);
  expect(['东京府', '冲绳县'], 2, ['s_qing_f', 's_qing_g', 's_roc_a0', 's_roc'], ['s_qing_f0', 's_roc_c', 's_roc_d']);
  assert.equal(shared.length, 1);
});

const PEOPLE_KEYS = [
  'luxun',
  'sunzhongshan',
  'zhouenlai',
  'takeuchiyoshimi',
  'uchiyamakanzo',
  'kimgu',
  'anjunggeun',
  'lianyheng',
];

test('wwm people journeys are complete, ascending and in bounds', () => {
  assert.ok(LORE, 'ATLAS_LORE_DATA loaded');
  const wwm = LORE.HISTORICAL_JOURNEYS.filter((j) => j.source === 'wwm');
  assert.deepEqual(
    Array.from(wwm, (j) => j.key),
    ['liangqichao', 'bakjiwon', 'jianzhen', ...PEOPLE_KEYS]
  );
  for (const key of PEOPLE_KEYS) {
    const j = wwm.find((x) => x.key === key);
    assert.ok(j.dynastyKey === 'qing' || j.dynastyKey === 'roc', `${key} dynastyKey`);
    assert.ok(j.stops.length >= 8, `${key} stops >= 8`);
    let last = -Infinity;
    for (const st of j.stops) {
      assert.ok(
        typeof st.year === 'number' && st.year >= -403 && st.year <= 2026 && st.year !== 0,
        `${key} stop year ${st.year}`
      );
      assert.ok(st.year >= last, `${key} stops must not go back in time`);
      last = st.year;
      assert.ok(
        st.coord[0] >= 60 && st.coord[0] <= 142 && st.coord[1] >= 15 && st.coord[1] <= 55,
        `${key} ${st.ancientZh} coord ${st.coord}`
      );
      for (const v of st.via || []) {
        assert.ok(v[0] >= 60 && v[0] <= 142 && v[1] >= 15 && v[1] <= 55, `${key} via ${v}`);
      }
      for (const f of ['eraZh', 'ancientZh', 'modernZh', 'ancientEn', 'modernEn', 'titleZh', 'titleEn', 'descZh', 'descEn']) {
        assert.ok(typeof st[f] === 'string' && st[f].trim().length > 0, `${key} ${st.ancientZh || st.year} field ${f}`);
      }
    }
  }
});

test('every wwm person profile resolves to its journey and covers its span', () => {
  for (const key of PEOPLE_KEYS) {
    const p = LORE.PERSON_PROFILES.find((x) => x.key === key);
    assert.ok(p, `profile ${key}`);
    const j = LORE.HISTORICAL_JOURNEYS.find((x) => x.key === p.journeyKey);
    assert.ok(j, `${key} journeyKey resolves`);
    assert.ok(p.span[0] <= j.stops[0].year, `${key} span starts before first stop`);
    assert.ok(p.span[1] >= j.stops[j.stops.length - 1].year, `${key} span ends after last stop`);
    assert.ok(p.aliases.length >= 2 && p.tokens.length >= 1, `${key} search aliases`);
  }
});
