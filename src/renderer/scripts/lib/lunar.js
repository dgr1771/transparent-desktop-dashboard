/* ============================================================
   农历/节气计算库
   覆盖范围 1900-2100，基于标准农历数据表
   ============================================================ */

const Lunar = {
  // 1900-2100 农历数据表（每年用十六进制编码）
  // 信息：闰月、大小月、闰月天数、农历年首正月初一的儒略日
  // 数据格式：第 4-15 位为 12/13 个月的大小月（1=大30天，0=小29天）
  _lunarInfo: [
    0x04bd8,0x04ae0,0x0a570,0x054d5,0x0d260,0x0d950,0x16554,0x056a0,0x09ad0,0x055d2,
    0x04ae0,0x0a5b6,0x0a4d0,0x0d250,0x1d255,0x0b540,0x0d6a0,0x0ada2,0x095b0,0x14977,
    0x04970,0x0a4b0,0x0b4b5,0x06a50,0x06d40,0x1ab54,0x02b60,0x09570,0x052f2,0x04970,
    0x06566,0x0d4a0,0x0ea50,0x06e95,0x05ad0,0x02b60,0x186e3,0x092e0,0x1c8d7,0x0c950,
    0x0d4a0,0x1d8a6,0x0b550,0x056a0,0x1a5b4,0x025d0,0x092d0,0x0d2b2,0x0a950,0x0b557,
    0x06ca0,0x0b550,0x15355,0x04da0,0x0a5b0,0x14573,0x052b0,0x0a9a8,0x0e950,0x06aa0,
    0x0aea6,0x0ab50,0x04b60,0x0aae4,0x0a570,0x05260,0x0f263,0x0d950,0x05b57,0x056a0,
    0x096d0,0x04dd5,0x04ad0,0x0a4d0,0x0d4d4,0x0d250,0x0d558,0x0b540,0x0b6a0,0x195a6,
    0x095b0,0x049b0,0x0a974,0x0a4b0,0x0b27a,0x06a50,0x06d40,0x0af46,0x0ab60,0x09570,
    0x04af5,0x04970,0x064b0,0x074a3,0x0ea50,0x06b58,0x055c0,0x0ab60,0x096d5,0x092e0,
    0x0c960,0x0d954,0x0d4a0,0x0da50,0x07552,0x056a0,0x0abb7,0x025d0,0x092d0,0x0cab5,
    0x0a950,0x0b4a0,0x0baa4,0x0ad50,0x055d9,0x04ba0,0x0a5b0,0x15176,0x052b0,0x0a930,
    0x07954,0x06aa0,0x0ad50,0x05b52,0x04b60,0x0a6e6,0x0a4e0,0x0d260,0x0ea65,0x0d530,
    0x05aa0,0x076a3,0x096d0,0x04afb,0x04ad0,0x0a4d0,0x1d0b6,0x0d250,0x0d520,0x0dd45,
    0x0b5a0,0x056d0,0x055b2,0x049b0,0x0a577,0x0a4b0,0x0aa50,0x1b255,0x06d20,0x0ada0,
    0x14b63,0x09370,0x049f8,0x04970,0x064b0,0x168a6,0x0ea50,0x06b20,0x1a6c4,0x0aae0,
    0x0a2e0,0x0d2e3,0x0c960,0x0d557,0x0d4a0,0x0da50,0x05d55,0x056a0,0x0a6d0,0x055d4,
    0x052d0,0x0a9b8,0x0a950,0x0b4a0,0x0b6a6,0x0ad50,0x055a0,0x0aba4,0x0a5b0,0x052b0,
    0x0b273,0x06930,0x07337,0x06aa0,0x0ad50,0x14b55,0x04b60,0x0a570,0x054e4,0x0d160,
    0x0e968,0x0d520,0x0daa0,0x16aa6,0x056d0,0x04ae0,0x0a9d4,0x0a2d0,0x0d150,0x0f252,
    0x0d520
  ],

  _lunarMonth: ['正','二','三','四','五','六','七','八','九','十','冬','腊'],

  // 公历节日（月-日 → 名称）
  _solarFestivals: {
    '1-1':'元旦','2-14':'情人节','3-8':'妇女节','3-12':'植树节','4-1':'愚人节',
    '5-1':'劳动节','5-4':'青年节','6-1':'儿童节','7-1':'建党节','8-1':'建军节',
    '9-10':'教师节','10-1':'国庆节','10-2':'国庆节','10-3':'国庆节',
    '11-11':'光棍节','12-24':'平安夜','12-25':'圣诞节'
  },

  // 农历节日（农历月-日 → 名称）
  _lunarFestivals: {
    '1-1':'春节','1-15':'元宵节','2-2':'龙抬头','5-5':'端午节',
    '7-7':'七夕','7-15':'中元节','8-15':'中秋节','9-9':'重阳节',
    '12-8':'腊八节','12-30':'除夕','12-29':'除夕'  // 小月时廿九是除夕
  },
  _lunarDay: ['初一','初二','初三','初四','初五','初六','初七','初八','初九','初十',
    '十一','十二','十三','十四','十五','十六','十七','十八','十九','二十',
    '廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'],
  _solarTerm: ['小寒','大寒','立春','雨水','惊蛰','春分','清明','谷雨','立夏','小满',
    '芒种','夏至','小暑','大暑','立秋','处暑','白露','秋分','寒露','霜降','立冬','小雪','大雪','冬至'],

  // 二十四节气的日期估算表（C 值，用于通用公式）
  _solarTermInfo: [
    0,21208,42467,63836,85337,107014,128867,150921,173149,195551,218072,240693,
    263343,285989,308563,331033,353350,375494,397447,419210,440795,462224,483532,504758
  ],

  // 公历转农历
  solar2lunar(year, month, day) {
    if (year < 1900 || year > 2100) return null;
    const baseDate = new Date(1900, 0, 31); // 1900-01-31 正月初一
    const objDate = new Date(year, month - 1, day);
    let offset = Math.round((objDate - baseDate) / 86400000);

    let i, temp = 0;
    let lunarYear;
    for (i = 1900; i < 2101 && offset > 0; i++) {
      temp = this._lunarYearDays(i);
      offset -= temp;
    }
    if (offset < 0) { offset += temp; i--; }
    lunarYear = i;

    const leap = this._leapMonth(i);
    let isLeap = false;

    let lunarMonth, lunarDay;
    for (i = 1; i < 13 && offset >= 0; i++) {
      if (leap > 0 && i === leap + 1 && !isLeap) {
        --i; isLeap = true; temp = this._leapDays(lunarYear);
      } else {
        temp = this._monthDays(lunarYear, i);
      }
      if (isLeap && i === leap + 1) isLeap = false;
      offset -= temp;
    }
    if (offset === 0 && leap > 0 && i === leap + 1) {
      if (isLeap) isLeap = false; else { isLeap = true; --i; }
    }
    if (offset < 0) { offset += temp; --i; }
    lunarMonth = i;
    lunarDay = offset + 1;

    return {
      year: lunarYear,
      month: lunarMonth,
      day: lunarDay,
      isLeap,
      monthStr: (isLeap ? '闰' : '') + this._lunarMonth[lunarMonth - 1] + '月',
      dayStr: this._lunarDay[lunarDay - 1]
    };
  },

  _leapMonth(year) { return this._lunarInfo[year - 1900] & 0xf; },
  _leapDays(year) {
    if (this._leapMonth(year)) return (this._lunarInfo[year - 1900] & 0x10000) ? 30 : 29;
    return 0;
  },
  _monthDays(year, month) {
    return (this._lunarInfo[year - 1900] & (0x10000 >> month)) ? 30 : 29;
  },
  _lunarYearDays(year) {
    let sum = 348;
    for (let i = 0x8000; i > 0x8; i >>= 1) sum += (this._lunarInfo[year - 1900] & i) ? 1 : 0;
    return sum + this._leapDays(year);
  },

  // 获取某日的节气（如果有）
  getSolarTerm(year, month, day) {
    const termData = this._TERM_TABLE[`${year}-${month}`];
    if (!termData) return null;
    for (const t of termData) {
      if (t.day === day) return t.name;
    }
    return null;
  },

  // 获取某日的节日（公历/农历），优先级：节日 > 节气
  getFestival(year, month, day) {
    // 公历节日
    const sf = this._solarFestivals[`${month}-${day}`];
    if (sf) return { name: sf, type: 'festival' };
    // 农历节日
    const l = this.solar2lunar(year, month, day);
    if (l) {
      const lf = this._lunarFestivals[`${l.month}-${l.day}`];
      if (lf) return { name: lf, type: 'festival' };
      // 除夕特殊处理：腊月最后一天（可能30或29）
      if (l.month === 12 && l.day === 30) return { name: '除夕', type: 'festival' };
    }
    return null;
  },

  // 精确节气表（2024-2030），格式：{ "年-月": [{day, name}, ...] }
  // 每月 2 个节气，按时间顺序
  _TERM_TABLE: {
    '2024-1':  [{day:6,name:'小寒'},{day:20,name:'大寒'}],
    '2024-2':  [{day:4,name:'立春'},{day:19,name:'雨水'}],
    '2024-3':  [{day:5,name:'惊蛰'},{day:20,name:'春分'}],
    '2024-4':  [{day:4,name:'清明'},{day:19,name:'谷雨'}],
    '2024-5':  [{day:5,name:'立夏'},{day:20,name:'小满'}],
    '2024-6':  [{day:5,name:'芒种'},{day:21,name:'夏至'}],
    '2024-7':  [{day:6,name:'小暑'},{day:22,name:'大暑'}],
    '2024-8':  [{day:7,name:'立秋'},{day:22,name:'处暑'}],
    '2024-9':  [{day:7,name:'白露'},{day:22,name:'秋分'}],
    '2024-10': [{day:8,name:'寒露'},{day:23,name:'霜降'}],
    '2024-11': [{day:7,name:'立冬'},{day:22,name:'小雪'}],
    '2024-12': [{day:7,name:'大雪'},{day:21,name:'冬至'}],
    '2025-1':  [{day:5,name:'小寒'},{day:20,name:'大寒'}],
    '2025-2':  [{day:3,name:'立春'},{day:18,name:'雨水'}],
    '2025-3':  [{day:5,name:'惊蛰'},{day:20,name:'春分'}],
    '2025-4':  [{day:4,name:'清明'},{day:20,name:'谷雨'}],
    '2025-5':  [{day:5,name:'立夏'},{day:21,name:'小满'}],
    '2025-6':  [{day:5,name:'芒种'},{day:21,name:'夏至'}],
    '2025-7':  [{day:7,name:'小暑'},{day:22,name:'大暑'}],
    '2025-8':  [{day:7,name:'立秋'},{day:23,name:'处暑'}],
    '2025-9':  [{day:7,name:'白露'},{day:23,name:'秋分'}],
    '2025-10': [{day:8,name:'寒露'},{day:23,name:'霜降'}],
    '2025-11': [{day:7,name:'立冬'},{day:22,name:'小雪'}],
    '2025-12': [{day:7,name:'大雪'},{day:21,name:'冬至'}],
    '2026-1':  [{day:5,name:'小寒'},{day:20,name:'大寒'}],
    '2026-2':  [{day:4,name:'立春'},{day:18,name:'雨水'}],
    '2026-3':  [{day:5,name:'惊蛰'},{day:20,name:'春分'}],
    '2026-4':  [{day:5,name:'清明'},{day:20,name:'谷雨'}],
    '2026-5':  [{day:5,name:'立夏'},{day:21,name:'小满'}],
    '2026-6':  [{day:5,name:'芒种'},{day:21,name:'夏至'}],
    '2026-7':  [{day:7,name:'小暑'},{day:22,name:'大暑'}],
    '2026-8':  [{day:7,name:'立秋'},{day:23,name:'处暑'}],
    '2026-9':  [{day:7,name:'白露'},{day:23,name:'秋分'}],
    '2026-10': [{day:8,name:'寒露'},{day:23,name:'霜降'}],
    '2026-11': [{day:7,name:'立冬'},{day:22,name:'小雪'}],
    '2026-12': [{day:7,name:'大雪'},{day:22,name:'冬至'}],
    '2027-1':  [{day:5,name:'小寒'},{day:20,name:'大寒'}],
    '2027-2':  [{day:4,name:'立春'},{day:19,name:'雨水'}],
    '2027-3':  [{day:6,name:'惊蛰'},{day:21,name:'春分'}],
    '2027-4':  [{day:5,name:'清明'},{day:20,name:'谷雨'}],
    '2027-5':  [{day:5,name:'立夏'},{day:21,name:'小满'}],
    '2027-6':  [{day:6,name:'芒种'},{day:21,name:'夏至'}],
    '2027-7':  [{day:7,name:'小暑'},{day:23,name:'大暑'}],
    '2027-8':  [{day:8,name:'立秋'},{day:23,name:'处暑'}],
    '2027-9':  [{day:7,name:'白露'},{day:23,name:'秋分'}],
    '2027-10': [{day:8,name:'寒露'},{day:23,name:'霜降'}],
    '2027-11': [{day:7,name:'立冬'},{day:22,name:'小雪'}],
    '2027-12': [{day:7,name:'大雪'},{day:22,name:'冬至'}],
    '2028-1':  [{day:6,name:'小寒'},{day:20,name:'大寒'}],
    '2028-2':  [{day:4,name:'立春'},{day:19,name:'雨水'}],
    '2028-3':  [{day:5,name:'惊蛰'},{day:20,name:'春分'}],
    '2028-4':  [{day:4,name:'清明'},{day:19,name:'谷雨'}],
    '2028-5':  [{day:5,name:'立夏'},{day:20,name:'小满'}],
    '2028-6':  [{day:5,name:'芒种'},{day:21,name:'夏至'}],
    '2028-7':  [{day:6,name:'小暑'},{day:22,name:'大暑'}],
    '2028-8':  [{day:7,name:'立秋'},{day:22,name:'处暑'}],
    '2028-9':  [{day:7,name:'白露'},{day:22,name:'秋分'}],
    '2028-10': [{day:8,name:'寒露'},{day:23,name:'霜降'}],
    '2028-11': [{day:7,name:'立冬'},{day:22,name:'小雪'}],
    '2028-12': [{day:6,name:'大雪'},{day:21,name:'冬至'}],
    '2029-1':  [{day:5,name:'小寒'},{day:20,name:'大寒'}],
    '2029-2':  [{day:3,name:'立春'},{day:18,name:'雨水'}],
    '2029-3':  [{day:5,name:'惊蛰'},{day:20,name:'春分'}],
    '2029-4':  [{day:4,name:'清明'},{day:20,name:'谷雨'}],
    '2029-5':  [{day:5,name:'立夏'},{day:21,name:'小满'}],
    '2029-6':  [{day:5,name:'芒种'},{day:21,name:'夏至'}],
    '2029-7':  [{day:7,name:'小暑'},{day:22,name:'大暑'}],
    '2029-8':  [{day:7,name:'立秋'},{day:23,name:'处暑'}],
    '2029-9':  [{day:7,name:'白露'},{day:23,name:'秋分'}],
    '2029-10': [{day:8,name:'寒露'},{day:23,name:'霜降'}],
    '2029-11': [{day:7,name:'立冬'},{day:22,name:'小雪'}],
    '2029-12': [{day:7,name:'大雪'},{day:22,name:'冬至'}],
    '2030-1':  [{day:5,name:'小寒'},{day:20,name:'大寒'}],
    '2030-2':  [{day:4,name:'立春'},{day:18,name:'雨水'}],
    '2030-3':  [{day:5,name:'惊蛰'},{day:20,name:'春分'}],
    '2030-4':  [{day:5,name:'清明'},{day:20,name:'谷雨'}],
    '2030-5':  [{day:5,name:'立夏'},{day:21,name:'小满'}],
    '2030-6':  [{day:5,name:'芒种'},{day:21,name:'夏至'}],
    '2030-7':  [{day:7,name:'小暑'},{day:22,name:'大暑'}],
    '2030-8':  [{day:7,name:'立秋'},{day:23,name:'处暑'}],
    '2030-9':  [{day:7,name:'白露'},{day:23,name:'秋分'}],
    '2030-10': [{day:8,name:'寒露'},{day:23,name:'霜降'}],
    '2030-11': [{day:7,name:'立冬'},{day:22,name:'小雪'}],
    '2030-12': [{day:7,name:'大雪'},{day:22,name:'冬至'}]
  }
};
