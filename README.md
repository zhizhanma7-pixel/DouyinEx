# DouyinEx

抖音网页直播增强脚本，适用于装有 Tampermonkey 的 Chrome 和 Edge。

**[下载最新版脚本](https://github.com/zhizhanma7-pixel/DouyinEx/releases/latest/download/douyinex.user.js)** · [发行说明](https://github.com/zhizhanma7-pixel/DouyinEx/releases/latest)

## 安装

1. 安装并启用 [Tampermonkey](https://www.tampermonkey.net/)。
2. 点击上方的脚本链接，在 Tampermonkey 中确认安装或更新。如果浏览器直接下载了文件，可在 Tampermonkey 中新建或编辑 DouyinEx，粘贴脚本全文并保存。
3. 刷新抖音直播页面，打开 **DouyinEx 设置**，按需启用功能。

已安装但看不到设置入口时，检查 Tampermonkey 中的脚本开关，以及浏览器的 **允许用户脚本** 权限。[Tampermonkey 权限说明](https://www.tampermonkey.net/faq.php?locale=en&q=Q209)

## 功能

- **弹幕 +1** 支持悬停暂停当前一条画面弹幕，点击 **+1** 直接发送，移开鼠标后继续滚动。右侧聊天列表也支持 **+1**。
- **弹幕管理** 支持关键词和重复内容过滤、小尾巴、统计和 TXT 导出。
- **播放器** 支持画质快捷切换、滚轮调音量、防误暂停、画中画和双房间视图。
- **直播间布局** 可按房间隐藏礼物栏和飘条等元素，并切换简洁、影院和深色布局。
- **截图与录制** 可在浏览器允许读取视频时保存 PNG 或最长 10 秒的 WebM。

功能默认关闭，偏好保存在本机。遇到页面冲突时，可从 Tampermonkey 菜单开启 **DouyinEx 安全模式**。

## 开发

使用 Node.js 24 和 pnpm 11.25.0。

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm verify-build
```

正式构建输出为 `dist/douyinex.user.js`，校验文件为 `dist/douyinex.user.js.sha256`。开发按 GitHub 默认分支的 [CHECKPOINTS.md](CHECKPOINTS.md) 执行。验证范围见 [CP-09 发布检查](docs/CP-09-release-check.md)。

## 许可证

[MIT](LICENSE)
