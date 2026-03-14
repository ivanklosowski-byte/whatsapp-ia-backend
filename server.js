require("dotenv").config();

const express = require("express");
const { MessagingResponse } = require("twilio").twiml;
const { OpenAI } = require("openai");
const { createClient } = require("@supabase/supabase-js");

const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const PORT = process.env.PORT || 10000;

/* =============================
CONFIGURAÇÕES
============================= */

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

/* =============================
SALVAR HISTÓRICO
============================= */

async function salvarHistorico(phone, role, content) {

  try {

    await supabase
      .from("historico_mensagens")
      .insert([
        {
          phone_number: phone,
          role: role,
          content: content
        }
      ]);

  } catch (error) {

    console.log("Erro ao salvar histórico:", error);

  }

}

/* =============================
BUSCAR PRODUTO
============================= */

async function buscarProduto(termo) {

  try {

    const { data, error } = await supabase
      .from("produtos")
      .select("produto, preco, categoria")
      .or(`produto.ilike.%${termo}%,categoria.ilike.%${termo}%`)
      .limit(5);

    if (error) {
      console.log(error);
      return [];
    }

    return data;

  } catch (err) {

    console.log(err);
    return [];

  }

}

/* =============================
FORMATAR PRODUTOS
============================= */

function formatarProdutos(lista) {

  if (!lista || lista.length === 0) {
    return null;
  }

  let resposta = "🔧 PRODUTOS ENCONTRADOS\n\n";

  lista.forEach(p => {

    resposta += `${p.produto}\n`;
    resposta += `💰 R$ ${p.preco}\n\n`;

  });

  resposta += "Deseja reservar ou instalar na PerfectLub?";

  return resposta;

}

/* =============================
IA LUBI
============================= */

async function responderIA(pergunta) {

  try {

    const resposta = await openai.chat.completions.create({

      model: "gpt-4o-mini",

      messages: [
        {
          role: "system",
          content: `
Você é Lubi, consultor da PerfectLub Centro Automotivo.

Responda de forma curta e clara.

Se perguntarem sobre troca de óleo ou peças,
peça sempre:

marca
modelo
ano

Se pedirem endereço responda:

PerfectLub Centro Automotivo
Ponta Grossa - PR
`
        },
        {
          role: "user",
          content: pergunta
        }
      ]

    });

    return resposta.choices[0].message.content;

  } catch (error) {

    console.log("Erro OpenAI:", error);

    return "Desculpe, tive um problema ao responder agora.";

  }

}

/* =============================
MENU INICIAL
============================= */

function menuInicial() {

  return `Olá amigo! 👋

Sou o Lubi, consultor da PerfectLub.

Como posso ajudar?

1️⃣ Troca de óleo  
2️⃣ Orçamento de peça  
3️⃣ Diagnóstico de problema  
4️⃣ Endereço`;

}

/* =============================
WEBHOOK WHATSAPP
============================= */

app.post("/whatsapp", async (req, res) => {

  const mensagem = req.body.Body?.toLowerCase() || "";
  const phone = req.body.From;

  const twiml = new MessagingResponse();

  await salvarHistorico(phone, "user", mensagem);

  let resposta = "";

  /* SAUDAÇÃO */

  if (
    mensagem === "oi" ||
    mensagem === "olá" ||
    mensagem === "ola" ||
    mensagem.includes("bom dia")
  ) {

    resposta = menuInicial();

  }

  /* ENDEREÇO */

  else if (
    mensagem === "4" ||
    mensagem.includes("endereco")
  ) {

    resposta = `📍 PerfectLub Centro Automotivo

Ponta Grossa - PR

Horário:
Segunda a Sexta
08:00 às 18:00`;

  }

  /* TROCA DE ÓLEO */

  else if (
    mensagem === "1" ||
    mensagem.includes("oleo")
  ) {

    resposta = `🔧 Troca de óleo PerfectLub

Para indicar o óleo correto me diga:

🚗 Marca  
🚗 Modelo  
🚗 Ano

Exemplo:
Onix 2019
HB20 2020
Gol 2015`;

  }

  /* BUSCAR PRODUTO */

  else {

    const produtos = await buscarProduto(mensagem);

    const respostaProdutos = formatarProdutos(produtos);

    if (respostaProdutos) {

      resposta = respostaProdutos;

    } else {

      resposta = await responderIA(mensagem);

    }

  }

  await salvarHistorico(phone, "assistant", resposta);

  twiml.message(resposta);

  res.type("text/xml");
  res.send(twiml.toString());

});

/* =============================
ROTA TESTE
============================= */

app.get("/", (req, res) => {

  res.send("Servidor PerfectLub rodando ✅ Webhook WhatsApp ativo");

});

/* =============================
START
============================= */

app.listen(PORT, () => {

  console.log(`Servidor rodando na porta ${PORT}`);

});
