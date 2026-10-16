# Tripo → Blender

接入或参数变更时查官方 [v3 入口](https://developers.tripo3d.ai/en/docs/introduction)、[上传](https://developers.tripo3d.ai/en/docs/files)、[单图](https://developers.tripo3d.ai/en/docs/generation-image-to-model/standard)、[多图](https://developers.tripo3d.ai/en/docs/generation-multiview-to-model/standard)、[任务查询](https://developers.tripo3d.ai/en/docs/task-query)、[价格](https://developers.tripo3d.ai/en/pricing)。不混旧 v2 字段。

`tripo_job.py` 根据 2026-10-14 国际站 H3 v3.1/v3.0 文档：`POST /files` 上传 PNG/JPEG；`POST /generation/image-to-model` 或 `/generation/multiview-to-model` 提交；`GET /tasks/{task_id}` 查询，保存原始 GLB。base URL `https://openapi.tripo3d.ai/v3`。中国站账户如不同，先查适用接口，不按网页域名猜 API 地址；当前 helper 仅国际站。

## 输入与授权

用环境变量 `TRIPO_API_KEY`，密钥不进聊天、JSON、源码、浏览器或日志。遵循当前用户授权的产品与费用范围，不重复问已授权事项。缺配置时继续参考整理与本地工作。

输入需检查比例、形态；规格 `tripo.inputReview: "ready"` 表示技术就绪，不等于付费授权。整支目标不能只用花头图；AI 图仍检查结构并保留来源。

```json
{"productId":"P072","route":"tripo-blender","tripo":{"model":"v3.1-20260211","faceLimit":30000,"inputReview":"ready","images":[{"view":"front","path":"references/front.png","origin":"real-photo"},{"view":"back","path":"references/back.png","origin":"real-photo"}]}}
```

多图至少两张且含 front，用 front/left/back/right；也可单图。每张选择本地 path 或 HTTPS 直链之一。本地图不必先公开。

## 提交与恢复

默认 dry-run 不联网、不需要 Key：

```text
python <skill>/scripts/tripo_job.py --spec <spec.json> --out <new-tripo-version>
```

已授权、Key 和参考就绪时加 `--submit`。一个输出目录只创建一个任务，保存 tripo-state.json，后续同命令查询它。`--wait-seconds` 为 0–30，等待到期返回状态，不重新提交。

普通贴图配置无自动加价选项。`--max-credits` 校验基础估计（目前 30），不是供应商扣费硬上限；调用前核对当前价格。生成 POST 超时或回应缺失时停止重试，在控制台查证已有任务。失败／取消不自动生成第二个收费任务。批量每产品默认一个候选，更多变体遵循已授权预算，不无限重试。

保存 tripo-original.glb、输入、任务、参数、实耗积分与校验值。下载 CDN 不附 API Authorization。及时下载以免链接过期，保留原文件。

## Blender

导入原 GLB，修花瓣粘连、花托／背面、细茎、叶片分枝和贴图，核对支数、尺度、方向、茎底插入点。加工后使用 finish_asset.py 检查与渲染。高面数不能证明花型正确。

当前入口已离线模拟验证恢复、防重复提交、模糊提交停止、视图分配和输入冲突；尚无真实 Key 做付费验证。不得把 dry-run／模拟称为 API 已跑通。
