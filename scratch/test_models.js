const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");

async function test() {
  const env = fs.readFileSync(".env.local", "utf8");
  const match = env.match(/GEMINI_API_KEY=(.*)/);
  const key = match ? match[1].trim() : null;
  
  if (!key) return;

  const genAI = new GoogleGenerativeAI(key);
  
  const models = ["gemini-2.5-flash", "gemini-3-flash-preview", "gemini-flash-latest"];

  for (const m of models) {
      try {
        console.log(`Testando ${m}...`);
        const model = genAI.getGenerativeModel({ model: m });
        const result = await model.generateContent("Oi");
        console.log(`✅ Sucesso com ${m}:`, result.response.text());
        break; // Stop at first success
      } catch (e) {
        console.error(`❌ Falha com ${m}:`, e.message);
      }
  }
}

test();
