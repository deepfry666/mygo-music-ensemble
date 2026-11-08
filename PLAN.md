# 规划：Duet（二重奏）与 Ferry（渡）

仓库 Ensemble（合奏）。Duet 是网易云 + Spotify 的双平台插件；Ferry 是歌单同步，做在 Duet 里面。

> 状态：第 1 阶段（网易云）已在 app 里试过；第 2 阶段（Spotify）代码完成，用模拟接口测过，还没连真实的 Spotify 账号试。基于 egoist/mygo-music 0.1.20（2026-11-07）。
>
> 已定：许可证 AGPL-3.0-or-later；Spotify 写操作走官方 API，读推荐走网页接口（可选）；Spotify 的歌默认用网易云音频播放；同步做进这个插件。

## 目标

1. **双平台插件**：一个插件里同时登录网易云和 Spotify，两边的歌单、推荐、喜欢的歌各自保留、并排显示，不合并、不去重。想听哪边就点哪边，不用在 app 里切换音源。
2. **歌单同步**：先做网易云 → Spotify，支持手动和自动两种方式。

不是目标：把全网曲库合成一个、同一首歌只显示一次的那种“聚合”。

## 已确认的技术事实

| 事实 | 影响 |
|---|---|
| 插件之间完全隔离：登录、存储都不共享，插件也不能互相调用 | 同步功能做进双平台插件最省事，单独做插件就得再登录一遍 |
| 一个插件只能选一种 `playback`：`stream`（app 播放）或 `remote`（遥控外部设备） | 网易云适合 `stream`；Spotify 原声只能走 Connect，也就是 `remote`。已提 [egoist/mygo-music#75](https://github.com/egoist/mygo-music/issues/75) 按歌曲选择，等作者确认 |
| `signIn` 有 5 分钟，其他调用只有 30 秒 | 两个平台的登录都要在 `signIn` 里完成；同步要在后台跑，进度存进 storage |
| `liked`、`playlists`、`home`、`search`、`stations` 都只有一个导出 | 两个平台的内容要在函数内部按 ID 前缀分发，内置页面会混放两边的内容 |
| app 的“添加到歌单”菜单列出插件所有 `mine` 歌单 | 在网易云的歌上可以直接选 Spotify 的歌单，跨平台添加用 app 自带菜单就能做 |
| 插件能 spawn ffmpeg，并用 `-listen` 在 127.0.0.1 上提供音频（MyGotify 已经这么做） | 理论上可以把外部来源的音频喂给 app |
| Spotify 官方 Web API 的开发模式有限制：别人的歌单（包括官方的 Made For You）读不到歌，没有推荐和电台 | 想要 Spotify 的每日推荐，就得用网页版的私有接口（cookie 登录，参考 MyGotify） |

## 双平台插件设计

**播放方式：`stream`**
- 网易云的歌：直接用网易云的播放地址。
- Spotify 的歌：默认按歌名、歌手、时长匹配到网易云，再用网易云的音频播放，匹配结果缓存。
- 音源优先级做成设置项。以后可以再加 YouTube Music 兜底。
- Spotify 原声：作为实验项。做法是 librespot 用 pipe 后端输出，再经 ffmpeg -listen 提供给 app。这条路脆弱：不能拖进度，部分账号会被拒（librespot#1649），所以不放进第一版。

**ID 规则**：`ne:<id>` 表示网易云，`sp:<id>` 表示 Spotify。所有导出函数都按前缀分发到对应平台。

**侧边栏**
- 先列网易云：每日推荐、私人 FM、排行榜、播客等；最后是 Spotify 页（Made For You 等，需私有接口）
- 首页只放网易云的内容
- 歌单同步
- 两边歌单都进侧边栏的歌单区，名字保持各平台原样，网易云的在前、Spotify 的在后；Spotify 的喜欢叫“已点赞的歌曲”

**各项功能**
- **搜索**：默认两边都搜、分段显示，支持 `sp:`、`ne:` 前缀只搜一边。
- **喜欢、加歌单**：按 ID 前缀写回对应平台；跨平台时先匹配，再写入。
- **歌词**：网易云的歌词（带翻译）两边通用，Spotify 的歌用匹配到的网易云歌词。
- **评论**：网易云评论；Spotify 的歌显示匹配到的那首网易云歌的评论。
- **账号**：一次 `signIn` 先扫网易云二维码，再登录 Spotify；已登录的一方跳过。`account` 显示两边昵称。

## 歌单同步

- 方向：网易云 → Spotify（第一版）。
- 手动：打开歌单的同步页，点“立即同步”。
- 自动：歌单加入自动同步列表，设置里填间隔（分钟）。插件运行时用定时器检查，有新增就补过去。
- 第一次同步在 Spotify 建同名歌单，之后增量补歌，不重复建歌单。
- 匹配不上的歌记进“同步记录”页。
- 代码放在 `packages/ferry`，以后想单独发布成插件也方便。

## 仓库结构

```
packages/
  netease-api/   eapi 加密、扫码登录、搜索、歌单、歌词、播放地址、评论
  spotify-api/   登录（官方 OAuth 和/或网页 cookie）、token 刷新、搜索、歌单读写
  match/         跨平台歌曲匹配与缓存
  ferry/         Ferry：同步任务、增量、记录
plugins/
  duet/          Duet 双平台插件（plugin.json + src/index.ts）
scripts/build.ts bun build 打成单文件 → dist/<插件>/
```

## 复用清单（2026-11-07 查的许可证）

本仓库采用 **AGPL-3.0-or-later**，和 MyGo Music 本体一致。这样 AGPL 和 MIT 的代码都能合法复用：保留原版权声明，在 NOTICE 里注明出处。没有许可证的代码按“保留所有权利”处理，只参考思路，代码自己写。

| 模块 | 来源 | 许可证 | 怎么用 |
|---|---|---|---|
| 网易云全部功能（eapi、扫码和网页登录、搜索、歌单、每日推荐、FM、心动模式、歌词、评论、播客、音质） | [AkinoKaede/mygo-music-netease-cloud-music](https://github.com/AkinoKaede/mygo-music-netease-cloud-music) | AGPL-3.0 | **作为网易云部分的底座**：TypeScript、按模块拆分、带测试，ID 改成加 `ne:` 前缀 |
| 网易云补充（私人雷达、熟悉的歌、新发现等） | [sogud/mygo-music-netease](https://github.com/sogud/mygo-music-netease) | AGPL-3.0 | 按需搬几个功能过来 |
| 构建（esbuild 打成单文件、打包 zip） | AkinoKaede 的 `scripts/` | AGPL-3.0 | 改成 monorepo 多入口 |
| Spotify 网页接口（sp_dc、TOTP、token、Pathfinder GraphQL、Made For You） | [r0k1s-i/mygotify](https://github.com/r0k1s-i/mygotify)（它又移植自 spotube-plugin-spotify） | AGPL-3.0 | 读 Spotify 的推荐和别人的歌单 |
| 跨平台歌曲匹配打分 | mygotify 的 `scoreCandidate` | AGPL-3.0 | 改成匹配网易云和 Spotify |
| YouTube Music 兜底音源（ffmpeg -listen） | mygotify | AGPL-3.0 | 第 4 阶段可选 |
| Spotify 官方 OAuth（PKCE）和 Web API（建歌单、加歌） | xingkaixin/mygo-music-spotify | **无许可证** | 只参考流程，自己写，大约 150 行 |
| 其他网易云插件（hubandad、AsperaUlt） | | MIT | 备用参考 |

## 阶段

0. **技术验证**：网易云扫码登录和播放；Spotify 网页 cookie 读歌单和 Made For You；Spotify 写歌单走哪条接口；app 里歌单名、搜索分段的显示效果。
1. 网易云部分完整可用。
2. Spotify 曲库 + 匹配到网易云播放 + 歌词、评论。
3. 同步：网易云 → Spotify，手动 + 自动。
4. 可选：YouTube Music 兜底、Spotify 原声实验、Spotify → 网易云反向同步。

## 待决定

- [x] 仓库许可证用 AGPL-3.0-or-later
- [x] Spotify 读取方式：写操作走官方 API，读推荐走网页接口（可选）
- [x] Spotify 的歌默认用网易云音频播放（网易云有没有黑胶 VIP 还没确认）
- [x] 同步做进双平台插件

## 参考

- egoist/mygo-music：README 的 Plugins 一节、examples/demo-plugin、internal/music/music.go
- hubandad/mygo-music-netease（MIT）：网易云接口
- xingkaixin/mygo-music-spotify：Spotify 官方 API、PKCE 登录、开发模式的限制
- r0k1s-i/mygotify（AGPL）：Spotify 网页接口、匹配后换音源播放、ffmpeg -listen。只借鉴思路，不照搬代码
