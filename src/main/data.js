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
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        return resolve(fetch(next, options));
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

async function getWeather(city, apiKey, lat, lon, apiHost) {
  if (!apiKey) {
    return { error: '未配置和风天气 API Key。请在设置中填入（免费申请：dev.qweather.com）' };
  }
  // API Host：默认 devapi，可在设置里覆盖（和风 2024 后每个 Key 绑定特定域名）
  const host = apiHost || 'devapi.qweather.com';
  try {
    let loc;
    // 优先用经纬度（最准确）
    if (lat != null && lon != null) {
      const weatherUrl = `https://${host}/v7/weather/now?location=${lon},${lat}&key=${apiKey}`;
      const wRes = JSON.parse(await fetch(weatherUrl));
      if (wRes.code === '200') {
        return {
          city: city || '当前位置',
          region: '',
          now: wRes.now,
          updated: new Date().toLocaleString('zh-CN')
        };
      }
      // 403 通常是 API Host 不匹配
      if (wRes.error && wRes.error.status === 403) {
        return { error: `API Host 不匹配（${host}）。请在和风控制台检查该 Key 绑定的 API Host，或在本应用设置里填写正确的 Host。` };
      }
    }

    // 退回城市名查询
    const geoUrl = `https://${host}/geo/v2/city/lookup?location=${encodeURIComponent(city)}&key=${apiKey}`;
    const geoRes = JSON.parse(await fetch(geoUrl));
    if (geoRes.error && geoRes.error.status === 403) {
      return { error: `API Host 不匹配（${host}）。请检查和风控制台该 Key 绑定的 API Host。` };
    }
    if (!geoRes.location || geoRes.location.length === 0) {
      return { error: `未找到城市：${city}` };
    }
    loc = geoRes.location[0];

    // 实时天气
    const weatherUrl = `https://${host}/v7/weather/now?location=${loc.id}&key=${apiKey}`;
    const wRes = JSON.parse(await fetch(weatherUrl));

    return {
      city: loc.name,
      region: loc.adm1,
      now: wRes.now,
      updated: new Date().toLocaleString('zh-CN')
    };
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
    const lines = raw.split('\n');
    for (const line of lines) {
      const m = line.match(/var hq_str_(\w+)="(.*)";/);
      if (!m) continue;
      const code = m[1];
      const fields = m[2].split(',');
      if (fields.length < 32 || !fields[0]) continue;

      // 新浪字段顺序（沪深统一）：
      // 0名称,1今开,2昨收,3最新价,4最高,5最低,6买一,7卖一,
      // 8-15买卖量价,16成交量(手),17成交额,18-29买卖盘,30日期,31时间
      const name = fields[0];
      const price = parseFloat(fields[3]);
      const prevClose = parseFloat(fields[2]);
      const change = price - prevClose;
      const changePct = prevClose > 0 ? (change / prevClose * 100) : 0;
      const open = parseFloat(fields[1]);
      const high = parseFloat(fields[4]);
      const low = parseFloat(fields[5]);
      const volume = parseFloat(fields[8]) + parseFloat(fields[9]); // 简化：买卖一量
      const amount = parseFloat(fields[10]);
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
    return { stocks, updated: new Date().toLocaleString('zh-CN') };
  } catch (e) {
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

  ipcMain.handle('config:set', (_e, data) => {
    configStore.setAll(data);
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
}


module.exports = { registerDataHandlers, getWeather, getStocks, getNews, getIpLocation, getHotSearch, getSysMonitor };
