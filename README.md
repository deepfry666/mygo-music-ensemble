# 网易云 + Spotify · MyGo Music 插件

在 [MyGo Music](https://github.com/egoist/mygo-music) 的一个插件里，同时使用网易云音乐和 Spotify。两边的歌单、推荐、喜欢的歌并排放着，不合并，想听哪边就点哪边，不用切换音源。以后还会加上歌单同步（网易云 → Spotify）。

进度和设计见 [PLAN.md](PLAN.md)。目前完成第 1 阶段：网易云部分已经接入，Spotify 还没接。

## 构建和安装

需要 Node 24+ 和 pnpm。

```bash
pnpm install
pnpm build
```

构建结果在 `dist/netease-spotify/`。安装方法：在 MyGo Music 里打开 设置 > 插件 > +，选“从这台电脑的文件夹安装”，选这个文件夹。

## 测试

```bash
pnpm test
```

会跑两组测试：
- 上游网易云插件自带的 59 个测试，跑在 `dist/netease` 上。
- 双平台插件的测试，跑在 `dist/netease-spotify` 上：检查 ID 前缀、存储隔离和设置名。

## 结构

```
packages/core/       多平台的 ID 前缀（ne: / sp:）和按 ID 分发调用
packages/netease/    网易云（源自 AkinoKaede/mygo-music-netease-cloud-music，见 NOTICE.md）
plugins/netease-spotify/   插件入口、plugin.json、翻译
scripts/build.ts     用 esbuild 打成 MyGo 能直接加载的单个文件
```

## 许可证

AGPL-3.0-or-later，第三方代码的来源见 [NOTICE.md](NOTICE.md)。本项目与网易、Spotify 无关，用到的是非公开接口，随时可能失效。
