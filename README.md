# Ensemble · 合奏

一组 [MyGo Music](https://github.com/egoist/mygo-music) 插件。

| 插件 | 中文名 | 是什么 | 状态 |
|---|---|---|---|
| **Duet** | 二重奏 | 一个插件里同时用网易云音乐和 Spotify。两边的歌单、推荐、喜欢的歌并排放着，不合并，想听哪边就点哪边，不用切换音源 | 网易云部分已完成，Spotify 接入中 |
| **Ferry** | 渡 | 把歌单摆渡到另一个平台，先做网易云 → Spotify，支持手动和自动同步。作为 Duet 的一部分，和它共用登录 | 计划中 |

进度和设计见 [PLAN.md](PLAN.md)。

## 构建和安装

需要 Node 24+ 和 pnpm。

```bash
pnpm install
pnpm build
```

构建结果在 `dist/duet/`。安装方法：在 MyGo Music 里打开 设置 > 插件 > +，选“从这台电脑的文件夹安装”，选这个文件夹。

## 测试

```bash
pnpm test
```

会跑两组测试：
- 上游网易云插件自带的 59 个测试，跑在 `dist/netease` 上。
- Duet 的测试，跑在 `dist/duet` 上：检查 ID 前缀、存储隔离和设置名。

## 结构

```
packages/core/      多平台的 ID 前缀（ne: / sp:）和按 ID 分发调用
packages/netease/   网易云（源自 AkinoKaede/mygo-music-netease-cloud-music，见 NOTICE.md）
plugins/duet/       Duet 的入口、plugin.json、翻译
scripts/build.ts    用 esbuild 打成 MyGo 能直接加载的单个文件
```

## 许可证

AGPL-3.0-or-later，第三方代码的来源见 [NOTICE.md](NOTICE.md)。本项目与网易、Spotify 无关，用到的是非公开接口，随时可能失效。
