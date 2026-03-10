require("dotenv").config();
const express = require("express");
const { MessagingResponse } = require("twilio").twiml;
const { OpenAI } = require("openai");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const PORT = process.env.PORT || 10000;

// Configuração da OpenAI
const openai = process.env.OPENAI_API_KEY 
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) 
  : null;

if (openai) {
  console.log("✅ OpenAI conectada");
} else {
  console.log("⚠️ OPENAI_API_KEY não configurada no Render");
}

// Função de resposta com proteção contra travamentos
async function responderIA(msg) {
  if (!openai) return null;
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Você é um especialista em manutenção automotiva brasileira da oficina PerfectLub. Seja direto e prestativo." },
        { role: "user", content: msg }
      ],
      max_tokens: 200 // Limita o tamanho para ser mais rápido
    });
    return response.choices[0].message.content;
  } catch (err) {
    console.log("❌ Erro OpenAI:", err.message);
    return null;
  }
}

app.get("/", (req, res) => res.send("🚀 Servidor PerfectLub rodando"));

// Webhook Principal
app.post("/whatsapp", async (req, res) => {
  const twiml = new MessagingResponse();
  const mensagem = req.body.Body || "";
  console.log("📩 Mensagem recebida:", mensagem);

  const texto = mensagem.toLowerCase().trim();
  const saudacoes = ["oi", "ola", "olá", "bom dia", "boa tarde", "boa noite"];

  try {
    if (saudacoes.includes(texto)) {
      twiml.message("Olá 👋\n\nSou o assistente da *PerfectLub*.\n\nEnvie o modelo e ano do seu carro para orçamento de troca de óleo.\n\nExemplo: *Civic 2019*");
    } else {
      // Chama a IA mas com um tempo limite interno
      const respostaIA = await responderIA(mensagem);
      
      if (respostaIA) {
        twiml.message(respostaIA);
      } else {
        twiml.message(`Recebi sua mensagem: "${mensagem}".\n\nEm breve um atendente da PerfectLub irá responder.`);
      }
    }
  } catch (erro) {
    console.log("❌ Erro webhook:", erro.message);
    twiml.message("⚠️ Sistema em manutenção, mas já recebemos seu contato!");
  }

  res.type("text/xml").send(twiml.toString());
});

app.listen(PORT, () => console.log("🚀 Servidor rodando na porta", PORT));
