# @leolee9086/dsh-session-blocks

会话块的独立纯函数库，提供块身份、嵌套遍历与无损读取。零运行时依赖，不加载 Harness，不挂载插件，也不决定哪些内容进入搜索索引。

```js
import { extractRawBlocks } from '@leolee9086/dsh-session-blocks'

const blocks = extractRawBlocks({
  seq: 7,
  type: 'assistant/message',
  data: { content: [{ type: 'text', text: '  保留原文\n' }] },
}, { sessionId: 'session-example' })
// blocks[0].id === 'session-example#7#0'
// blocks[0].text === '  保留原文\n'
```

- `blockId(sessionId, seq, path)`：沿用 `sessionId#seq#path` 身份。
- `walkContentBlocks(content, visit, parentPath?, parentCallId?)`：先序遍历块与工具结果内层内容，路径为 `0`、`0.0` 等，并传递调用关联。
- `parseToolArguments(value)`：克隆结构化参数，或解析 JSON 字符串；无效 JSON 返回 `argumentsError`，原始字符串仍由块的 `raw` 保留。
- `extractRawBlocks(event, { sessionId, view?, turnId? })`：要求真实会话 ID 和已提交的非负整数事件序号，返回深度冻结的原始块副本。保留未裁剪正文、工具参数、签名/不透明思考及来源；文字区间为 UTF-16 半开区间。工具结果事件还提供 `$result` 外壳，内层内容沿原位置展开。

调用方提供普通会话事件数据。流式请求中尚未提交的内容可使用遍历函数；不要为它编造已提交事件序号。索引文本裁剪、包含开关、surface 选择和召回策略由消费者持有。

## 开发与交付

需要 Node.js 18 或更新版本。运行 `pnpm test` 验证无损抽取行为，`pnpm pack` 生成独立安装包。测试沿用查询插件已有的原始块用例。

本库从 MIT 许可的 dsh-better-session-query 抽离，继续使用 MIT。查询插件保留 `/blocks` 兼容转发；新消费者直接依赖本包。

0.1.0 已发布到 npm，消费者可直接安装：

```sh
pnpm add @leolee9086/dsh-session-blocks@0.1.0
```

查询与照料插件已通过普通 pnpm 安装消费此版本。
