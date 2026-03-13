require("dotenv").config();
const express = require("express");
const { MessagingResponse } = require("twilio").twiml;
const { OpenAI } = require("openai");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const PORT = process.env.PORT || 10000;

const openai = process.env.OPENAI_API_KEY 
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) 
  : null;

/**
 * Função IA com Memória de Contexto e Tabela de Preços
 */
async function responderIA(msg, nome) {
  if (!openai) return null;
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { 
          role: "system", 
          content: `Você é o Lubi, o assistente inteligente da PerfectLub em Ponta Grossa.
          
          TABELA DE PREÇOS ESTIMADOS (Referência):
          - Motores 1.0 (Onix, HB20, Ka): Troca completa (Óleo + Filtro) entre R$ 190,00 e R$ 260,00.
          - Motores 1.4 / 1.6: Entre R$ 270,00 e R$ 340,00.
          - Motores 2.0 ou superior: A partir de R$ 380,00.
          *Valores variam conforme a especificação do fabricante (5W30, 0W20, etc).

          REGRAS DE OURO:
          1. O cliente já pode ter informado o carro anteriormente. LEIA ATENTAMENTE o contexto.
          2. Se ele perguntar o preço e já tiver dito o motor (ex: 1.0), dê a estimativa da tabela acima IMEDIATAMENTE.
          3. NUNCA pergunte o motor se ele acabou de dizer (Ex: Se ele disse "Onix 1.0", você já sabe que é 1.0).
          4. Seja cordial, use o nome ${nome} e convide para agendar na PerfectLub em Ponta Grossa.`
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

app.get("/", (req, res) => res.send("🚀 Lubi PerfectLub Online!"));

app.post("/whatsapp", async (req, res) => {
  const twiml = new MessagingResponse();
  const mensagem = req.body.Body || "";
  const nomeCliente = req.body.PushName || "amigo(a)";
  
  // Log para controle no Render
  console.log(`📩 [${nomeCliente}]: ${mensagem}`);

  const texto = mensagem.toLowerCase().trim();
  const saudacoes = ["oi", "ola", "olá", "bom dia", "boa tarde", "boa noite", "opa"];

  try {
    if (saudacoes.includes(texto)) {
      twiml.message(`Olá ${nomeCliente}! Bem-vindo à *PerfectLub* 🤖🚗\n\nSou o Lubi! Para eu te passar o valor da troca, qual o *carro, motor e ano*?`);
    } else {
      // Enviamos a mensagem com um reforço de contexto para a IA não esquecer
      const respostaIA = await responderIA(mensagem, nomeCliente);
      
      if (respostaIA) {
        twiml.message(respostaIA);
      } else {
        twiml.message(`Opa ${nomeCliente}! Recebi sua mensagem e vou confirmar com os mecânicos agora!`);
      }
    }
  } catch (erro) {
    console.log("❌ Erro:", erro.message);
    twiml.message("🛠️ O Lubi está em manutenção rápida, mas já te respondemos!");
  }

  res.type("text/xml").send(twiml.toString());
});

app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
