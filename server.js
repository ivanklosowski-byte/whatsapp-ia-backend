require("dotenv").config();
const express = require("express");
const { MessagingResponse } = require("twilio").twiml;
const OpenAI = require("openai");
const { createClient } = require("@supabase/supabase-js");

const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const PORT = process.env.PORT || 10000;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;





// ============================
// CONSULTAR BANCO
// ============================

async function consultarBanco(termo) {

  if (!termo) return [];

  const termoLimpo = termo.split(" ")[0];

  const { data, error } = await supabase
    .from("produtos")
    .select("produto, preco")
    .ilike("produto", `%${termoLimpo}%`)
    .limit(20);

  if (error) {
    console.error("Erro Supabase:", error);
    return [];
  }

  return data || [];
}





// ============================
// RESPOSTA IA
// ============================

async function responderIA(msg, nome) {

  if (!openai) return null;

  try {

    // IA extrai o termo de busca
    const extracao = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
Extraia da mensagem do cliente o que ele procura.

Se for troca de óleo responda apenas:
óleo

Se for peça responda apenas o nome da peça.

Responda apenas uma palavra.
`
        },
        { role: "user", content: msg }
      ],
      max_tokens: 20,
      temperature: 0
    });

    const termo =
      extracao?.choices?.[0]?.message?.content?.trim() || msg;

    const dadosProdutos = await consultarBanco(termo);




    // IA gera resposta
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
Você é o Lubi, consultor técnico da PerfectLub em Ponta Grossa.

Nome do cliente: ${nome}

PRODUTOS DISPONÍVEIS NO BANCO:
${JSON.stringify(dadosProdutos)}

REGRAS IMPORTANTES:

- Use SOMENTE produtos da lista acima
- Nunca invente preços
- Se a lista estiver vazia diga que irá consultar o estoque
- Seja objetivo
- Formate como orçamento simples

Exemplo:

🔧 ORÇAMENTO PERFECTLUB

Óleo sugerido: [nome] - [preço]

Filtro de óleo: [nome] - [preço]

Mão de obra: valor fixo à parte

Finalize perguntando se pode reservar horário.
`
        },
        { role: "user", content: msg }
      ],
      max_tokens: 300,
      temperature: 0
    });

    return response?.choices?.[0]?.message?.content || null;

  } catch (erro) {

    console.error("Erro OpenAI:", erro);
    return null;

  }
}





// ============================
// SERVIDOR ONLINE
// ============================

app.get("/", (req, res) => {
  res.send("🚀 Lubi PerfectLub Online");
});





// ============================
// WEBHOOK WHATSAPP
// ============================

app.post("/whatsapp", async (req, res) => {

  const twiml = new MessagingResponse();

  const mensagem = req.body.Body || "";
  const nomeCliente = req.body.PushName || "amigo";

  if (!mensagem) {
    return res.sendStatus(200);
  }

  const texto = mensagem.toLowerCase().trim();

  const saudacoes = [
    "oi",
    "ola",
    "olá",
    "bom dia",
    "boa tarde",
    "boa noite"
  ];



  try {




    // =========================
    // SAUDAÇÃO
    // =========================

    if (saudacoes.includes(texto)) {

      twiml.message(
`Olá ${nomeCliente}! 👋

Sou o *Lubi*, consultor da *PerfectLub*.

Como posso ajudar?

1️⃣ Troca de óleo  
2️⃣ Orçamento de peça  
3️⃣ Diagnóstico de problema  
4️⃣ Endereço`
      );

      return res.type("text/xml").send(twiml.toString());
    }





    // =========================
    // TROCA DE ÓLEO
    // =========================

    if (texto.includes("oleo") || texto.includes("óleo")) {

      twiml.message(
`Perfeito! Fazemos troca de óleo. 🔧

Para indicar o óleo correto me diga:

🚗 Marca  
🚗 Modelo  
🚗 Ano

Exemplo:
Onix 2019
HB20 2020
Gol 2015`
      );

      return res.type("text/xml").send(twiml.toString());
    }





    // =========================
    // ENDEREÇO
    // =========================

    if (texto.includes("endereco") || texto.includes("endereço")) {

      twiml.message(
`📍 PerfectLub Centro Automotivo

Ponta Grossa - PR

Clique para abrir no mapa:
https://maps.google.com`
      );

      return res.type("text/xml").send(twiml.toString());
    }





    // =========================
    // IA
    // =========================

    const respostaIA = await responderIA(mensagem, nomeCliente);

    twiml.message(
      respostaIA ||
        "Estou consultando nosso catálogo técnico. Pode repetir a pergunta?"
    );





  } catch (erro) {

    console.error("Erro geral:", erro);

    twiml.message(
      "Opa! Estou consultando o catálogo técnico... tente novamente em instantes."
    );
  }

  res.type("text/xml").send(twiml.toString());

});





// ============================
// INICIAR SERVIDOR
// ============================

app.listen(PORT, () => {

  console.log("🚀 Lubi PerfectLub rodando na porta", PORT);

});
