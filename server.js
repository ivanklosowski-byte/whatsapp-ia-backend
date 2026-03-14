require("dotenv").config();
const express = require("express");
const { MessagingResponse } = require("twilio").twiml;
const OpenAI = require("openai");
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const PORT = process.env.PORT || 10000;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

async function consultarBanco(termo) {
  const { data, error } = await supabase
    .from('produtos')
    .select('produto, preco')
    .ilike('produto', `%${termo}%`)
    .limit(20); // Aumentei para ele ter mais opções de escolha

  if (error) return [];
  return data;
}

async function responderIA(msg, nome) {
  if (!openai) return null;

  // 1. A IA decide o que buscar (agora com instrução de prioridade)
  const extracao = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: "Se o cliente quer troca de óleo, extraia o termo 'Óleo' e o modelo do carro. Se quer peça, extraia a peça. Seja curto." }, { role: "user", content: msg }],
    max_tokens: 30
  });

  const termo = extracao.choices[0].message.content;
  const dadosProdutos = await consultarBanco(termo);

  // 2. Resposta com Lógica de Seleção
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `Você é o Lubi, Consultor Técnico da PerfectLub em Ponta Grossa. 
        Nome do cliente: ${nome}.
        
        DADOS DO SUPABASE:
        ${JSON.stringify(dadosProdutos)}
        
        INSTRUÇÕES DE RESPOSTA:
        1. Se o cliente quer TROCA DE ÓLEO, filtre nos dados acima o óleo que combine com o motor (ex: Onix usa 5W30 Dexos 1).
        2. Não ofereça peças aleatórias (como bobina) se o assunto for óleo, a menos que o cliente peça.
        3. Formate como um orçamento:
           - Óleo sugerido: [Nome] - [Preço]
           - Filtro de Óleo: [Nome/Código] - [Preço]
           - Mão de Obra: Informe que é um valor fixo à parte.
        4. Se não encontrar o óleo específico, mostre as opções de 5W30 ou 10W40 que temos no banco.
        5. Seja objetivo e feche com: "Podemos reservar seu horário?"`
      },
      { role: "user", content: msg }
    ],
    max_tokens: 400,
    temperature: 0
  });

  return response.choices[0].message.content;
}

app.get("/", (req, res) => res.send("🚀 Lubi PerfectLub Técnico!"));

app.post("/whatsapp", async (req, res) => {
  const twiml = new MessagingResponse();
  const mensagem = req.body.Body || "";
  const nomeCliente = req.body.PushName || "amigo";

  const texto = mensagem.toLowerCase().trim();
  const saudacoes = ["oi", "ola", "olá", "bom dia", "boa tarde", "boa noite"];

  try {
    if (saudacoes.includes(texto)) {
      twiml.message(`Olá ${nomeCliente}! 👋\n\nSou o *Lubi*, seu consultor na *PerfectLub*. Me diga o carro ou a peça que você procura e eu consulto nossa tabela agora!`);
    } else {
      const respostaIA = await responderIA(mensagem, nomeCliente);
      twiml.message(respostaIA);
    }
  } catch (erro) {
    twiml.message(`Opa, estou consultando o catálogo técnico... um momento.`);
  }

  res.type("text/xml").send(twiml.toString());
});

app.listen(PORT, () => console.log("🚀 Sistema Atualizado!"));
