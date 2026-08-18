# 代码签名指南（Windows / macOS）

> 目标：消除 SmartScreen「未知发布者」警告（Windows）与 Gatekeeper 拦截（macOS）。
> 状态：**配置钩子已就绪，证书需自行购买后按本文接入。**

## 为什么需要

未签名exe：用户下载后 SmartScreen 弹蓝色警告「Windows 已保护你的电脑」，转化率损失严重。
未签名dmg：macOS 首次打开需右键→打开，Gatekeeper 黄色警告。

## Windows 方案（二选一）

### 方案 A：Azure Trusted Signing（推荐，~$9.99/月）

1. 拥有一个组织验证的 Azure 账号（个人开发者也可申请，审核 1-3 天）
2. Azure 门户创建 **Trusted Signing** 资源 + 证书配置文件 + 身份验证器
3. electron-builder 已内置支持（v26），在 `package.json` 的 `build.win` 加：

```json
"win": {
  "azureSignOptions": {
    "publisher": "<你的证书主体名>",
    "endpoint": "https://eus.codesigning.azure.net/",
    "correlationId": "...",
    "identityValidationId": "..."
  }
}
```

凭据走环境变量：`AZURE_TENANT_ID` / `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET`。

### 方案 B：OV/EV 代码签名证书（一次性年费）

- OV（~$200-400/年，Sectigo/SSL.com）：签名后信誉积累几天到几周
- EV（~$300-700/年）：**即时** SmartScreen 信誉（大厂推荐）

接入（环境变量，零代码改动）：

```bash
# CSC_LINK = 证书base64（或 .pfx 路径），CSC_KEY_PASSWORD = 密码
export CSC_LINK=/path/to/cert.pfx
export CSC_KEY_PASSWORD=xxxx
npx electron-builder --win    # electron-builder 自动检测并签名
```

## macOS 方案

需 Apple Developer 账号（$99/年）：

```bash
export CSC_NAME="Developer ID Application: YOUR NAME (TEAM_ID)"   # 钥匙串中的证书名
export APPLE_ID=you@example.com    # 公证用
export APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
export APPLE_TEAM_ID=XXXXXXXXXX
npx electron-builder --mac   # 自动签名 + 公证（entitlements 已配好 build/entitlements.mac.plist）
```

CI（GitHub Actions）：secrets 存上述变量，`.github/workflows/build-mac.yml` 已有雏形。

## 优先级建议

1. 先发未签名版本积累种子用户（右键安装的说明写进 README）
2. 用户量起来后买 **Azure Trusted Signing**（月付门槛最低）
3. macOS 在有 Mac 分发需求时再办 Apple Developer
