import http from "node:http";

const PORT = Number(process.env.PET_GENERATOR_PORT || 43177);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.5";

const paletteKeys = [
  "accent", "accent2", "danger", "ink", "inkSoft", "fur", "furDark", "belly",
  "muzzle", "mane", "maneLight", "earInner", "spot", "lens", "lensLight",
  "blush", "fang", "shirt", "pants", "shoe"
];

const profileSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string", description: "A short Chinese pet name, max 12 characters." },
    description: { type: "string", description: "One sentence visual summary in Chinese." },
    palette: {
      type: "object",
      additionalProperties: false,
      properties: Object.fromEntries(paletteKeys.map((key) => [
        key,
        { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" }
      ])),
      required: paletteKeys
    },
    features: {
      type: "object",
      additionalProperties: false,
      properties: {
        avatarType: { type: "string", enum: ["mascot", "human"] },
        earShape: { type: "string", enum: ["round", "pointy", "long", "none"] },
        maneStyle: { type: "string", enum: ["mohawk", "fluffy", "bangs", "long", "none"] },
        tailStyle: { type: "string", enum: ["tuft", "curled", "long", "none"] },
        spotStyle: { type: "string", enum: ["hyena", "dots", "stripes", "heart", "none"] },
        accessory: { type: "string", enum: ["sunglasses", "bow", "scarf", "collar", "flower", "none"] },
        vibe: { type: "string", enum: ["confident", "cute", "cool", "gentle", "mysterious"] }
      },
      required: ["avatarType", "earShape", "maneStyle", "tailStyle", "spotStyle", "accessory", "vibe"]
    }
  },
  required: ["name", "description", "palette", "features"]
};

const server = http.createServer(async (request, response) => {
  setCors(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.url === "/health") {
    sendJson(response, 200, {
      ok: true,
      model: OPENAI_MODEL,
      hasKey: Boolean(OPENAI_API_KEY)
    });
    return;
  }

  if (request.url !== "/api/pets/generate" || request.method !== "POST") {
    sendJson(response, 404, { error: "Not found" });
    return;
  }

  if (!OPENAI_API_KEY) {
    sendJson(response, 500, { error: "缺少 OPENAI_API_KEY。请在启动服务前设置环境变量。" });
    return;
  }

  try {
    const body = await readJson(request);
    if (!body.imageDataUrl || !String(body.imageDataUrl).startsWith("data:image/")) {
      sendJson(response, 400, { error: "需要 imageDataUrl，格式为 data:image/*;base64,..." });
      return;
    }

    const prompt = buildPrompt(body.desiredName, body.sourceName);
    const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: prompt },
              { type: "input_image", image_url: body.imageDataUrl, detail: "high" }
            ]
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "pixel_pet_profile",
            strict: true,
            schema: profileSchema
          }
        },
        max_output_tokens: 1400
      })
    });

    const payload = await openaiResponse.json();
    if (!openaiResponse.ok) {
      sendJson(response, openaiResponse.status, {
        error: payload.error?.message || "OpenAI API 调用失败"
      });
      return;
    }

    const text = extractOutputText(payload);
    const pet = JSON.parse(text);
    sendJson(response, 200, { pet });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "生成失败" });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Lingyue pet generator listening on http://127.0.0.1:${PORT}`);
  console.log(`Model: ${OPENAI_MODEL}`);
});

function buildPrompt(desiredName, sourceName) {
  return `
你是一个桌宠像素角色设计助手。请观察用户上传的参考图，把角色转译成“灵月 LingyueDesk 桌宠”的结构化配置。

目标不是照搬原图，也不是生成图片；目标是提取可复用的视觉特征，让网页里的 48x48 像素桌宠骨架可以用同一套动作系统表现它。

请遵守：
- 输出必须严格符合 JSON schema。
- 颜色全部使用 #RRGGBB。
- 保留参考图里最强的身份特征：主色、耳朵/头发或鬃毛、斑纹、尾巴、配饰、性格气质。
- 适配可爱但有个性的桌宠，适合“AI 伴侣”的基础形象。
- 动物、宠物、兽人等参考图使用 avatarType: "mascot"；动漫人物或明显人形参考图使用 avatarType: "human"。
- 人形参考图优先使用 earShape: "none"、maneStyle: "long"、accessory: "flower" 等抽象成桌宠特征，不要硬套动物耳朵和兽类头型。
- 如果参考图没有某个部位，选择最接近的视觉抽象，不要写解释。
- 名字优先使用这个候选：${desiredName || "桌宠"}；如果不合适，给一个更贴合参考图的短中文名。
- 原文件名：${sourceName || "未命名参考图"}。
`;
}

function extractOutputText(payload) {
  if (payload.output_text) return payload.output_text;
  const chunks = [];
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) chunks.push(content.text);
    }
  }
  if (!chunks.length) throw new Error("模型没有返回可解析的 JSON 文本");
  return chunks.join("");
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 12 * 1024 * 1024) {
        reject(new Error("请求过大，请使用较小的参考图"));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch {
        reject(new Error("请求 JSON 无法解析"));
      }
    });
    request.on("error", reject);
  });
}

function setCors(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}
