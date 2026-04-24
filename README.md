# TimeStamp

现代化离线秒表计时器（Electron 桌面应用）。黑金配色，支持分组管理、历史记录与完整的主题自定义。

## 功能

- **高精度计时**：毫秒级显示，`requestAnimationFrame` 平滑刷新
- **计次（Lap）**：记录分段时间，自动标记最快 / 最慢
- **分组管理**：按用途（学习、训练、工作等）分组保存会话
- **历史记录**：所有会话本地持久化，关闭后再打开仍可查看
- **主题自定义**：5 套预设（黑金 / 午夜蓝 / 森林绿 / 玫瑰粉 / 象牙白），也可手动调节强调色 / 背景色 / 卡片色 / 文字色
- **键盘快捷键**：
  - `A` 开始 / 暂停
  - `S` 计次
  - `C` 复位
  - `Enter` 保存当前会话
- **完全离线**：无需网络；数据保存在本地 `userData` 目录
- **无边框现代 UI**：自定义标题栏 + 渐变光效 + 毛玻璃弹层

## 运行

需要 Node.js 18+（推荐 20+）。

```bash
npm install
npm start
```

## 打包

```bash
npm run dist
```

产物在 `dist/` 下（Windows 默认输出 NSIS 安装包）。

## 数据存储位置

会话与设置保存为单个 JSON 文件：

- Windows: `%APPDATA%/TimeStamp/timestamp-data.json`
- macOS:  `~/Library/Application Support/TimeStamp/timestamp-data.json`
- Linux:  `~/.config/TimeStamp/timestamp-data.json`

如需清空所有记录，直接删除该文件即可。

## 目录结构

```
TimeStamp/
├── package.json        应用与打包配置
├── main.js             Electron 主进程（窗口 / IPC / 持久化）
├── preload.js          安全桥接脚本
├── src/
│   ├── index.html      界面结构
│   ├── styles.css      黑金主题与主题变量
│   └── renderer.js     计时逻辑 / 分组 / 历史 / 主题
└── README.md
```

## 技术栈

- Electron 33（contextIsolation + preload，无 `nodeIntegration`）
- 原生 HTML / CSS / JS（零运行时依赖，启动快、体积小）
- 文件系统持久化（`fs` + `app.getPath('userData')`）
