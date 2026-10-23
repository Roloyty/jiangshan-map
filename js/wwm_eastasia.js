/**
 * 谓无名扩展数据：东亚对照（由 wwm_ext.js 使用）。
 * - realms：日本、朝鲜半岛诸政权在地图上的底色，以及图例里的说明。
 *   只给史学界归属无争议的政权上色；高句丽、渤海、卫氏朝鲜保持上游的灰色。
 * - periodBars：时间轴下方的日本、朝鲜半岛年代条，与中国朝代条按同一年份对齐。
 */
(function () {
  const ext = (window.WWM_EXT = window.WWM_EXT || { layers: [], coevalEras: [], enDict: {} });

  ext.realms = [
    {
      key: 'japan',
      zh: '日本',
      en: 'Japan',
      color: '#56609c',
      polities: ['倭（弥生）', '大和（日本）', '日本', '日本（平安）', '日本（镰仓幕府）', '日本（战国）', '日本（江户幕府）', '日本帝国'],
    },
    {
      key: 'korea',
      zh: '朝鲜半岛',
      en: 'Korean Peninsula',
      color: '#3f7f6e',
      polities: ['三韩（辰国）', '辰国（三韩）', '百济', '新罗', '高丽', '朝鲜', '大韩帝国'],
    },
  ];

  // 每段 [起, 止, 中文名, 英文名]；前后相接，起于 -403、止于 2026
  ext.periodBars = [
    {
      realm: 'japan',
      periods: [
        [-403, -300, '绳文', 'Jomon'],
        [-300, 250, '弥生', 'Yayoi'],
        [250, 592, '古坟', 'Kofun'],
        [592, 710, '飞鸟', 'Asuka'],
        [710, 794, '奈良', 'Nara'],
        [794, 1185, '平安', 'Heian'],
        [1185, 1333, '镰仓', 'Kamakura'],
        [1333, 1392, '南北朝', 'Nanboku-cho'],
        [1392, 1467, '室町', 'Muromachi'],
        [1467, 1573, '战国', 'Sengoku'],
        [1573, 1603, '安土桃山', 'Azuchi-Momoyama'],
        [1603, 1868, '江户', 'Edo'],
        [1868, 1912, '明治', 'Meiji'],
        [1912, 1926, '大正', 'Taisho'],
        [1926, 1989, '昭和', 'Showa'],
        [1989, 2019, '平成', 'Heisei'],
        [2019, 2026, '令和', 'Reiwa'],
      ],
    },
    {
      realm: 'korea',
      periods: [
        [-403, -108, '古朝鲜', 'Gojoseon'],
        [-108, -57, '汉四郡·三韩', 'Han commanderies · Samhan'],
        [-57, 668, '三国时代', 'Three Kingdoms'],
        [668, 900, '统一新罗', 'Unified Silla'],
        [900, 936, '后三国', 'Later Three Kingdoms'],
        [936, 1392, '高丽', 'Goryeo'],
        [1392, 1897, '朝鲜', 'Joseon'],
        [1897, 1910, '大韩帝国', 'Korean Empire'],
        [1910, 1945, '日据时期', 'Japanese rule'],
        [1945, 1948, '军政时期', 'Military government'],
        [1948, 2026, '朝鲜·韩国', 'North and South Korea'],
      ],
    },
  ];
})();
