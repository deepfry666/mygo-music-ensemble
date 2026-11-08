# Ensemble · 合奏

一组 [MyGo Music](https://github.com/egoist/mygo-music) 插件。

| 插件 | 中文名 | 是什么 | 状态 |
|---|---|---|---|
| **Duet** | 二重奏 | 一个插件里同时用网易云音乐和 Spotify。两边的歌单、推荐、喜欢的歌并排放着，不合并，想听哪边就点哪边，不用切换音源 | 网易云和 Spotify 都已接入（0.2.2） |
| **Ferry** | 渡 | 把歌单摆渡到另一个平台，先做网易云 → Spotify，支持手动和自动同步。作为 Duet 的一部分，和它共用登录 | 计划中 |

进度和设计见 [PLAN.md](PLAN.md)。

## 安装 Duet

需要 MyGo Music 0.1.20 或更新的版本。

- 一键安装：[mygo-music://install-plugin?repo=deepfry666/mygo-music-ensemble](mygo-music://install-plugin?repo=deepfry666/mygo-music-ensemble)
- 或者在 MyGo Music 的 设置 > 插件 > + 里粘贴仓库地址：`https://github.com/deepfry666/mygo-music-ensemble`

app 会下载最新 Release 里的 `duet.zip`，安装前会先征得你的同意。装好后，在音源里选 **二重奏**，点 **登录**，用网易云音乐 App 扫码。

### 连接 Spotify

Spotify 只能通过它的官方 API 接入，需要你自己建一个开发者 App：

1. 用 Premium 账号登录 [Spotify 开发者后台](https://developer.spotify.com/dashboard)，点 **Create app**。名称和描述随便填，Redirect URI 填 `http://127.0.0.1:43110/callback`（必须一字不差），勾选 **Web API**，保存。
2. 复制这个 App 的 **Client ID**，粘贴到 MyGo Music 里 二重奏 插件设置的 **Spotify Client ID** 一栏。填好后浏览器会自动打开 Spotify 授权页，点同意即可。
3. 浏览器没打开，或者被你关掉了？点左下角的账号 → **我的主页**，那里能看到网易云和 Spotify 两边的登录状态，点 **连接 Spotify** 会重新打开授权页。退出 Spotify 也在这里，不影响网易云的登录。

开发模式的 App 只允许创建者本人，以及在后台 User Management 里加进去的账号（最多 5 个）登录。

### 用起来是什么样

- **歌单**：两边的歌单都在侧边栏的歌单区，名字保持各自平台上的原样，网易云的排在前面、Spotify 的排在后面。Spotify 的“已点赞的歌曲”也是其中一个歌单。
- **首页和侧边栏**：首页只放网易云的内容；侧边栏先列网易云的入口，最后是 Spotify 页。
- **播放**：Spotify 的 API 不提供音频，所以 Spotify 的歌会先在网易云上找到同一首（按歌名、歌手、时长匹配，避开翻唱、Live、伴奏），再用网易云的音源播放，歌词和评论也用网易云的。网易云上没有的歌，会提示无法播放。
- **跨平台加歌**：在网易云的歌上点“添加到歌单”，可以直接选 Spotify 的歌单，反过来也一样。找不到对应歌曲的会跳过，并提示有几首没加上。
- **搜索**：同时搜两边，网易云的结果在前。查询前面加 `sp:` 只搜 Spotify，加 `ne:` 只搜网易云。
- **Spotify 页**：最近播放、常听的歌和艺人、收藏的专辑、你的歌单。

Spotify 开发模式的限制：只能打开你自己创建或参与协作的歌单，看不到 Spotify 官方推荐歌单，搜索每页最多 10 条，也不能关注艺人。

## 从源码构建

需要 Node 24+ 和 pnpm。

```bash
pnpm install
pnpm build
```

构建结果在 `dist/duet/`。要装本地构建的版本：在 MyGo Music 里打开 设置 > 插件 > +，选“从这台电脑的文件夹安装”，选这个文件夹。

## 发布新版本

1. 改 `package.json` 和 `plugins/duet/plugin.json` 里的版本号，两处保持一致。
2. 运行 `pnpm package`：会先跑全部测试，再打出 `dist/release/duet.zip`。
3. 提交并推送，然后发 Release：

```bash
gh release create v<版本号> dist/release/duet.zip --title "Duet <版本号>"
```

不要发成 prerelease：app 只认 GitHub 的“latest”正式版，prerelease 不算。

## 测试

```bash
pnpm test
```

会跑这几组测试：
- 上游网易云插件自带的 59 个测试，跑在 `dist/netease` 上。
- Duet 的测试，跑在 `dist/duet` 上：ID 前缀、存储隔离，以及用模拟的 Spotify 接口测登录（PKCE）、token 刷新、歌单、匹配播放、跨平台加歌和搜索。
- 歌曲匹配和 SHA-256 的单元测试。

## 结构

```
packages/core/      多平台的 ID 前缀（ne: / sp:）和按 ID 分发调用
packages/netease/   网易云（源自 AkinoKaede/mygo-music-netease-cloud-music，见 NOTICE.md）
packages/spotify/   Spotify 官方 Web API：PKCE 登录、曲库读写
packages/match/     跨平台歌曲匹配
plugins/duet/       Duet 的入口、plugin.json、翻译
scripts/build.ts    用 esbuild 打成 MyGo 能直接加载的单个文件
```

## 许可证

AGPL-3.0-or-later，第三方代码的来源见 [NOTICE.md](NOTICE.md)。本项目与网易、Spotify 无关，用到的是非公开接口，随时可能失效。
