# YApi 接口管理平台（现代化开发版本）

上海营联信息技术有限公司维护的 YApi 开源版本，提供接口文档管理、Mock、运行调试、自动化测试和文档协作能力。

**目录**

1. [公司与项目介绍](#1-公司与项目介绍)
   - [公司与维护主体](#公司与维护主体)
   - [项目定位与核心能力](#项目定位与核心能力)
   - [上游归属与许可证](#上游归属与许可证)
   - [上游介绍与生态资料](#上游介绍与生态资料)
2. [本版本修改部分](#2-本版本修改部分)
   - [版本基线](#版本基线)
   - [主要升级与修复](#主要升级与修复)
   - [运行环境与启动](#运行环境与启动)
   - [配置自己的 LLM](#配置自己的-llm)
   - [只读 MCP 接入](#只读-mcp-接入)
   - [验证范围与已知限制](#验证范围与已知限制)
3. [升级迁移说明](#3-升级迁移说明)
   - [从旧版 MongoDB 3.6.23 / YApi fd90 迁移](#从旧版-mongodb-3623--yapi-fd90-迁移)
   - [脚本与外部集成迁移](#脚本与外部集成迁移)
   - [迁移参考资料](#迁移参考资料)

## 1. 公司与项目介绍

### 公司与维护主体

**上海营联信息技术有限公司**负责本仓库的开源维护，在上游 YApi 的基础上持续改进接口管理和使用体验。本仓库为 [kyan54/yapi](https://github.com/kyan54/yapi)，本版本的功能调整、运行要求与迁移边界见下文。

### 项目定位与核心能力

YApi 是面向开发、产品和测试人员的可视化接口管理平台，用于创建、发布、维护和协作管理 API。

![YApi 接口管理流程](yapi-base-flow.jpg)

- **接口文档与协作：**管理接口、分类、参数和 Schema，通过项目及分组权限组织协作。
- **Mock：**基于 JSON5、Mock.js 定义返回数据，支持按请求规则返回期望数据。
- **运行调试与自动化测试：**调试接口请求、组织测试集合，并对响应进行断言。
- **数据导入与扩展：**支持 Postman、HAR、Swagger 数据导入，保留 Swagger 同步及插件入口。
- **内网部署：**支持自托管；数据安全仍取决于部署配置、权限与外部集成。

### 上游归属与许可证

本项目基于 [YMFE/yapi](https://github.com/YMFE/yapi) 开源项目继续维护，保留上游贡献者归属。许可证为 [Apache License 2.0](LICENSE)，原始版权声明为 `Copyright 2017, The YMFE Team.`；本仓库的维护与修改不改变该声明。

上游 README 列出的作者：

* [hellosean1025](https://github.com/hellosean1025)
* [gaoxiaomumu](https://github.com/gaoxiaomumu)
* [zwjamnsss](https://github.com/amnsss)
* [dwb1994](https://github.com/dwb1994)
* [fungezi](https://github.com/fungezi)
* [ariesly15](https://github.com/ariesly15)

### 上游介绍与生态资料

以下为上游 README 留存的历史资料。第三方服务、教程、插件和镜像不代表本版本已验证或推荐的部署方式；使用本版本请以第二、三部分为准。

- [上游文档](https://hellosean1025.github.io/yapi)
- [上游历史体验地址](http://yapi.smart-xwork.cn/)（2026-10-04 链接检查返回 HTTP 401，未验证体验流程）
- 上游 README 留存的 QQ 群号：644642474、941802405；当前开放状态未核验。

<details>
<summary>展开上游教程、插件、代码生成与工具资料</summary>

#### 教程

* [使用 YApi 管理 API 文档，测试， mock](https://juejin.im/post/5acc879f6fb9a028c42e8822)
* [自动更新 Swagger 接口数据到 YApi 平台](https://juejin.im/post/5af500e251882567096140dd)
* [自动化测试](https://juejin.im/post/5a388892f265da430e4f4681)
* [GTest(基于YApi)接口研发效能提升10倍 实战](https://mp.weixin.qq.com/s/z66f7bRX8aAOppAtBIB7Uw)（2026-10-04 检查跳转至验证码页，正文未核验）

#### YApi 插件

* [yapi sso 登录插件](https://github.com/YMFE/yapi-plugin-qsso)
* [yapi cas 登录插件](https://github.com/wsfe/yapi-plugin-cas) By wsfe
* [yapi gitlab集成插件](https://github.com/cyj0122/yapi-plugin-gitlab)
* [oauth2.0登录](https://github.com/xwxsee2014/yapi-plugin-oauth2)
* [rap平台数据导入](https://github.com/wxxcarl/yapi-plugin-import-rap)
* [dingding](https://github.com/zgs225/yapi-plugin-dding) 钉钉机器人推送插件
* [export-docx-data](https://github.com/inceptiongt/Yapi-plugin-export-docx-data) 数据导出docx文档
* [interface-oauth-token](https://github.com/shouldnotappearcalm/yapi-plugin-interface-oauth2-token) 定时自动获取鉴权token的插件
* [import-swagger-customize](https://github.com/follow-my-heart/yapi-plugin-import-swagger-customize) 导入指定swagger接口

#### 代码生成

* [yapi-to-typescript：根据 YApi 的接口定义生成 TypeScript 的请求函数](https://github.com/fjc0k/yapi-to-typescript)
* [yapi-gen-js-code: 根据 YApi 的接口定义生成 javascript 的请求函数](https://github.com/hellosean1025/yapi-gen-js-code)
* [SwiftJSONModeler:根据 YApi 的接口生成 Swift 模型代码](https://github.com/CodeOcenS/SwiftJSONModeler)

#### 历史 Docker 部署资料（非官方）

* [使用 alpine 版 docker 镜像快速部署 yapi](https://www.jianshu.com/p/a97d2efb23c5)
* [docker-yapi: 基于官方yapi-cli的docker-compose方案](https://github.com/Ryan-Miao/docker-yapi)
* [docker-compose一键部署yapi](https://github.com/jinfeijie/yapi)
* [docker-YApi: 更易用的 YApi 镜像](https://github.com/fjc0k/docker-YApi)
* [使用DockerCompose构建部署Yapi](https://github.com/MyHerux/daily-code/blob/master/Program/%E5%B7%A5%E5%85%B7%E7%AF%87/Yapi/%E4%BD%BF%E7%94%A8DockerCompose%E6%9E%84%E5%BB%BA%E9%83%A8%E7%BD%B2Yapi.md)
* [yapi-docker: dockerized yapi deployment all in one](https://github.com/williamlsh/yapi-docker)

#### YApi 一些工具

* [Api Generator](https://github.com/Forgus/api-generator) 接口文档自动生成插件（零入侵）
* [mysql服务http工具,可配合做自动化测试](https://github.com/hellosean1025/http-mysql-server)
* [idea 一键上传接口到yapi插件](https://github.com/diwand/YapiIdeaUploadPlugin)
* [idea 接口上传调试插件 easy-yapi](https://easyyapi.com/)（2026-10-04 链接检查返回 HTTP 404）
* [执行 postgres sql 的服务](https://github.com/shouldnotappearcalm/http-postgres-server)
* [SpringBoot依赖自动生成YApi](https://github.com/NoBugBoy/YDoc)
* [Yapi X 一键生成接口文档, 上传到yapi, rap2, eolinker等（IDEA插件）](https://github.com/jetplugins/yapix)

</details>

## 2. 本版本修改部分

### 版本基线

本版本在旧版 `fd90eaf108c0382db133a6650e368e5d7d38734a` 基础上升级，保留接口管理、Mock、运行调试、自动化测试、Swagger 导入/同步和插件入口。此前功能基线为 `90d3245`；本轮在已合并的 `fd5bad8` 基础上修复 Swagger 自动同步撤权边界并重整说明。这是待按实际部署环境验收的开发版本，不代表旧插件、真实生产数据和外部身份服务全部兼容；不要使用旧版 `yapi-cli update` 覆盖本版本。

<a id="本轮主要升级与修复"></a>

### 主要升级与修复

- **请求方式与浏览器插件：**接口运行页和测试集合页提供“请求方式”开关，支持服务端代发和浏览器直接请求。浏览器模式不再依赖 `cross-request` 插件，已移除强制安装提示，但目标接口需要支持 CORS；服务端模式由 YApi 后端代理请求，适合跨域或需从服务器网络访问目标接口的场景。
- **默认请求头：**新建接口时缺少 `Content-Type` 会补充 `application/json`，编辑页也预置该默认请求头；表单等请求按实际类型处理。
- **运行栈与静态资源：**升级到 Node.js 24、React 19、Ant Design 6、React Router 7、Webpack 5，以及 Mongoose 9 / MongoDB driver 7；修复静态资源返回类型异常导致页面下载或样式丢失的问题。本地无认证 Mongo 启动验证不代表生产认证配置已验收。
- **接口编辑：**保留历史富文本备注与原始 Schema；修复未保存草稿、异步校验与切换接口时的状态串用。Schema 弹窗关闭、规范化 Apply 回传后恢复焦点；进入编辑不再自动聚焦备注并滚到页面下方。详情页标签间距恢复旧版习惯。
- **项目设置：**阻止保存中的重复提交，明确展示业务失败和网络失败；切换项目后忽略旧请求结果，避免旧数据覆盖新页面。
- **运行、Mock 与测试集合：**修复请求初始化、环境/变量选择、集合与用例切换、克隆及保存的并发状态；恢复脚本开关语义，缺失前置用例输出明确失败。Mock、自动化测试及 Swagger 界面保留。
- **权限与数据一致性：**补强接口编辑租约、集合用例、日志及用户管理的权限边界；保留数字 ID、计数器及关联关系。文档建议以版本比较保护并发修改，已成功保存但后续读取失败时不会重复提交。
- **AI 文档：**发送前审查、生成建议、差异预览、人工采纳、历史分页与恢复为新版本。只改文档及参数/Schema 描述注释，不允许模型修改路径、方法、类型或必填约束。
- **Swagger 自动同步：**每次分类、basepath 和接口写请求前，重新校验任务所有者当前编辑权限及任务配置快照；成员撤权、账号删除、任务停用或替换后停止后续请求。普通模式的 token/业务失败明确上报，不再错误推进同步 hash；缺失 token 不会自动创建。
- **脚本与集成：**服务端脚本改用独立容器 runner，新增只读 MCP。LDAP/SSO 接口保留，真实配置和自定义插件仍需单独验证。

### 运行环境与启动

| 项目 | 当前实现/验证目标 |
| --- | --- |
| Node / npm | Node 24；package.json 要求 Node >=24、npm >=10 |
| 数据库 | Mongoose 9 / MongoDB driver 7；CI 与本机合成演示使用 MongoDB 9.0.2，不能连接 MongoDB 3.6 |
| 前端 | React 19、Ant Design 6、React Router 7、Webpack 5 |
| 构建架构 | CI Linux x86_64；本机 Docker Linux ARM64。镜像须匹配主机架构；旧 Mongo 镜像未必提供 ARM64，不能将仿真测试当原生支持 |

使用独立测试库起步。安装与构建在代码目录运行：

```sh
npm ci --ignore-scripts --legacy-peer-deps
npm run build-client
YAPI_CONFIG=/absolute/path/to/yapi-config.json npm start
```

按 [config_example.json](config_example.json) 准备仓库外的本地配置，替换示例数据库和账号，按需关闭 mail。`YAPI_CONFIG` 指向配置文件；未设置时读取代码目录上一级 `config.json`。本机测试将 `host` 设为 `127.0.0.1`；容器内监听地址与主机端口映射分别配置，主机仅绑定回环地址。新空库初始化才运行 `YAPI_CONFIG=/absolute/path/to/yapi-config.json npm run install-server`，并立即修改初始管理员密码；**恢复旧库时不要运行安装初始化**。

构建生成 `static/index.html` 和 `static/prd/`，不需要提交生成资源或 node_modules。仓库的 [Docker 测试模板](docs/modernization/ui-parity/Dockerfile.new) 是隔离对照测试用途，不是完整生产 Compose。正式发布应固定提交、锁文件与匹配架构的镜像 digest，配置数据库认证、备份、TLS 和运行资源限制。更多 [构建/验收说明](docs/modernization/README.md)。

### 配置自己的 LLM

当前没有管理界面或 `config.json` 的模型配置入口。没有自动 `.env` 加载器，也不读取项目环境变量面板的这些字段。仅在 **YApi 服务端进程** 注入下列环境变量；三项有效即启用，没有额外 enabled 开关或项目级模型配置：

```dotenv
YAPI_LLM_BASE_URL=https://llm.example.com/v1
YAPI_LLM_MODEL=your-model-id
YAPI_LLM_API_KEY=replace-locally-with-your-key
```

密钥通过本地受保护环境文件或部署平台注入，不写入 Git、浏览器配置或聊天。Docker 部署可在既有 web 服务定义中加入 `env_file`（文件置于仓库外、权限 0600）；更改环境后按原服务定义**重建 web 容器**，仅 `docker restart` 不会更新环境。非容器部署更新进程环境并重启 Node 服务。数据库无需因此重启。

地址填写 API 前缀：程序追加 `/chat/completions`，示例请求为 `/v1/chat/completions`；不会自动补 `/v1`，不要填写完整 chat/completions 路径。仅允许 HTTPS，拒绝 URL 内账号密码、查询参数、片段及重定向。模型需支持 OpenAI 兼容 Chat Completions、`response_format: {"type":"json_object"}`、`temperature:0`、`max_tokens:4096`。实际请求超时为 30 秒，尚无已接入的超时环境变量。

TLS 使用 Node 默认校验。私有 CA 可只读挂载并通过 `NODE_EXTRA_CA_CERTS=/absolute/path/to/ca.pem` 注入；不要禁用证书校验。LLM 适配器没有独立域名/IP allowlist 或私网地址过滤，目标由服务端管理员配置；正式部署需限制出站目标。脚本 runner 的 HTTP allowlist 不管理 LLM 请求。

本机 `4175` 合成演示的 web 容器只连接 Docker internal 网络，不能假定能访问公网或宿主机模型。接入真实端点需另行批准受限网络及证书配置，不能直接解除隔离。当前 web 容器名为 `yapi-modern-ui-web-20261003`，其代理和数据库应保持原配置；这个名称是本机演示约定，不是所有部署的通用名称。

配置后用合成接口验证：打开「AI 文档助手」→ 核对地址、模型及完整发送内容 → 勾选同意本次发送 →「生成文档建议」→ 审核差异及待确认问题 →「审核完成，采纳此建议」。刷新检查结果，使用「查看历史与恢复」验证恢复为新版本；建议不会自动应用。admin、项目/分组 owner 与 dev 可生成、采纳和恢复，guest 仅可读取。脱敏是启发式的，发送前仍需检查秘密与真实个人信息。每进程限制每用户每分钟三次生成及每接口一个在途请求；多副本需共享限流/幂等设施。真实提供商质量、延迟与费用尚未验证。

实现依据：[环境接入](server/services/documentation/http.js)、[模型适配器](server/services/documentation/provider.js)、[权限](server/services/documentation/access.js)。

### 只读 MCP 接入

MCP 用于让支持 MCP 的客户端读取已授权的接口文档，与上面的 LLM 文档生成分别配置。它是独立 **stdio** 子进程，入口 `server/mcp/stdio.js`；没有 `http://localhost:4175/mcp` 这样的 HTTP 端点，不使用网页 Cookie 或项目 token 鉴权。

由管理员提供已有 Mongo **只读账号**，限定数据库读取权限；配置已有 YApi 数字用户 ID 与显式项目 ID 列表。每次调用仍检查该用户当前的项目/分组权限，公开项目也不绕过这个检查。stdio 本地访问由操作系统和 MCP 客户端控制，不要自行桥接为公网 HTTP 服务。

支持 `mcpServers` 配置格式的客户端示例（路径、ID 和连接串全部是占位示例，按客户端实际配置入口设置）：

```json
{
  "mcpServers": {
    "yapi-docs": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/yapi/server/mcp/stdio.js"],
      "env": {
        "YAPI_MCP_MONGO_URI": "mongodb://readonly-user:REPLACE_LOCALLY@db.example.invalid:27017/yapi?authSource=yapi",
        "YAPI_MCP_USER_ID": "123",
        "YAPI_MCP_PROJECT_IDS": "11,22"
      }
    }
  }
}
```

实际凭据通过客户端支持的本地秘密管理机制注入，不能提交上述配置的真实值。运行 Node 需符合本版本要求，并已安装代码依赖；客户端必须能启动该进程，进程必须能访问授权数据库。也可在已安全注入上述环境的终端执行 `npm run --silent mcp:docs`。

工具为 `list_projects({})`、`list_categories({projectId,cursor,limit})`、`list_interfaces({projectId,cursor,limit,query})`、`get_interface_documentation({projectId,interfaceId})`。分页默认 limit=50、cursor=0，limit 为 1..100，后页 cursor 取上一页最后数字 `_id`；query 为最长 100 字符的字面查询。没有文档历史、写入、恢复、执行脚本或读取环境变量工具。输出经筛选脱敏，文档正文仍是不可信数据。实现与进一步说明见 [stdio](server/mcp/stdio.js)、[工具定义](server/mcp/server.js)、[MCP 说明](docs/modernization/README.md#read-only-mcp)。

MCP 验证记录：在 `90d3245` 的既有合成 Mongo 数据上，官方 Client + `StdioClientTransport` 直接启动 `node server/mcp/stdio.js`，完成 45/45 项检查，包括 initialize、四工具枚举、项目枚举、分类/接口分页（38 个接口）、搜索、当前接口文档、多角色及公开/私有项目 ACL、越 scope/非法请求和不存在写工具的拒绝。9 个相关运行文件 hash 与该提交一致，数据库前后 dbHash 一致；相关单元测试 15/15 通过。该测试使用本地无认证数据库，**没有验证生产 Mongo 只读账号权限，也没有连接真实桌面 MCP 宿主 UI**；部署后仍须分别验证这两项。MCP 没有历史文档工具，不应将网页历史恢复流程算作 MCP 能力。

### 验证范围与已知限制

合成数据库、组件测试、真实 Chromium 和隔离 runner 已覆盖多条回归路径；这不等于所有角色、页面和历史数据已全量通过。具体边界见 [现代化说明](docs/modernization/README.md) 与 [覆盖矩阵](docs/modernization/UI-COVERAGE-MATRIX.md)。Swagger 自动同步已加入逐写鉴权和任务快照校验。[真实应用/Mongo 回归](test-modernization/swagger-live-mongo.test.js)使用随机私有测试库验证正常同步、下载中及写入间撤权、默认/新增分类、basepath、normal/good/merge 模式、账号/项目删除、配置替换和 token 失效，并跨两个真实调度时刻读回数据。它使用合成身份，不代表生产数据或真实浏览器撤权流程已验收。**这些检查不提供原子撤权或整批回滚：已经发出的 HTTP/DB 操作可能完成，最后一次权限检查到写入之间仍有竞态；此前已提交的数据会保留。**

## 3. 升级迁移说明

### 从旧版 MongoDB 3.6.23 / YApi fd90 迁移

以下是迁移操作顺序与验收要求，**尚未对用户真实生产备份执行**。仓库没有一键生产迁移脚本；测试 fixture 和 baseline 脚本不是迁移工具。禁止把 `mongo:9.0.2` 直接挂载旧 3.6 数据卷，也禁止让新应用连接原生产 3.6 数据库。

1. **盘点并冻结发布材料。**记录旧 YApi 完整提交/镜像 digest、Node、Mongo 版本、FCV、拓扑、storageEngine、OS/CPU 架构、数据库名、认证及数据卷位置；列出自定义插件、上传/附件存储、邮件、LDAP/SSO、Swagger 定时同步和脚本依赖。旧版镜像可能仅支持 x86_64，准备匹配的隔离迁移主机，不能默认在 Apple Silicon 原生运行。
2. **备份并证明可恢复。**在批准的停写窗口停止旧应用及所有外部写入、定时同步/测试任务；备份整个业务数据库与索引/选项，并备份父目录 config.json / init.lock、插件源码/锁文件、实际部署的文件及挂载/外部存储（仓库没有统一 uploads 目录；头像与脚本 storage 等数据库内容随整库备份）。使用明确支持 Mongo 3.6 的 dump/restore 工具配对，在独立 Mongo 3.6 实例先完成同版本恢复。不要默认最新版 Database Tools 支持 3.6。保留原卷和备份只读副本，记录备份文件 SHA-256、工具版本、命令退出码与恢复日志；文件 hash 正确不代表恢复正确。
3. **在副本上逐级升级。**按 Mongo 官方对应版本及拓扑指南，从 3.6 经相邻主版本逐级演练到目标版本（4.0、4.2、4.4、5.0、6.0、7.0、8.0，再按官方 9.0 支持路径）；3.6→4.0 前须 FCV=3.6；4.2 移除 MMAPv1，使用该引擎的副本需先按官方要求转 WiredTiger。每一步核对补丁版本、FCV 前置条件、索引兼容、OS/CPU 支持、备份和恢复。官方当前 9.0 指南允许从 8.0 或 8.3 升级；具体 FCV 命令应采用实际所选路径的指南，不能照搬另一条路径。每跳验收后再推进，不直接升级原卷。
4. **谨慎选择逻辑导出路径。**dump/restore 不是绕过升级约束的捷径。官方保证要求同主版本或同 FCV，并使用配对工具版本；跨版本 metadata/archive/oplog 可能失败或损坏。若采用逻辑迁移，必须先确认每段源/目标与工具支持并独立验证 BSON 类型、集合选项、索引和数据；没有完成此验证就不能宣称 3.6→9.0 直恢复可用。
5. **新应用接入隔离新库。**用恢复升级后的独立库和仓库外配置启动本分支，不运行安装初始化，不开放对真实外部 API/模型/邮件的访问。首次启动及读写可能涉及索引或历史数据兼容处理，先留升级后、应用启动前快照。保留数字 `_id`、项目/接口/分类/集合/用例关联及 IdentityCounter；禁止将数字 ID 批量改为 ObjectId、重建编号或重置计数器。
6. **验证数据与用户路径。**比较每集合计数、数字 ID 集合、计数器状态、索引和关联完整性；使用保留 BSON 类型的规范化记录投影并按 ID 排序计算摘要，记录算法，逐项解释合法差异，不能只比较 JSON 字符串顺序或导出文件大小。核对备注、Schema、环境、Mock、集合用例、变量、权限与附件。在副本上验证登录、角色拒绝路径、编辑保存刷新、Mock、运行/断言、Swagger 导入及受控同步、Wiki、插件；验证 AI 历史集合 `documentation_proposals` / `documentation_revisions` 被备份，恢复历史不会丢失。不要把合成样本通过当真实备份通过。
7. **正式切换。**演练通过后安排停写窗口，再做最终一致备份、恢复/升级与完整校验；新旧实例不得同时写同一份数据。按固定提交与配置启动新应用，切换入口，完成只读冒烟后再批准开放写入及各外部集成。记录验收结果和明确回滚截止条件。
8. **成套回滚。**失败时停止新应用与新任务，将入口切回保留的旧应用、旧配置/插件及对应旧数据库快照；绝不能用旧 Mongo 二进制直接打开新版本数据目录。若新系统已经接受写入，应先导出/封存新增变更并决定业务补录或接受的数据损失窗口，不能无说明地回滚丢弃这些写入。保留新库供排查，不覆盖唯一旧备份。

### 脚本与外部集成迁移

迁移后的脚本需按 [sandbox 部署说明](server/sandbox/README.md) 配置专用受信任 runner：web 不得挂 Docker socket；未配置返回 `ISOLATED_RUNNER_REQUIRED`，脚本网络默认拒绝，必须经项目/用户/目标精确 allowlist 批准。依赖任意主机 API 或不支持 Axios 功能的旧脚本需改造。普通 Mock、无脚本请求继续保留；真实 LDAP/SSO、第三方插件及定时同步须各自验收，不能以“功能入口还在”代替兼容测试。

### 迁移参考资料

官方依据：[MongoDB 9.0 升级要求](https://www.mongodb.com/docs/manual/release-notes/9.0-upgrade-standalone/)、[mongorestore 版本与恢复约束](https://www.mongodb.com/docs/database-tools/mongorestore/mongorestore-behavior-access-usage/)、[Database Tools 支持矩阵](https://www.mongodb.com/docs/database-tools/mongorestore/mongorestore-compatibility-and-installation/)。旧版依据：[4.0 历史升级指南](https://raw.githubusercontent.com/mongodb/docs/v4.0/source/release-notes/4.0-upgrade-standalone.txt)、[4.2 历史兼容说明](https://raw.githubusercontent.com/mongodb/docs/v4.2/source/release-notes/4.2-compatibility.txt)。旧版逐跳指南需取得对应历史版本文档；链接重定向到当前手册时不能当旧版步骤使用。
