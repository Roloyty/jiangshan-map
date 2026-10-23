/**
 * 谓无名扩展逻辑：在 app.js 之后、页面 DOMContentLoaded 之前加载，给 HistoricalAtlasController
 * 原型挂钩，不改上游文件。数据来自各 wwm_*.js 追加到 window.WWM_EXT 的内容：
 * - layers：按年份范围把区划追加进相应时期快照的「州府」层（悬停、搜索、点地溯源随之可用），
 *   并画区划间的分界与区划名；层上有 ownerZh / ownerEn 时，悬停提示的「属 某政权」改用它
 * - coevalEras：时间栏气泡追加同期纪年，如「公元 1873 年 · 清同治十二年 · 朝鲜高宗十年」
 * - realms：日本、朝鲜半岛诸政权的地图底色与图例
 * - periodBars：时间轴下方的日本、朝鲜半岛年代条
 * - enDict：英文界面里这些名称的译名
 */
(function () {
  'use strict';
  const ext = window.WWM_EXT || { layers: [], coevalEras: [], enDict: {} };
  ext.realms = ext.realms || [];
  ext.periodBars = ext.periodBars || [];
  const ZH_DIGITS = '〇一二三四五六七八九';

  /** 在位年数转中文纪年数字：1→元，10→十，25→二十五（够用到 99） */
  function zhRegnalNumber(n) {
    if (n === 1) return '元';
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    return (tens > 1 ? ZH_DIGITS[tens] : '') + (tens ? '十' : '') + (ones ? ZH_DIGITS[ones] : '');
  }

  /** 某年的同期纪年，没有则返回空串。spans 按起始年升序，取起始年不晚于该年的最后一段。 */
  function coevalEraLabel(year, locale) {
    const y = Math.round(year);
    const parts = [];
    for (const era of ext.coevalEras) {
      if (y < era.from || y > era.to) continue;
      let span = null;
      for (const s of era.spans) if (s[0] <= y) span = s;
      if (!span) continue;
      const n = y - span[0] + 1;
      parts.push(locale === 'en' ? `${span[2]}: ${span[4]} ${n}` : `${span[1]}${span[3]}${zhRegnalNumber(n)}年`);
    }
    return parts.join(' · ');
  }

  /**
   * 把区划挂到存续期覆盖其一半以上的时期快照上（快照按上游的朝代分期切换，不按单年）。
   * 上游快照之间可能共用同一个州府数组（prefRef），所以追加时换成新数组。
   */
  function attachLayers(ctrl) {
    if (!ctrl.snapshots || !ext.layers.length) return;
    for (const d of ctrl.dynasties || []) {
      const phases = d.phases && d.phases.length ? d.phases : [{ until: d.toYear, snap: `s_${d.key}` }];
      phases.forEach((ph, i) => {
        const from = i === 0 ? d.fromYear : phases[i - 1].until;
        const to = ph.until;
        const snap = ctrl.snapshots[ph.snap];
        if (!snap) return;
        for (const layer of ext.layers) {
          const overlap = Math.min(to, layer.to) - Math.max(from, layer.from);
          if (overlap * 2 < to - from) continue;
          snap._wwmLayers = snap._wwmLayers || [];
          if (snap._wwmLayers.includes(layer)) continue;
          snap._wwmLayers.push(layer);
          snap.prefectures = [
            ...(snap.prefectures || []),
            ...layer.features.map((f) => ({
              title: f.title,
              category: f.category || layer.category,
              anchor: f.anchor,
              shape: f.shape,
            })),
          ];
        }
      });
    }
  }

  /**
   * 区划之间的内部分界（两个区划共用的边），按原顺序连成折线；海岸线不画，与上游一级政区的画法一致。
   * 依赖相邻区划在共用边上的顶点完全相同（生成数据时保留拓扑）。
   */
  function internalBorders(layer) {
    if (layer._borders) return layer._borders;
    const key = (a, b) => (a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]) ? `${a}|${b}` : `${b}|${a}`);
    const counts = new Map();
    const segments = [];
    for (const f of layer.features) {
      const polys = f.shape.type === 'Polygon' ? [f.shape.coordinates] : f.shape.coordinates;
      for (const poly of polys) {
        for (const ring of poly) {
          for (let i = 0; i < ring.length - 1; i++) {
            const k = key(ring[i], ring[i + 1]);
            if (!counts.has(k)) segments.push([ring[i], ring[i + 1], k]);
            counts.set(k, (counts.get(k) || 0) + 1);
          }
        }
      }
    }
    const lines = [];
    let line = null;
    for (const [a, b, k] of segments) {
      if (counts.get(k) < 2) {
        line = null;
      } else if (line && line[line.length - 1] === a) {
        line.push(b);
      } else {
        line = [a, b];
        lines.push(line);
      }
    }
    return (layer._borders = lines);
  }

  /** 政权名 → 所属地域（日本 / 朝鲜半岛），只认 realms 里列出的政权 */
  function realmOfPolity(title) {
    return ext.realms.find((r) => r.polities.includes(title)) || null;
  }

  /** 某年所在的年代条分段 */
  function periodAt(bar, year) {
    return bar.periods.find((p, i) => year >= p[0] && (year < p[1] || i === bar.periods.length - 1)) || null;
  }

  /**
   * 悬停提示里区划的「属 某政权」改写为层上的 ownerZh / ownerEn（如日据时期台湾的州厅不写「属 日本帝国」）。
   * 提示的第一个 <b> 是区划名（中文界面可能带「（州）」之类后缀）；tr 是界面的译名函数，belongsTo 是「属 」的界面文字。
   */
  function rewriteOwner(html, layers, { locale, tr, belongsTo }) {
    for (const layer of layers || []) {
      const note = locale === 'en' ? layer.ownerEn : layer.ownerZh;
      if (!note || !layer.features.some((f) => html.startsWith(`<b>${tr(f.title)}`))) continue;
      const esc = belongsTo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return html.replace(new RegExp(`${esc}[^<]*?(?= · |</div>)`), note);
    }
    return html;
  }

  window.WWM = { zhRegnalNumber, coevalEraLabel, attachLayers, internalBorders, realmOfPolity, periodAt, rewriteOwner };

  const rgba = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  };

  // 周边政权的一级区划沿用上游的分界线样式，略淡一些，免得被误读为中原王朝疆界；
  // 日本、朝鲜半岛政权的底色与上游周边政权同样淡，只换色相；年代条贴在朝代条下方
  if (typeof document !== 'undefined') {
    const css = [
      '.region-shape.wwm-neighbor-region { stroke: rgba(104, 28, 12, 0.5); stroke-width: 1.1; }',
      '#scrubber-track { height: auto; }',
      '#dynasty-bands { height: 34px; }',
      '@media (max-width: 900px) { #dynasty-bands { height: 30px; } }',
      '.wwm-coeval-row { position: relative; height: 13px; margin-top: 2px; border-radius: 4px; overflow: hidden; }',
      '.wwm-coeval-seg { position: absolute; top: 0; bottom: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; white-space: nowrap; font-family: var(--serif-stack); font-size: 9.5px; letter-spacing: 0.04em; color: #fffaf0; text-shadow: 0 1px 1px rgba(0, 0, 0, 0.3); border-right: 1px solid rgba(255, 255, 255, 0.35); opacity: 0.6; transition: opacity 0.2s; }',
      '.wwm-coeval-seg.is-active { opacity: 1; }',
      '.wwm-coeval-seg.is-narrow > span { visibility: hidden; }',
      '.wwm-coeval-tag { position: absolute; left: 2px; top: 1px; bottom: 1px; z-index: 1; padding: 0 4px; border-radius: 3px; background: rgba(243, 238, 228, 0.92); color: #4a4038; font-family: var(--sans-stack); font-size: 8.5px; font-weight: 600; line-height: 11px; pointer-events: none; }',
      ...ext.realms.flatMap((r) => [
        `.polity-shape.neighbor.wwm-realm-${r.key} { fill: ${rgba(r.color, 0.18)}; stroke: ${r.color}; }`,
        `#atlas-svg.terrain-active .polity-shape.neighbor.wwm-realm-${r.key} { fill: ${rgba(r.color, 0.15)}; }`,
        `.polity-shape.neighbor.wwm-realm-${r.key}:hover, #atlas-svg.terrain-active .polity-shape.neighbor.wwm-realm-${r.key}:hover { fill: ${rgba(r.color, 0.3)}; }`,
      ]),
    ];
    const style = document.createElement('style');
    style.textContent = css.join('\n');
    document.head.appendChild(style);
  }

  const C = window.HistoricalAtlasController;
  if (!C) return;
  const P = C.prototype;

  const hydrate = P._hydrateSnapshots;
  P._hydrateSnapshots = function () {
    hydrate.apply(this, arguments);
    attachLayers(this);
  };

  // 区划名与上游的一级政区名同款（region-caption），由 _rescaleSvgTypography 统一避让、缩放、随州府层显隐
  const render = P._renderPolitiesAndPrefectures;
  P._renderPolitiesAndPrefectures = function (dynasty, snap) {
    const out = render.apply(this, arguments);
    this.grpPolities.querySelectorAll('.polity-shape.neighbor').forEach((path) => {
      const realm = realmOfPolity(path.dataset.polityTitle);
      if (realm) path.classList.add(`wwm-realm-${realm.key}`);
    });
    if (snap && snap._wwmLayers && snap._wwmLayers.length) {
      const group = this._svgNode('g', { class: 'fade-enter' }, this.grpPrefectures);
      for (const layer of snap._wwmLayers) {
        const d = internalBorders(layer)
          .map((line) =>
            line
              .map(([lng, lat], i) => {
                const [x, y] = this.projector.toScreen(lng, lat);
                return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
              })
              .join('')
          )
          .join('');
        this._svgNode('path', { d, class: 'region-shape-casing' }, group);
        this._svgNode('path', { d, class: 'region-shape wwm-neighbor-region' }, group);
        for (const f of layer.features) {
          const [x, y] = this.projector.toScreen(f.anchor[0], f.anchor[1]);
          const label = this._svgNode(
            'text',
            {
              class: 'region-caption',
              'data-x': x.toFixed(1),
              'data-y': y.toFixed(1),
              'data-base-x': x.toFixed(1),
              'data-base-y': y.toFixed(1),
            },
            group
          );
          label._regShape = f.shape;
          label.textContent = this.locale === 'en' ? f.titleEn : f.label || f.title;
        }
      }
      this._rescaleSvgTypography();
    }
    return out;
  };

  // 图例：在「同期周边政权」前为画面里出现的日本、朝鲜半岛政权各加一条，色块与地图底色一致
  const renderLegend = P._renderLegendBox;
  P._renderLegendBox = function (snap) {
    const out = renderLegend.apply(this, arguments);
    const neighborEntry = this.mapKey && this.mapKey.querySelector('.key-neighbor-entry');
    if (!neighborEntry || !snap) return out;
    for (const realm of ext.realms) {
      const titles = (snap.polities || []).filter((p) => p.role === 'neighbor' && realm.polities.includes(p.title)).map((p) => p.title);
      if (!titles.length) continue;
      const entry = document.createElement('span');
      entry.className = 'key-entry is-interactive key-neighbor-entry';
      entry.title = this.locale === 'en' ? 'Hover to highlight · Click to zoom' : '悬停高亮疆域 · 点击聚焦版图';
      const sw = document.createElement('i');
      sw.className = 'swatch';
      sw.style.color = realm.color;
      sw.style.borderStyle = 'dashed';
      sw.style.background = rgba(realm.color, 0.3);
      entry.appendChild(sw);
      entry.appendChild(document.createTextNode(titles.map((t) => this.trTerm(t)).join(this.locale === 'en' ? ', ' : '、')));
      entry.addEventListener('pointerenter', (e) => {
        if (e.pointerType !== 'touch') this._setPolityFocus(titles[0]);
      });
      entry.addEventListener('pointerleave', (e) => {
        if (e.pointerType !== 'touch') this._setPolityFocus(null);
      });
      entry.addEventListener('click', () => this._zoomToPolity(titles[0]));
      neighborEntry.parentNode.insertBefore(entry, neighborEntry);
    }
    return out;
  };

  // 年代条：放在 #scrubber-track 里、朝代条下方，点按与拖动沿用时间轴本身的处理；
  // 分段位置一律经上游的 _yearToProgress 换算，与朝代条（各朝按权重不等宽）逐年对齐
  const buildBands = P._buildScrubberBands;
  P._buildScrubberBands = function () {
    const out = buildBands.apply(this, arguments);
    const track = this._id('scrubber-track');
    const handle = this._id('scrubber-handle');
    if (!track || !ext.periodBars.length) return out;
    track.querySelectorAll('.wwm-coeval-row').forEach((row) => row.remove());
    const pct = (y) => (y >= this.maxYear ? 1 : this._yearToProgress(Math.max(this.minYear, y))) * 100;
    this._wwmSegments = [];
    this._wwmTags = [];
    for (const bar of ext.periodBars) {
      const realm = ext.realms.find((r) => r.key === bar.realm);
      const row = document.createElement('div');
      row.className = 'wwm-coeval-row';
      const tag = document.createElement('span');
      tag.className = 'wwm-coeval-tag';
      row.appendChild(tag);
      this._wwmTags.push({ tag, realm });
      bar.periods.forEach((period, i) => {
        const seg = document.createElement('div');
        seg.className = 'wwm-coeval-seg';
        const left = pct(period[0]);
        seg.style.left = `${left.toFixed(3)}%`;
        seg.style.width = `${(pct(period[1]) - left).toFixed(3)}%`;
        seg.style.background = i % 2 ? realm.color : rgba(realm.color, 0.82);
        seg.appendChild(document.createElement('span'));
        row.appendChild(seg);
        this._wwmSegments.push({ seg, bar, realm, period });
      });
      track.insertBefore(row, handle);
    }
    this._wwmLabelSegments();
    return out;
  };

  /** 年代条文字随界面语言切换（上游切换语言时调用 _refreshBandLabels） */
  P._wwmLabelSegments = function () {
    const en = this.locale === 'en';
    const yearText = (y) => (y < 0 ? (en ? `${-y} BCE` : `前${-y}`) : String(y));
    for (const { tag, realm } of this._wwmTags || []) tag.textContent = en ? realm.en : realm.zh;
    for (const { seg, realm, period } of this._wwmSegments || []) {
      const [from, to, zh, enName] = period;
      const end = to >= 2026 ? (en ? 'present' : '今') : yearText(to);
      seg.title = `${en ? realm.en : realm.zh} · ${en ? enName : zh}（${yearText(from)}—${end}）`;
      seg.firstChild.textContent = en ? enName : zh;
    }
    this._wwmFitSegments();
  };

  const refreshBandLabels = P._refreshBandLabels;
  P._refreshBandLabels = function () {
    const out = refreshBandLabels.apply(this, arguments);
    this._wwmLabelSegments();
    return out;
  };

  P._wwmFitSegments = function () {
    for (const { seg } of this._wwmSegments || []) {
      const text = seg.firstChild;
      seg.classList.toggle('is-narrow', !!text && text.scrollWidth > seg.clientWidth - 2);
    }
  };

  const fitBandLabels = P._fitBandLabels;
  P._fitBandLabels = function () {
    const out = fitBandLabels.apply(this, arguments);
    this._wwmFitSegments();
    return out;
  };

  // 同期纪年只加在时间栏气泡里（搜索结果、事件卡等处的纪年保持原样）；
  // 在 _syncScrubberUi 内部替换文字，气泡宽度与箭头位置按最终文字计算；顺带点亮年代条的当前分段
  const syncScrubber = P._syncScrubberUi;
  P._syncScrubberUi = function () {
    this._wwmInScrubber = true;
    try {
      return syncScrubber.apply(this, arguments);
    } finally {
      this._wwmInScrubber = false;
      for (const { seg, bar, period } of this._wwmSegments || []) {
        seg.classList.toggle('is-active', periodAt(bar, this.year) === period);
      }
    }
  };
  const formatEra = P.formatEraLabel;
  P.formatEraLabel = function (y) {
    const label = formatEra.apply(this, arguments);
    if (!this._wwmInScrubber) return label;
    const coeval = coevalEraLabel(y, this.locale);
    return coeval ? `${label} · ${coeval}` : label;
  };

  const showHoverTip = P._showHoverTip;
  P._showHoverTip = function (e, html) {
    const snap = this.lastRenderedSnap;
    if (typeof html === 'string' && snap && snap._wwmLayers) {
      html = rewriteOwner(html, snap._wwmLayers, {
        locale: this.locale,
        tr: (t) => this.trTerm(t),
        belongsTo: this.uiStr('belongs_to', '属 '),
      });
    }
    return showHoverTip.call(this, e, html);
  };

  const enDict = P._enDict;
  P._enDict = function (text) {
    return (text && ext.enDict[text]) || enDict.apply(this, arguments);
  };
})();
