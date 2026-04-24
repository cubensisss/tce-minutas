const fs = require("fs");

async function list() {
  const env = fs.readFileSync(".env.local", "utf8");
  const match = env.match(/GEMINI_API_KEY=(.*)/);
  const key = match ? match[1].trim() : null;
  
  if (!key) return;

  console.log("Testando com cURL simulado...");
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
  
  try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.models) {
          console.log("Modelos disponíveis:");
          data.models.forEach(m => console.log(`- ${m.name}`));
      } else {
          console.log("Erro ao listar modelos:", JSON.stringify(data));
      }
  } catch (e) {
      console.error("Erro na requisição:", e.message);
  }
}

list();
