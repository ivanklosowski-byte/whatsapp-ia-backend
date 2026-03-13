require("dotenv").config();
const express = require("express");
const { MessagingResponse } = require("twilio").twiml;
const OpenAI = require("openai");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const PORT = process.env.PORT || 10000;

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

/**
 * Função IA com Tabela de Filtros e Venda Adicional
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
          
          TABELA DE PREÇOS (Estimados):
          - Troca de Óleo + Filtro Óleo (1.0): R$190 a R$260
          - Troca de Óleo + Filtro Óleo (1.4/1.6): R$270 a R$340
          - Troca de Óleo + Filtro Óleo (2.0+): A partir de R$380
          - Filtro de Ar do Motor: R$40 a R$90 (depende do carro)
          - Filtro de Cabine (Ar-condicionado): R$40 a R$80
          - Higienização de Ar-condicionado (Oxi-sanitização): R$80 a R$120

          ESTILO DE CONVERSA:
          1. Nome do cliente: ${nome}.
          2. Seja direto e vendedor. Se o cliente perguntar de um filtro, informe o preço e ofereça a revisão dos outros filtros também.
          3. Se falarem de ar-condicionado, ofereça a higienização com Ozônio (é mais saúde para a família).
          4. Não repita saudações formais se já estiver conversando.
          5. Objetivo: Agendamento na PerfectLub em Ponta Grossa.`
        },
        {
          role: "user",
          content: msg
        }
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
  const nomeCliente = req.body.PushName || "amigo";

  console.log(`📩 ${nomeCliente}: ${mensagem}`);

  const texto = mensagem.toLowerCase().trim();
  const saudacoes = ["oi", "ola", "olá", "bom dia", "boa tarde", "boa noite", "opa"];

  try {
    if (saudacoes.includes(texto)) {
      twiml.message(
        `Olá ${nomeCliente}! 👋\n\nSou o *Lubi*, assistente da *PerfectLub* 🚗\n\nQual o *modelo, motor e ano* do carro para eu te passar o valor da manutenção agora?`
      );
    } else {
      const respostaIA = await responderIA(mensagem, nomeCliente);
      twiml.message(respostaIA || `Opa! Vou confirmar esse valor com os técnicos e já te respondo.`);
    }
  } catch (erro) {
    twiml.message(`⚠️ O sistema deu uma pequena falha, mas nossa equipe já está ciente!`);
  }

  res.type("text/xml").send(twiml.toString());
});

app.listen(PORT, () => console.log("🚀 Servidor rodando na porta:", PORT));
