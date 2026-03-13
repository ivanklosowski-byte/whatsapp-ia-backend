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
  console.log("✅ OpenAI conectada e pronta");
} else {
  console.log("⚠️ OPENAI_API_KEY não configurada no Render");
}

/**
 * Função para gerar resposta inteligente (Personalidade PerfectLub)
 */
async function responderIA(msg, nome) {
  if (!openai) return null;
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { 
          role: "system", 
          content: `Você é o Lubi, o assistente inteligente da PerfectLub Centro Automotivo em Ponta Grossa.
          Sua missão é ser tão eficiente e amigável quanto um atendente de pizzaria de sucesso.
          
          DIRETRIZES:
          1. Identidade: Use o nome do cliente (${nome}) para ser pessoal.
          2. Emojis: Use emojis moderadamente para ser amigável (🚗, 🛢️, ✅, 🥰).
          3. Fluxo: Se o cliente enviar o carro, agradeça e peça o MOTOR (1.0, 1.6, v6, etc).
          4. Especialidade: Lembre que somos especialistas em troca de óleo, freios e suspensão em Ponta Grossa.
          5. Fechamento: Sempre incentive o agendamento: "Podemos reservar um horário para você?"
          6. Limite: Se não souber algo técnico, diga que vai passar para os mecânicos no balcão.`
        },
        { role: "user", content: msg }
      ],
      max_tokens: 250,
      temperature: 0.7
    });
    return response.choices[0].message.content;
  } catch (err) {
    console.log("❌ Erro OpenAI:", err.message);
    return null;
  }
}

// Rota de teste para ver se o servidor está vivo
app.get("/", (req, res) => res.send("🚀 Lubi PerfectLub Online e Operante!"));

/**
 * Webhook Principal do WhatsApp (Twilio)
 */
app.post("/whatsapp", async (req, res) => {
  const twiml = new MessagingResponse();
  const mensagem = req.body.Body || "";
  const nomeCliente = req.body.PushName || "amigo(a)"; // Pega o nome real do cliente no Zap
  
  console.log(`📩 Mensagem de ${nomeCliente}: ${mensagem}`);

  const texto = mensagem.toLowerCase().trim();
  const saudacoes = ["oi", "ola", "olá", "bom dia", "boa tarde", "boa noite", "opa"];

  try {
    // Resposta rápida para saudações (Economiza tempo e dinheiro)
    if (saudacoes.includes(texto)) {
      twiml.message(`Olá ${nomeCliente}! Bem-vindo à *PerfectLub* 🤖🚗\n\nEu sou o Lubi! Para agilizar seu orçamento, qual o *modelo, motor e ano* do seu carro?`);
    } else {
      // Processa o restante com a IA turbinada
      const respostaIA = await responderIA(mensagem, nomeCliente);
      
      if (respostaIA) {
        twiml.message(respostaIA);
      } else {
        twiml.message(`Opa ${nomeCliente}! Recebi sua mensagem. Em breve um de nossos especialistas da PerfectLub vai te responder por aqui! 🥰`);
      }
    }
  } catch (erro) {
    console.log("❌ Erro no processamento:", erro.message);
    twiml.message("🛠️ O Lubi está em manutenção rápida, mas nossa equipe já foi avisada do seu contato!");
  }

  // Envia a resposta formatada para o Twilio
  res.type("text/xml").send(twiml.toString());
});

app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
