# 透明看板插件开发指南

## 快速开始

### 1. 创建插件目录

在 `plugins/` 下创建你的插件目录：

```
plugins/
└── my-plugin/
    ├── manifest.json    ← 插件描述（必需）
    ├── index.js         ← 插件逻辑（必需）
    └── style.css        ← 插件样式（可选）
```

### 2. 编写 manifest.json

```json
{
  "name": "my-plugin",              // 唯一标识（英文）
  "version": "1.0.0",
  "author": "你的名字",
  "displayName": "📊 我的组件",     // 显示名称
  "description": "组件描述",
  "area": "side",                   // "main"（主区大卡片）或 "side"（侧区小卡片）
  "defaultSize": { "w": 280, "h": 300 },
  "priority": 3,                    // 排列优先级（1最高，4最低）
  "permissions": ["network"],       // 声明权限：network（网络）、storage（存储）
  "refreshInterval": 300,           // 数据刷新间隔（秒）
  "entry": "index.js"               // 入口文件
}
```

### 3. 编写 index.js

```javascript
class MyPlugin {
  // 初始化（SDK 提供 store/fetch/open/onRefresh）
  async init(sdk) {
    this.sdk = sdk;
    // 注册定时刷新
    sdk.onRefresh(() => this.update(), 300);
  }

  // 获取数据（异步）
  async update() {
    const text = await this.sdk.fetch('https://api.example.com/data');
    return JSON.parse(text);
  }

  // 渲染 HTML
  render(data) {
    return `
      <div class="my-plugin">
        <div class="my-plugin__header">📊 我的组件</div>
        <div class="my-plugin__content">${data.value}</div>
      </div>
    `;
  }

  // 绑定交互事件（可选）
  bindEvents(container) {
    container.querySelectorAll('.my-plugin__item').forEach(el => {
      el.addEventListener('click', () => {
        this.sdk.open('https://example.com');
      });
    });
  }
}

// 注册插件（必须）
if (typeof PluginRegistry !== 'undefined') {
  PluginRegistry.register('my-plugin', MyPlugin);
}
```

### 4. SDK API 参考

| 方法 | 说明 |
|------|------|
| `sdk.store.get(key)` | 读取插件专属配置 |
| `sdk.store.set(key, value)` | 保存插件专属配置 |
| `sdk.fetch(url, options?)` | HTTP 请求（返回文本） |
| `sdk.open(url)` | 用默认浏览器打开链接 |
| `sdk.onRefresh(fn, intervalSec)` | 注册定时刷新 |
| `sdk.getTheme()` | 获取当前主题信息 |

### 5. 重要规则

- **可点击元素**必须加 `no-drag` class（否则穿透模式下点不到）
- **CSS 类名**用 `你的插件名__元素名` 格式（如 `my-plugin__header`），避免冲突
- **不要直接操作全局 Store**（用 `sdk.store` 读写插件专属配置）
- **数据请求**用 `sdk.fetch`（不用原生 fetch，SDK 会做错误处理）

## 发布插件

1. 把插件目录提交到你的 GitHub
2. 在 [awesome-dashboard-plugins](https://github.com/dgr1771/transparent-desktop-dashboard) 提 Issue 推荐你的插件
3. 用户下载后放到 `plugins/` 目录即可自动加载
