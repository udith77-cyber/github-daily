# 每天北京时间 8:00 自动运行 uploadBase64.js

## 包内文件

- `uploadBase64.js` —— 你的脚本（已加固：网络请求带超时，失败时返回非零退出码）
- `.github/workflows/daily.yml` —— 定时任务配置
- `README.md` —— 本说明

## 使用步骤（5 分钟）

1. 在 GitHub 新建一个仓库，建议选 **Private**（脚本里有密钥和接口地址），不要勾选 "Add a README"。
2. 解压本压缩包，把里面的文件原样放进仓库目录（保持 `.github/workflows/daily.yml` 的路径不变）。
3. 提交并 push 到默认分支（一般是 `main`）：
   ```bash
   git init
   git add .
   git commit -m "init"
   git branch -M main
   git remote add origin <你的仓库地址>
   git push -u origin main
   ```
4. 打开仓库的 **Actions** 标签页，点左侧 "每日 8 点运行" → **Run workflow** 手动跑一次，确认绿色通过。
5. 之后每天北京时间 8:00 自动运行，生成的订阅链接会提交回仓库根目录的 `clash_subscribe_link.txt`。

## 改运行时间

编辑 `.github/workflows/daily.yml` 里的 `cron`，注意 GitHub 一律用 **UTC** 时间：北京时间减 8 小时。

| 想要的时间（北京时间） | cron 写法 |
|---|---|
| 每天 8:00 | `0 0 * * *` |
| 每天 12:00 | `0 4 * * *` |
| 每天 20:30 | `30 12 * * *` |

## 已知的两个限制（GitHub 平台层面的）

1. 定时任务高峰期可能延迟几分钟，不保证精确到秒到 8:00。
2. 仓库 60 天没有任何提交活动时，GitHub 会自动停用定时任务——本工作流每天会提交订阅链接，所以天然保持活跃，不用担心。

## 和原版脚本的差别

- `fetchApiBase()`：15 秒超时后自动用备用地址，原版会无限挂起。
- `post()`：20 秒超时后直接报错，原版会无限挂起。
- 登录 / 拉取 / 生成失败时退出码为 1，Actions 会标红，方便发现异常；原版静默退出，失败了也显示成功。
- 逻辑、密钥、接口地址均未改动。
