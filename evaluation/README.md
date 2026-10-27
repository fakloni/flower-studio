# 花材模型评测

本文件夹集中保存花材识别与花束生成的讨论、API 分析、模型配置和评测工具。

**识花准确率可以通过脚本自动计算，前提是每张测试图片有人工核实的标准答案。** 模型给出的答案不能同时当作它自己的评分标准。

完整背景见 [API 可行性、价格与评测路线](api-analysis.md)，模型清单见 [可配置模型与价格](config/models.example.json)，生图用例见 [花束约束模板](prompts/bouquet.md)。

## 第一版已实现什么

- 从现有花材目录生成待核对照片清单，保留稳定样本 ID、来源和图片关联。
- 模型开关、型号、服务渠道、完整接口地址、密钥环境变量名称、思考档位、输出上限、超时和请求次数上限均可配置。
- OpenAI Responses、火山方舟 Chat、Google Interactions 三种原生识图协议；单张图片独立请求，不带其他样本对话。
- 单轮开放识花，自动计算大类/细分类/可核实品种准确率、Top-3、各类准确率与宏平均。
- 记录服务端原始用量、完整响应耗时、请求 ID、失败状态、原币种估算费用；输出 JSON、CSV 和错误样本列表。
- 保存数据、参数、提示词和图片校验值；支持对同一批次离线重新计算汇总。

当前未进行真实付费 API 联调，不提供模型效果排名。离线测试使用模拟响应，证明评分、计费与请求处理逻辑，不代表供应商已对当前账号开放这些型号。

生图九个候选已保留配置和评测方案，尚未接入生成命令。第一版不包含候选花材库匹配、自动重试、断点续跑、并发测试、严格金额预算、自动汇率换算或账单对账。请求次数上限只能限制调用数量，不能承诺固定金额。

## 快速使用

在项目根目录执行，需要 Node.js 22.13 或更新版本，无需新增依赖。

### 1. 生成待核对照片清单

```powershell
node evaluation/src/cli.mjs prepare
```

生成 `evaluation/datasets/catalog-review.local.json`，默认不覆盖旧文件。已有 10 个明确标为真实照片的素材会进入待核清单，**全部默认 `reviewed: false`**。目录自动带出的名称只供核对，不能直接认为已确认。

打开每张图片，按可见证据核对并修改：

```json
{
  "id": "sample-001",
  "image": "../../public/assets/catalog/P052/photo-reference-v1/cover.webp",
  "reviewed": true,
  "truth": {
    "group": ["玫瑰"],
    "name": ["单头玫瑰", "玫瑰"],
    "cultivar": []
  },
  "sourceGroup": "同一标本或拍摄组编号"
}
```

上面仅演示格式，不是已经确认的标签。每一层数组表示“可接受的等价回答”，第一项作为该层规范名称。不要把上下位类随意都加入数组来放宽标准；大类在 `group` 单独评分。如果“玫瑰”不足以区分该测试类别，`name` 中就只放细分类及等价别名。

没有证据确认具体栽培品种时，`cultivar` 留空，不参与该层分母。花材库外/无法辨认的专门拒识样本可将 `truth.name` 写为 `["unknown"]`，大类与品种留空。测试数据不要混入花名文字明显的标签图；不要用生成图或模型预览图充当真实照片。

只有 `reviewed: true` 的样本进入调用和评分。可以添加更多真实照片，但同一标本、来源的近似照片需保留 `sourceGroup` 并人工分开调参集和最终测试集。

### 2. 配置模型

```powershell
Copy-Item evaluation/config/models.example.json evaluation/config/models.local.json
Copy-Item evaluation/.env.example evaluation/.env.local
```

在 `models.local.json` 中调整模型的 `enabled`、`model`、`endpoint`、`parameters` 与 `price`。在 `.env.local` 填入对应供应商 key，或在运行前设置同名进程环境变量。已有进程环境变量优先，不会被文件覆盖。

所有本地配置、密钥和运行结果都已忽略，不提交 GitHub。JSON 只填写 `apiKeyEnv`（例如 `OPENAI_API_KEY`），不能填写真实 key。工具只载入 `evaluation/.env.local`，与网页环境配置分开。

示例提供九个识花候选，全部 `enabled: true`；实际执行建议先用 `--models` 选择一个。两个指定 DeepSeek V4 GA 版本保留在 `excludedCandidates`，不参与识花。九个生图候选为 `task: generation`，当前脚本不会调用。

参数按原生协议配置；同样叫 `low` 不代表不同厂商使用等量算力。接口校验只允许无嵌入凭证的 HTTPS 地址，不支持自定义请求头和 URL 密钥。自定义渠道时须同步核对协议和价格，不能沿用官方价格假装是渠道实际费用。

### 3. 免费本地预检与计划预览

```powershell
node evaluation/src/cli.mjs check --config evaluation/config/models.local.json
node evaluation/src/cli.mjs run --config evaluation/config/models.local.json --models doubao-lite,gpt-luna
```

两个命令都不调用 API，也不要求 key。它们检查模型配置、样本格式、图片文件及提示词，显示已复核数量、计划调用量和请求上限。第二个命令没有 `--execute`，因此只预览。

图片原始文件按统一路径读取，工具仅接受 PNG/JPEG/WebP，单张限制 20MB，不自动裁剪或缩放；需要调整时先生成独立且固定版本的输入数据。原始尺寸与各供应商内部处理仍会影响消耗。

### 4. 执行识花

```powershell
node evaluation/src/cli.mjs run --execute --config evaluation/config/models.local.json --models doubao-lite --max-requests 10
```

`--execute` 才会发出付费请求。启动前检查所有选中模型的 key 和已复核样本；缺失则整批不发请求。超过请求次数上限也会整批停止，不静默只测前几张。

30 张图片 × 9 个模型共 270 次时，需要明确提高上限：

```powershell
node evaluation/src/cli.mjs run --execute --config evaluation/config/models.local.json --max-requests 270
```

默认每个模型/样本只调用一次，顺序运行且无自动重试。遇到超时或网络错误仍保留费用未知状态，避免自动重复计费。不要把中断后的再次运行称作断点续跑；它会创建新批次并重新执行。

### 5. 查看结果

结果保存在 `evaluation/runs/<批次时间>/`，也可用 `--out` 指定新文件夹，不覆盖已有批次。

| 文件 | 内容 |
| --- | --- |
| `run.json` | 模型/价格、人工真值、提示词、数据和图片校验值、完整计划 |
| `results.jsonl` | 每次调用的预测、状态、耗时、请求 ID、token 与费用 |
| `000001.json` 等 | 对应供应商原始响应，授权头和 key 不保存 |
| `summary.json` / `summary.csv` | 各模型正确率、各类别结果、P50/P95 和分币种费用 |
| `errors.json` | 认错、结构无效、接口失败和计划中缺失的样本，带标准答案与各层得分 |

CSV 可以直接用 Excel 打开。费用保留 CNY / USD 分开汇总，不按未核实汇率相加。`billedCost` 暂时为空，不能把估算说成已扣款。

离线重新汇总，不调用模型：

```powershell
node evaluation/src/cli.mjs score --input evaluation/runs/实际批次目录 --out evaluation/runs/重新评分.json
```

默认仍读取 `catalog-review.local.json`；自定义样本文件时加 `--dataset 路径`。清单需与运行时完全相同，否则拒绝混用。评分使用批次内快照；不要修改历史真值来追求更高准确率。

## 准确率的计算口径

每一层：`正确数量 / 本批次该层有标准答案的计划样本数量`。失败、无效 JSON 和缺失结果计为未正确，另外单列失败/缺失数。未人工复核样本、没有真值的品种层不进入对应分母；每个模型显示实际分母。

- 大类正确不等于细分类正确。例如真值为乒乓菊，只答菊花：大类可正确，细分类不正确。
- 使用人工给定的等价名称匹配；仅规范大小写、全半角、空格与标点，不用子串或模糊匹配自动判对。
- `name` 是 Top-1；`top3` 第一项必须与其一致，其余可列最多两个不同候选。规范化后的候选不能重复。
- `unknown: true` 是完整拒识；已知花材上算未命中，拒识真值样本上可以判对。
- 宏平均按 `truth.name` 第一项分组。各样本同一类别请使用相同规范名称；目录不互斥的上位/下位项需要先人工整理。
- P50/P95 使用成功且结果可解析的完整响应耗时，包含上传和供应商等待，不是首字时间；它不显示为纯推理速度。

质量阈值与速度成本分开呈现，不先揉成一个任意加权总分。更大的数据集、重复测试和置信区间是后续选型步骤，十张参考照片不能支持稳健排名。

## 用量和费用规则

第一版估算只覆盖单轮识图的标准短上下文输入、缓存读取和输出；没有启用联网/其他工具、缓存写入或特殊服务档位。请不要在配置中改变服务模式后沿用此估算口径。

OpenAI/Ark 的输出总 token 已含思考，避免重复相加；Gemini Interactions 的最终输出与 thoughts 按接口语义相加。字段缺失保留 `null`；Gemini 未返回思考用量时不猜测最终费用。缓存量未知时使用未缓存上界并标记 `uncached_upper_bound`。

价格失效、超出已实现的长上下文档位、输入/输出用量缺失或缓存计费无法核定时记 `unknown`，不当作免费。汇总显示费用未知的已尝试请求数和未执行数。用量可用的结构错误仍会记费用；超时也可能产生费用。

价格来自 [API 分析中的官方来源](api-analysis.md#4-成本如何计算)，配置保留生效期及来源。OpenAI Responses、Ark Chat 和 Gemini Interactions 原生响应均保存，方便之后对账。Google 当前响应以 `steps/model_output` 提取文本，结构依据[原生接口文档](https://ai.google.dev/api/interactions-api)；思考计费依据[官方说明](https://ai.google.dev/gemini-api/docs/thinking)。

## 离线验证

```powershell
node --test evaluation/tests/evaluation.test.mjs
```

测试覆盖层级与别名、拒识、失败分母、重复记录拒绝、缓存与思考计费、价格失效、三家请求/响应格式、HTTP 错误/超时、批次快照与输出防覆盖。测试不访问真实 API。
