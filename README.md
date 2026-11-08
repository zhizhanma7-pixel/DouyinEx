# DouyinEx

面向抖音网页直播的 Tampermonkey 增强脚本。

CP-01 提供脚本构建、页面生命周期和安全模式。进入直播入口或在数字房间之间切换时，脚本会为对应页面管理增强功能的启动与清理。当前功能注册表为空，原生页面与播放器保持原样。

## 开发工作流

- [CHECKPOINTS.md](CHECKPOINTS.md) 记录 CP-00 至 CP-09 的实施顺序、依赖和验收条件。
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

## 验证状态

CP-00 的澳洲目标网络播放测试与 CP-01 的 Edge、Chrome 实机安装验收均待执行。模拟页面覆盖路由切换、退出清理、安全模式与脚本重复注入。见 [CP-01 验收记录](docs/CP-01-scaffold.md)。

## 许可证

项目使用 [MIT](LICENSE)。脚本未复用参考项目的代码或资源。esbuild、ESLint 和 jsdom 使用 MIT，TypeScript 使用 Apache-2.0。这些工具和传递依赖用于构建与测试，安装包只包含本项目代码及其许可证。重新分发开发依赖时需保留各依赖所要求的许可证和声明。
