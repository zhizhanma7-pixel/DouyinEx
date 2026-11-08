# DouyinEx

面向抖音网页直播的 Tampermonkey 增强脚本。

DouyinEx 在直播首页和数字房间提供悬浮设置入口。面板包含播放、弹幕、页面清理、多媒体、高级和诊断六组。当前可开启紧凑面板，并在直播间查看页面是否存在视频元素。计划中的功能会显示状态，暂时不可切换。

## 开发工作流

- 开发以 GitHub 默认分支的 [CHECKPOINTS.md](CHECKPOINTS.md) 为准。该文件记录 CP-00 至 CP-09 的实施顺序、依赖和验收条件。
- **CP-05.1 弹幕 +1**计划支持手动选取弹幕并发送，以及草稿回退。
- **CP-05.2 弹幕前缀和后缀**计划支持小尾巴，兼容 Enter、发送按钮和 +1。

## 构建和试装

使用 Node.js 24 和 pnpm 11.25.0。

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm build:dev
```

- `pnpm check` 依次执行 lint、类型检查、模拟页面测试和正式构建。产物是 `dist/douyinex.user.js`，也可从通过检查的 GitHub Actions 运行下载。
- `pnpm build:dev` 生成带内联源码映射的 `dist/douyinex.dev.user.js`。
- 在 Tampermonkey 中新建脚本，将正式产物的全部内容粘贴进去并保存，然后刷新抖音直播网页。在 Tampermonkey 菜单中可以开启或关闭 DouyinEx 安全模式。切换立即作用于当前标签页，刷新后保留。

## 使用设置面板

- 点击悬浮的 **DouyinEx** 按钮打开设置。键盘可用 Tab 和 Enter 操作，Esc 关闭并将焦点返回入口。
- 可用开关默认关闭，修改立即生效，换房和刷新后保留。展开 **高级 → 导入、导出与恢复**，可通过文本框复制或粘贴偏好 JSON，也可恢复默认值。
- 遇到页面布局冲突时，可关闭面板，或从 Tampermonkey 菜单开启安全模式以移除悬浮入口并停用功能。

## 验证状态

CP-02 已在 Chrome、Edge 的模拟直播页验证。真实抖音房间中的 Tampermonkey 安装和布局验收仍待执行，CP-00 的目标网络播放验证也仍待执行。见 [CP-01 验收记录](docs/CP-01-scaffold.md) 和 [CP-02 验收记录](docs/CP-02-settings.md)。

## 许可证

项目使用 [MIT](LICENSE)。脚本未复用参考项目的代码或资源。esbuild、ESLint 和 jsdom 使用 MIT，TypeScript 使用 Apache-2.0。这些工具和传递依赖用于构建与测试，安装包只包含本项目代码及其许可证。重新分发开发依赖时需保留各依赖所要求的许可证和声明。
