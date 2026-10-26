# 自行部署

生产环境应使用域名和有效 HTTPS。GitHub 用于保存源码；现有账号 API 与 SQLite 需要运行在你控制的服务器上，不能由 GitHub Pages 独立提供。

## 开始前

- Node.js 22.23.2+ 或 24.x。
- 安装依赖、构建并通过 `npm test`。
- 使用独立系统用户运行应用，应用端口只监听 127.0.0.1。
- 数据放在程序目录以外，例如 /var/lib/museknot；更新程序时保留数据目录。
- 配置自己的域名、邀请码、数据路径，不要复制别人的服务器配置或数据库。

## 环境变量

| 变量 | 用途 |
|---|---|
| NODE_ENV | 生产设为 production，启用 Secure Cookie |
| MUSEKNOT_HOST | 建议 127.0.0.1 |
| PORT | 应用本机端口，例如 4173 |
| MUSEKNOT_ORIGIN | 对外网站源，例如 https://notes.example.com，不包含子路径 |
| MUSEKNOT_BASE_PATH | 空值或单层路径，例如 /museknot；不带末尾斜杠 |
| MUSEKNOT_DATA_DIR | SQLite 所在目录 |
| MUSEKNOT_BACKUP_DIR | 备份目录 |
| MUSEKNOT_INVITE_CODE | 自行生成随机值；留空关闭注册 |
| MUSEKNOT_TRUST_PROXY | 已由本机可信代理覆盖转发地址时可设 1 |

邀请码只用于注册。你可以在已登录账号中用已知邀请码生成邀请链接。恢复码只会在注册或重新生成时展示，请单独保存。不要把 .env、Cookie、恢复码或数据库提交到仓库。

## 启动与反向代理

构建后的 dist/、server.mjs、src/records.js 与 scripts/backup.mjs 需要在程序目录中。服务工作目录应指向该目录。将实际环境变量通过服务管理器注入，再运行 `node server.mjs`。

deploy/ 中提供 systemd 和 Nginx 示例，使用前替换域名、Node 路径和文件路径。示例不包含证书申请或防火墙自动修改，不应直接覆盖服务器上已有站点。

反向代理需保留公开 Host；应用会拒绝与 MUSEKNOT_ORIGIN 不匹配的 Host。配置 HTTPS 后，从外部浏览器验证网页和安装清单。不要绕过证书警告安装 PWA。

## 备份与恢复

在运行环境中设置 MUSEKNOT_DATA_DIR 和 MUSEKNOT_BACKUP_DIR 后执行：

```bash
node scripts/backup.mjs
```

脚本使用 SQLite 在线备份并执行 integrity_check，成功后打印新备份路径。备份仍是明文，应限制权限，异地保存时加密。数据目录与备份目录建议仅服务用户可读写。

恢复前先保留当前数据库，停止应用，确认目标与备份完整性，再由部署者选择恢复哪一份。不要在应用运行期间直接覆盖数据库；恢复数据与回退前端程序是两种不同操作。

## 更新

先备份，确认新版本对旧记录的兼容，再替换程序并验证。不要删除数据目录重新安装。Service Worker 不缓存私人数据或应用包，也不会自动刷新编辑中的页面。安装后的不同设备可能仍需分别登录。
