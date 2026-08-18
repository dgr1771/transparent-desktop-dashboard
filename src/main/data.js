'use strict';

/**
 * 数据获取模块 - 在主进程执行网络请求（绕过渲染进程的 CORS 限制）
 * 提供天气、A股、新闻（RSS）数据
 */

const https = require('https');
const http = require('http');
const zlib = require('zlib');
const { ipcMain } = require('electron');
const platform = require('./platform');

// ============================================================
// 通用 HTTP 请求（支持 gzip/deflate 解压）
// ============================================================

/**
 * 通用 HTTP 请求（带超时 + 指数退避重试 + 重定向 socket 修复 + gzip/deflate/br 解压）
 * 可重试错误：超时 / 网络错误 / 5xx。4xx 不重试（客户端错误，重试无用）。
 * @param {string} url
 * @param {object} options - { headers, encoding, timeout, retries }
 */
function fetch(url, options = {}) {
  const retries = options.retries != null ? options.retries : 2;
  return _fetchOnce(url, options).catch((err) => {
    if (err.retryable && retries > 0) {
      const delay = 500 * Math.pow(2, 2 - retries); // 指数退避：500ms → 1000ms
      return new Promise((r) => setTimeout(r, delay))
        .then(() => fetch(url, { ...options, retries: retries - 1 }));
    }
    throw err;
  });
}

function _fetchOnce(url, options = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) DesktopDashboard/0.1',
        'Accept-Encoding': 'gzip, deflate',
        ...(options.headers || {})
      },
      timeout: options.timeout || 10000
    }, (res) => {
      // 重定向：先 resume 消费 body 释放 socket（修 socket 泄漏），再跟随（支持相对路径）
      // 上限 5 次：A→B→A 式循环重定向若无上限会永不 settle（news 卡永久转圈）
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const redirects = (options._redirects || 0) + 1;
        if (redirects > 5) {
          return reject(new Error('too many redirects'));
        }
        const next = new URL(res.headers.location, url).toString();
        return resolve(fetch(next, { ...options, _redirects: redirects }));
      }
      if (res.statusCode !== 200) {
        res.resume(); // 非 200 也消费 body，避免 socket 滞留
        const err = new Error(`HTTP ${res.statusCode}`);
        err.retryable = res.statusCode >= 500; // 仅 5xx 可重试
        return reject(err);
      }
      // 以 Buffer 收集
      const chunks = [];
      res.on('data', (chunk) => { chunks.push(chunk); });
      res.on('end', () => {
        let buf = Buffer.concat(chunks);
        // 解压
        const enc = res.headers['content-encoding'];
        try {
          if (enc === 'gzip') buf = zlib.gunzipSync(buf);
          else if (enc === 'deflate') buf = zlib.inflateSync(buf);
          else if (enc === 'br') buf = zlib.brotliDecompressSync(buf);
        } catch (e) {
          // 解压失败则用原始 buffer
        }
        // 编码解码（新浪 GBK，其他 UTF-8）
        if (options.encoding === 'gbk' || /charset=gb/i.test(res.headers['content-type'] || '')) {
          resolve(new TextDecoder('gbk').decode(buf));
        } else {
          resolve(buf.toString('utf8'));
        }
      });
    });
    req.on('error', (err) => { err.retryable = true; reject(err); }); // 网络错误可重试
    req.on('timeout', () => {
      req.destroy();
      const err = new Error('请求超时');
      err.retryable = true;
      reject(err);
    });
  });
}

// ============================================================
// IP 自动定位 - ip-api.com（免费，无需 key，支持中文）
// ============================================================

async function getIpLocation() {
  try {
    const url = 'http://ip-api.com/json/?lang=zh-CN&fields=status,country,regionName,city,lat,lon,query';
    const res = JSON.parse(await fetch(url));
    if (res.status === 'success') {
      return {
        city: res.city || res.regionName || '',
        region: res.regionName || '',
        country: res.country || '',
        lat: res.lat,
        lon: res.lon,
        ip: res.query
      };
    }
    return null;
  } catch (e) {
    console.error('IP 定位失败：', e.message);
    return null;
  }
}

// ============================================================
// 天气 - 和风天气（免费版）
// 文档：https://dev.qweather.com/
// 支持：1) 经纬度直接查（最准）2) 城市名查
// ============================================================

// 常用城市 → 和风 LocationID 离线映射（Geo API 对专属 Host 403 时的兜底，
// LocationID 是和风固定地理编码，可直接查 /v7/weather/now）
const CITY_ID_FALLBACK = {
  '北京': '101010100', '上海': '101020100', '广州': '101280101', '深圳': '101280601',
  '杭州': '101210101', '南京': '101190101', '成都': '101270101', '重庆': '101040100',
  '武汉': '101200101', '西安': '101110101', '苏州': '101190401', '天津': '101030100',
  '长沙': '101250101', '郑州': '101180101', '沈阳': '101070101', '大连': '101070201',
  '青岛': '101120201', '济南': '101120101', '厦门': '101230201', '福州': '101230101',
  '昆明': '101290101', '贵阳': '101260101', '南宁': '101300101', '海口': '101310101',
  '兰州': '101160101', '乌鲁木齐': '101130101', '哈尔滨': '101050101', '长春': '101060101',
  '太原': '101100101', '石家庄': '101090101', '合肥': '101220101', '南昌': '101240101',
  '无锡': '101190201', '宁波': '101210401', '佛山': '101280800', '东莞': '101281601'
};

async function getWeather(city, apiKey, lat, lon, apiHost) {
  if (!apiKey) {
    return { error: '未配置和风天气 API Key。请在设置中填入（免费申请：dev.qweather.com）' };
  }
  // API Host：默认 devapi，可在设置里覆盖（和风 2024 后每个 Key 绑定特定域名）
  const host = apiHost || 'devapi.qweather.com';
  const fetchWeather = async (location) => {
    const wRes = JSON.parse(await fetch(`https://${host}/v7/weather/now?location=${location}&key=${apiKey}`));
    if (wRes.code !== '200') throw new Error(`天气接口 code=${wRes.code}`);
    return wRes;
  };
  try {
    // 1) 优先经纬度（最准）
    if (lat != null && lon != null) {
      const wRes = await fetchWeather(`${lon},${lat}`);
      return { city: city || '当前位置', region: '', now: wRes.now, updated: new Date().toLocaleString('zh-CN') };
    }

    // 2) 城市名 → 尝试 Geo lookup（公开 Host 可用；专属 Host 常对 Geo 403）
    const bare = (city || '').replace(/[市省县区]$/, '');  // "沈阳市"→"沈阳"
    let loc = null;
    try {
      const geoRes = JSON.parse(await fetch(`https://${host}/geo/v2/city/lookup?location=${encodeURIComponent(bare)}&key=${apiKey}`));
      if (geoRes.location && geoRes.location.length > 0) loc = geoRes.location[0];
    } catch (e) { /* Geo 失败走兜底 */ }

    // 3) Geo 失败/403 → 内置城市 ID 映射兜底
    if (!loc) {
      const id = CITY_ID_FALLBACK[bare] || CITY_ID_FALLBACK[city];
      if (!id) {
        return { error: `城市「${city}」无法定位（Geo API 对该 Host 不可用，且不在内置城市表中）。建议在设置里点「📍 定位」用经纬度查询。` };
      }
      const wRes = await fetchWeather(id);
      return { city: bare, region: '', now: wRes.now, updated: new Date().toLocaleString('zh-CN') };
    }

    const wRes = await fetchWeather(loc.id);
    return { city: loc.name, region: loc.adm1, now: wRes.now, updated: new Date().toLocaleString('zh-CN') };
  } catch (e) {
    return { error: `天气获取失败：${e.message}` };
  }
}

// ============================================================
// A股 - 新浪财经接口（无需 key）
// 接口示例：https://hq.sinajs.cn/list=sh000001,sh600519
// 返回 GBK 编码的行情数据
// ============================================================

async function getStocks(codes) {
  if (!codes || codes.length === 0) {
    return { error: '未配置股票代码' };
  }
  try {
    const url = `https://hq.sinajs.cn/list=${codes.join(',')}`;
    // 新浪接口要求 Referer，否则返回 403；返回内容为 GBK 编码
    const raw = await fetch(url, {
      headers: { 'Referer': 'https://finance.sina.com.cn' },
      encoding: 'gbk'
    });

    // 解析：var hq_str_sh000001="上证指数,3289.99,...";
    const stocks = [];
    const invalidCodes = [];   // 无效/停牌代码显式提示（新浪对无效代码返回空串，静默跳过用户会困惑）
    const lines = raw.split('\n');
    for (const line of lines) {
      const m = line.match(/var hq_str_(\w+)="(.*)";/);
      if (!m) continue;
      const code = m[1];
      const fields = m[2].split(',');
      if (fields.length < 32 || !fields[0]) { invalidCodes.push(code); continue; }

      // 新浪字段顺序（沪深统一）：
      // 0名称,1今开,2昨收,3最新价,4最高,5最低,6买一,7卖一,
      // 8成交量(手),9成交额(元),10-29买卖五档,30日期,31时间
      const name = fields[0];
      const price = parseFloat(fields[3]);
      const prevClose = parseFloat(fields[2]);
      const change = price - prevClose;
      const changePct = prevClose > 0 ? (change / prevClose * 100) : 0;
      const open = parseFloat(fields[1]);
      const high = parseFloat(fields[4]);
      const low = parseFloat(fields[5]);
      const volume = parseFloat(fields[8]);   // 成交量（手）
      const amount = parseFloat(fields[9]);   // 成交额（元）
      const date = fields[30];
      const time = fields[31];

      stocks.push({
        code,
        name,
        price,
        prevClose,
        change: +change.toFixed(3),
        changePct: +changePct.toFixed(2),
        open,
        high,
        low,
        amount,        // 成交额（元）
        date,
        time,
        isUp: change >= 0
      });
    }
    if (stocks.length === 0 && invalidCodes.length > 0) {
      return { error: `全部代码无效：${invalidCodes.join('、')}（请检查股票代码，如 sh600519 / sz000001）` };
    }
    const warn = invalidCodes.length > 0 ? `（${invalidCodes.join('、')} 为无效代码已跳过）` : undefined;
    console.info(`[stocks] 成功 ${stocks.length} 只${warn || ''}`);
    return { stocks, updated: new Date().toLocaleString('zh-CN'), warn };
  } catch (e) {
    console.error('[stocks] 获取失败:', e.message, 'codes=', JSON.stringify(codes));
    return { error: `股票获取失败：${e.message}` };
  }
}

// ============================================================
// 新闻 - RSS 聚合（无需 key）
// 多源抓取 + 去重 + 按时间排序
// ============================================================

async function getNews(sources) {
  if (!sources || sources.length === 0) {
    return { error: '未配置新闻源' };
  }

  const allNews = [];
  const errors = [];

  // 并行抓取所有源
  const results = await Promise.allSettled(
    sources.map(async (src) => {
      const xml = await fetch(src.url);
      const items = parseRSS(xml, src.name);
      return items;
    })
  );

  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      allNews.push(...r.value);
    } else {
      errors.push(`${sources[i].name}: ${r.reason.message}`);
    }
  });

  // 按发布时间排序（最新的在前），取前 30 条
  allNews.sort((a, b) => (b.pubDate || 0) - (a.pubDate || 0));

  return {
    items: allNews.slice(0, 30),
    errors: errors.length > 0 ? errors : undefined,
    updated: new Date().toLocaleString('zh-CN')
  };
}

/**
 * 简易 RSS 解析（支持 RSS 2.0 和 Atom）
 */
function parseRSS(xml, sourceName) {
  const items = [];
  // RSS 2.0: <item>...</item>
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  // Atom: <entry>...</entry>
  const entryRegex = /<entry[^>]*>([\s\S]*?)<\/entry>/gi;

  const parseItem = (block) => {
    const getTag = (tag) => {
      const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
      return m ? decodeXml(m[1].trim()) : '';
    };
    const getAttr = (tag, attr) => {
      const m = block.match(new RegExp(`<${tag}[^>]*${attr}=["']([^"']*)["']`, 'i'));
      return m ? m[1] : '';
    };

    let title = getTag('title');
    let link = getTag('link') || getAttr('link', 'href');
    let desc = getTag('description') || getTag('summary');
    let pubDateText = getTag('pubDate') || getTag('published') || getTag('updated');

    // 清理 CDATA
    title = title.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
    link = link.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
    // 去除 HTML 标签的描述（取前 200 字符）
    desc = desc.replace(/<[^>]+>/g, '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim().slice(0, 200);

    const pubDate = pubDateText ? new Date(pubDateText).getTime() : Date.now();

    if (title) {
      items.push({ title, link, desc, pubDate, pubDateText, source: sourceName });
    }
  };

  let m;
  while ((m = itemRegex.exec(xml)) !== null) parseItem(m[1]);
  while ((m = entryRegex.exec(xml)) !== null) parseItem(m[1]);

  return items;
}

function decodeXml(s) {
  // 先解码命名实体
  let out = s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8217;/g, "'")
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&#8230;/g, '…');
  // 再解码数字实体（十进制 &#NN; 和十六进制 &#xNN;）
  out = out.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));
  out = out.replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
  return out;
}

// ============================================================
// 热搜 - 今日头条热榜（JSON，无需 key、无需 cookie）
// ============================================================

async function getHotSearch() {
  try {
    const url = 'https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc';
    const raw = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    const j = JSON.parse(raw);
    const items = (j.data || []).slice(0, 20).map((it) => ({
      title: it.Title,
      hot: it.HotValue,
      url: it.Url,
      label: it.Label || ''
    }));
    return { items, updated: new Date().toLocaleString('zh-CN') };
  } catch (e) {
    return { error: `热搜获取失败：${e.message}` };
  }
}

// ============================================================
// 系统监控 - CPU/内存/网速/电池
// ============================================================

const osMonitor = require('os');
const { powerMonitor } = require('electron');

let _lastNet = { rx: 0, tx: 0, time: Date.now() };

/**
 * 估算 CPU 占用率（两次采样的负载均值差 / 核心数）
 * os.loadavg() 返回 1/5/15 分钟平均负载，除以核心数得近似占用率
 */
function getCpuUsage() {
  // Windows 上 os.loadavg() 恒返回 0，用 koffi GetSystemTimes 两次采样算真实占用
  if (platform.isWin && platform.getCpuUsageByKoffi) {
    const u = platform.getCpuUsageByKoffi();
    if (u != null) return u;
  }
  const load = osMonitor.loadavg()[0]; // Linux/mac: 1分钟平均负载
  const cores = osMonitor.cpus().length;
  return Math.min(100, Math.round((load / cores) * 100));
}

/**
 * 内存占用
 */
function getMemUsage() {
  const total = osMonitor.totalmem();
  const free = osMonitor.freemem();
  const used = total - free;
  return {
    total,
    used,
    free,
    percent: Math.round((used / total) * 100)
  };
}

/**
 * 网速估算（通过累计的网络接口字节数差值）
 */
function getNetSpeed() {
  let rxTotal = 0, txTotal = 0;
  const ifaces = osMonitor.networkInterfaces();
  // 排除内部接口，累加真实网卡的收发字节
  Object.values(ifaces).forEach((addrs) => {
    addrs.forEach((a) => {
      if (!a.internal) {
        // Electron 下无直接的字节计数，用近似：统计接口存在性
        // 真正的网速需要读 /proc/net/dev (Linux) 或 performance counter
      }
    });
  });
  // 简化：网速在 Electron 内无标准 API，这里返回占位（渲染进程可补充）
  return { rx: 0, tx: 0 };
}

// 磁盘缓存（模块级变量，避免 this 指向问题）
let _diskCache = null;
let _diskCacheTime = 0;

async function getSysMonitor() {
  try {
    const cpu = osMonitor.cpus();
    const cpuModel = cpu[0]?.model || '未知';
    const cpuUsage = getCpuUsage();

    const mem = getMemUsage();

    // 电池（Electron powerMonitor）
    let battery = null;
    try {
      const bm = powerMonitor.isOnBatteryPower();
      battery = { onBattery: bm };
    } catch (e) {
      battery = null;
    }

    // 系统运行时间
    const uptimeSec = osMonitor.uptime();
    const uptimeH = Math.floor(uptimeSec / 3600);
    const uptimeM = Math.floor((uptimeSec % 3600) / 60);

    // 磁盘用量（缓存 5 分钟，避免频繁启动 PowerShell 进程导致卡顿）
    let disk = null;
    const now = Date.now();
    if (!_diskCache || (now - _diskCacheTime) > 5 * 60 * 1000) {
      try {
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);
        if (process.platform === 'win32') {
          const { stdout } = await execAsync('powershell -NoProfile -Command "(Get-Volume -DriveLetter C | Select-Object Size,SizeRemaining | ConvertTo-Json -Compress)"', { encoding: 'utf8', timeout: 5000 });
          const j = JSON.parse(stdout.trim());
          if (j && j.Size) {
            disk = { total: j.Size, used: j.Size - j.SizeRemaining, free: j.SizeRemaining, percent: Math.round((j.Size - j.SizeRemaining) / j.Size * 100) };
          }
        } else {
          const { stdout } = await execAsync('df -k / 2>/dev/null | tail -1', { encoding: 'utf8', timeout: 3000 });
          const parts = stdout.trim().split(/\s+/);
          const total = parseInt(parts[1], 10) * 1024;
          const free = parseInt(parts[3], 10) * 1024;
          if (total > 0) disk = { total, used: total - free, free, percent: Math.round((total - free) / total * 100) };
        }
        _diskCache = disk;
        _diskCacheTime = now;
      } catch (e) {
        disk = _diskCache;  // 失败时用缓存
      }
    } else {
      disk = _diskCache;  // 用缓存
    }

    return {
      cpu: {
        usage: cpuUsage,
        cores: cpu.length,
        model: cpuModel.split(' ').slice(0, 4).join(' ') // 简短型号
      },
      memory: mem,
      disk,
      battery,
      uptime: `${uptimeH}h ${uptimeM}m`,
      platform: process.platform,
      updated: new Date().toLocaleString('zh-CN')
    };
  } catch (e) {
    return { error: `系统监控失败：${e.message}` };
  }
}
// ============================================================
// 注册 IPC 处理器
// ============================================================

function registerDataHandlers(configStore) {
  // 读取配置（主进程侧持久化文件）
  ipcMain.handle('config:get', () => configStore.getAll());

  ipcMain.handle('config:set', (e, data) => {
    const prev = configStore.getAll();
    const profilesChanged = JSON.stringify(prev.layoutProfiles) !== JSON.stringify(data.layoutProfiles)
      || prev.activeProfile !== data.activeProfile;
    configStore.setAll(data);
    // 布局方案/当前方案变化才重建托盘菜单（防木鱼等高频写入放大）
    if (profilesChanged && global.__refreshTrayMenu) global.__refreshTrayMenu();
    // 广播给除发送者外的窗口：多显示器各窗口 Store 缓存互不知情，
    // 不广播会 last-writer-wins 互相回滚布局
    if (global.__broadcastConfigUpdated) global.__broadcastConfigUpdated(e.sender.id);
    return true;
  });

  // IP 自动定位
  ipcMain.handle('data:ip-location', async () => {
    return getIpLocation();
  });

  ipcMain.handle('data:weather', async () => {
    const cfg = configStore.getAll();
    return getWeather(
      cfg.weather?.city || '北京',
      cfg.weather?.apiKey || '',
      cfg.weather?.lat,
      cfg.weather?.lon,
      cfg.weather?.apiHost
    );
  });

  ipcMain.handle('data:stocks', async () => {
    const cfg = configStore.getAll();
    return getStocks(cfg.stock?.codes || []);
  });

  ipcMain.handle('data:news', async () => {
    const cfg = configStore.getAll();
    return getNews(cfg.news?.sources || []);
  });

  ipcMain.handle('data:hotsearch', async () => getHotSearch());

  ipcMain.handle('data:sysmonitor', async () => getSysMonitor());

  // ============================================================
  // AI 能力（BYOK：云端自选服务商只填 Key / 本地算力默认 Ollama）
  // 所有服务商统一 OpenAI 兼容 /chat/completions，一套代码全通。
  // Key 只存本机 config.json，请求从主进程直发（绕 CORS，复用超时控制）。
  // ============================================================
  const AI_PROVIDERS = {
    zhipu:   { label: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },  // flash 档免费
    deepseek:{ label: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' },
    qwen:    { label: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  };

  /** 解析当前配置 → {baseUrl, model, apiKey, ok, reason} */
  function resolveAI() {
    const ai = (configStore.getAll().settings || {}).ai || {};
    if (ai.mode === 'cloud') {
      if (!ai.apiKey) return { ok: false, reason: '未填写 API Key（设置 → AI 助手）' };
      if (ai.provider === 'custom') {
        if (!ai.customBaseUrl) return { ok: false, reason: '自定义服务商未填写接口地址' };
        return { ok: true, baseUrl: ai.customBaseUrl, model: ai.customModel || 'gpt-3.5-turbo', apiKey: ai.apiKey };
      }
      const p = AI_PROVIDERS[ai.provider || 'zhipu'];
      return { ok: true, baseUrl: p.baseUrl, model: ai.customModel || p.model, apiKey: ai.apiKey };
    }
    if (ai.mode === 'local') {
      const baseUrl = ai.localBaseUrl || 'http://localhost:11434/v1';
      if (!ai.localModel) return { ok: false, reason: '未选择本地模型（需先启动 Ollama）' };
      return { ok: true, baseUrl, model: ai.localModel, apiKey: 'ollama' };  // Ollama 不校验鉴权头
    }
    return { ok: false, reason: 'AI 未启用（设置 → AI 助手）' };
  }

  /** 列出本地 Ollama 已安装模型（用户免手填模型名） */
  ipcMain.handle('ai:local-models', async () => {
    try {
      const ai = (configStore.getAll().settings || {}).ai || {};
      const base = (ai.localBaseUrl || 'http://localhost:11434').replace(/\/v1\/?$/, '');
      const raw = await fetch(base + '/api/tags', { timeout: 5000, retries: 0 });
      const j = JSON.parse(raw);
      return { ok: true, models: (j.models || []).map(m => m.name) };
    } catch (e) { return { ok: false, reason: '未检测到本地服务，请先安装并启动 Ollama' }; }
  });

  /** AI 对话（OpenAI 兼容格式）。返回 {ok, text} 或 {ok:false, reason} */
  ipcMain.handle('ai:chat', async (_e, messages, opts = {}) => {
    const cfg = resolveAI();
    if (!cfg.ok) { console.warn('[ai] 未就绪:', cfg.reason); return cfg; }
    console.info(`[ai] 请求: ${cfg.baseUrl} model=${cfg.model} msgs=${messages.length}`);
    const url = cfg.baseUrl.replace(/\/$/, '') + '/chat/completions';
    const body = JSON.stringify({
      model: cfg.model,
      messages,
      temperature: opts.temperature != null ? opts.temperature : 0.5,
      max_tokens: opts.maxTokens || 800,
      stream: false
    });
    const doReq = () => new Promise((resolve, reject) => {
      const lib = url.startsWith('https') ? https : http;
      const req = lib.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + cfg.apiKey,
          'Content-Length': Buffer.byteLength(body)
        },
        timeout: 60000   // 生成式请求默认 10s 不够，给 60s
      }, (res) => {
        let d = '';
        res.on('data', c => { d += c; });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            return reject(new Error('HTTP ' + res.statusCode + ' ' + d.slice(0, 200)));
          }
          try {
            resolve(JSON.parse(d).choices[0].message.content);
          } catch (e) { reject(new Error('响应解析失败')); }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('AI 请求超时')); });
      req.write(body);
      req.end();
    });
    try {
      const text = await doReq().catch(() => doReq());   // 网络错误重试 1 次
      console.info('[ai] 成功: ' + String(text).slice(0, 80).replace(/\n/g, ' '));
      return { ok: true, text };
    } catch (e) {
      console.error('[ai] 失败:', e.message);
      return { ok: false, reason: 'AI 请求失败：' + e.message };
    }
  });
}


module.exports = { registerDataHandlers, getWeather, getStocks, getNews, getIpLocation, getHotSearch, getSysMonitor };
