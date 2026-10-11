// 会话块的身份、遍历和无损读取；不依赖插件、宿主或索引策略。
// 从 dsh-better-session-query 抽离，保持既有块路径和原文语义。

/**
 * 块身份:会话 + 事件 seq + 块路径。路径用点号表示嵌套(
 * 顶层块是 "0"/"1",tool-result 内层块是 "3.0")。
 * 已定稿事件里这个三元组是稳定的；未提交的流式内容由调用方单独标识。
 * @param sessionId - 会话 id。
 * @param seq - 事件序号。
 * @param path - 块路径。
 * @returns 块 id,形如 `session-xxx#12#3.0`。
 */
export function blockId(sessionId, seq, path) {
  return `${sessionId}#${seq}#${path}`;
}

/** Shared traversal for search projections and lossless rule inputs. Paths never depend on text. */
export function walkContentBlocks(content, visit, parentPath = "", parentCallId) {
  if (!Array.isArray(content)) throw new TypeError("blocks: content must be an array");
  content.forEach((block, index) => {
    const path = parentPath === "" ? String(index) : `${parentPath}.${index}`;
    const type = typeof block?.type === "string" ? block.type : "unknown";
    const callId = block?.callId ?? (type === "tool-call" ? block?.id : undefined) ?? parentCallId;
    visit(block, { path, parentPath: parentPath || null, type, callId });
    if (type === "tool-result" && Array.isArray(block?.content)) walkContentBlocks(block.content, visit, path, callId);
  });
}

function freezeRaw(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeRaw(child);
    Object.freeze(value);
  }
  return value;
}

/** Preserve wire arguments and expose a parsed JSON value or an explicit parse error. */
export function parseToolArguments(value) {
  if (typeof value !== "string") return { arguments: structuredClone(value) };
  try { return { arguments: JSON.parse(value) }; }
  catch (error) { if (!(error instanceof SyntaxError)) throw error; return { argumentsError: error.message }; }
}

/**
 * Read immutable, untrimmed original blocks. Search include flags do not hide raw evidence.
 * Ranges use UTF-16 offsets; only text/reasoning have an identity text mapping.
 * Tool arguments remain structured values. Signed/opaque metadata survives in raw.
 */
export function extractRawBlocks(event, { sessionId, view = "original", turnId } = {}) {
  if (typeof sessionId !== "string" || !sessionId || !Number.isSafeInteger(event?.seq) || event.seq < 0) {
    throw new TypeError("blocks: raw reads require sessionId and a committed event seq");
  }
  const data = event.data;
  if (!data || typeof data !== "object") throw new TypeError("blocks: event data is missing");
  const role = data.message?.role ?? ({ "assistant/message": "assistant", "system/message": "system", "user/message": "user", "tool/result": "tool", "tool/call": "assistant" })[event.type];
  const content = data.message?.content ?? data.content;
  const roots = Array.isArray(content) ? content : event.type === "tool/call" ? [{ ...data, type: "tool-call" }] : [];
  const result = [];
  const parentCallId = data.message?.toolCallId ?? data.message?.source?.callId ?? data.callId;
  const replayState = data.message?.source?.replayState ?? data.source?.replayState;
  const append = (block, ref) => {
    const text = ["text", "reasoning"].includes(ref.type) && typeof block.text === "string" ? block.text : undefined;
    const raw = structuredClone(block);
    const { arguments: args, argumentsError } = ref.type === "tool-call" ? parseToolArguments(block.arguments) : {};
    result.push(freezeRaw({ ...ref, id: blockId(sessionId, event.seq, ref.path), sessionId, seq: event.seq,
      eventType: event.type, role, view, messageId: data.message?.id ?? data.id ?? `${sessionId}#${event.seq}`, turnId,
      time: event.time, source: structuredClone(data.message?.source ?? data.source), raw, text, arguments: args, argumentsError,
      replayState: structuredClone(replayState),
      signed: ref.type === "reasoning" && (block.signature !== undefined || block.opaque !== undefined || block.encrypted !== undefined || replayState !== undefined),
      textMapping: text === undefined ? undefined : { coordinate: "utf16", original: [0, text.length], projection: [0, text.length] } }));
  };
  if (event.type === "tool/result") append({ type: "tool-result", callId: parentCallId, content: roots, isError: data.message?.isError ?? data.isError },
    { path: "$result", parentPath: null, type: "tool-result", callId: parentCallId });
  walkContentBlocks(roots, append, "", parentCallId);
  return Object.freeze(result);
}

