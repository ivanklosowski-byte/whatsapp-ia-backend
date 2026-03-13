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
 * Função IA com Tabela de Preços e Memória de Contexto
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
          
          TABELA DE PREÇOS ESTIMADOS (Use como referência):
          - Motores 1.0 (Onix, HB20, Ka, etc): Troca completa a partir de R$ 190,00 a R$ 250,00 (depende do óleo).
          - Motores 1.4/1.6: A partir de R$ 260,00.
          - Motores 2.0 ou superior: Sob consulta.
          - Mão de obra inclusa na troca de óleo.

          DIRETRIZES DE CONVERSA:
          1. Use o nome do cliente (${nome}).
          2. ATENÇÃO: Se o cliente já informou o motor na mensagem atual ou anterior, NÃO pergunte novamente.
          3. Se ele perguntar o preço e você já souber o motor, dê a estimativa da tabela acima.
          4. Se ele não falou o motor, peça educadamente.
          5. Finalize sempre convidando para vir à oficina no bairro (ex: Estrela/Uvaranas) ou agendar.`
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
  
  console.log(`📩 Mensagem de ${nomeCliente}: ${mensagem}`);

  const texto = mensagem.toLowerCase().trim();
  const saudacoes = ["oi", "ola", "olá", "bom dia", "boa tarde", "boa noite", "opa"];

  try {
    if (saudacoes.includes(texto)) {
      twiml.message(`Olá ${nomeCliente}! Bem-vindo à *PerfectLub* 🤖\n\nSou o Lubi! Para te passar o valor certinho da troca de óleo, qual o *carro, motor e ano*?`);
    } else {
      const respostaIA = await responderIA(mensagem, nomeCliente);
      
      if (respostaIA) {
        twiml.message(respostaIA);
      } else {
        twiml.message(`Opa ${nomeCliente}! Recebi sua mensagem e vou confirmar os valores com nossos técnicos agora mesmo!`);
      }
    }
  } catch (erro) {
    console.log("❌ Erro:", erro.message);
    twiml.message("🛠️ O Lubi está ajustando as ferramentas, mas já te respondemos!");
  }

  res.type("text/xml").send(twiml.toString());
});

app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
