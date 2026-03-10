require('dotenv').config();

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { OpenAI } = require('openai');
const { MessagingResponse } = require('twilio').twiml;

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

/* ===========================
   CONFIG
=========================== */

const PORT = process.env.PORT || 10000;

if (!process.env.OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY não configurada");
  process.exit(1);
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  console.error("❌ Supabase não configurado");
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* ===========================
   UTILS
=========================== */

function normalizar(texto) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

const saudacoes = [
  "oi",
  "ola",
  "bom dia",
  "boa tarde",
  "boa noite",
  "opa",
  "e ai",
  "eae",
  "boa"
];

function detectarPlaca(texto) {
  const clean = texto.replace(/[^a-zA-Z0-9]/g, "");
  const regex = /^[a-zA-Z]{3}[0-9][0-9a-zA-Z][0-9]{2}$/;
  return regex.test(clean);
}

/* ===========================
   IA
=========================== */

async function analisarMensagem(msg) {
  try {
    const prompt = `
Você é especialista em lubrificação automotiva brasileira.

Cliente escreveu: "${msg}"

Se for veículo retorne:

{
 "modelo":"Civic G10",
 "modelo_exato":"Honda Civic 2.0 i-VTEC",
 "motor":"2.0 16V Flex",
 "potencia":"155 cv",
 "litros":4.2,
 "viscosidade":"0W20",
 "filtro":"PSL55",
 "tipo":"carro"
}

Se não for veículo:

{ "tipo":"interacao" }

Retorne somente JSON.
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Especialista em manutenção automotiva brasileira."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" }
    });

    let dados;

    try {
      dados = JSON.parse(response.choices[0].message.content);
    } catch {
      return { tipo: "interacao" };
    }

    return dados;

  } catch (err) {
    console.log("❌ Erro IA:", err.message);
    return null;
  }
}

/* ===========================
   ORÇAMENTO
=========================== */

async function calcularOrcamento(ficha) {
  try {
    const visc = ficha.viscosidade.replace(/[^a-zA-Z0-9]/g, "");

    const { data: oleos } = await supabase
      .from("produtos")
      .select("produto, preco")
      .or(`produto.ilike.%${visc}%,produto.ilike.%${ficha.viscosidade}%`)
      .ilike("produto", "%1L%")
      .order("preco", { ascending: true })
      .limit(1);

    const { data: filtros } = await supabase
      .from("produtos")
      .select("produto, preco")
      .ilike("produto", `%${ficha.filtro}%`)
      .limit(1);

    const { data: mao } = await supabase
      .from("produtos")
      .select("preco")
      .ilike("produto", "%mão de obra%")
      .limit(1);

    if (!oleos || oleos.length === 0) return null;

    const vLitro = parseFloat(
      oleos[0].preco.toString().replace(",", ".")
    );

    const vFiltro = filtros?.length
      ? parseFloat(filtros[0].preco.toString().replace(",", "."))
      : 40;

    const vMO = mao?.length
      ? parseFloat(mao[0].preco.toString().replace(",", "."))
      : 70;

    const totalOleo = vLitro * ficha.litros;
    const total = totalOleo + vFiltro + vMO;

    return {
      oleo: oleos[0].produto,
      totalOleo,
      valorFiltro: vFiltro,
      valorMO: vMO,
      total
    };

  } catch (err) {
    console.log("❌ Erro orçamento:", err.message);
    return null;
  }
}

/* ===========================
   WHATSAPP
=========================== */

app.post("/whatsapp", async (req, res) => {

  const twiml = new MessagingResponse();

  try {

    const msg = (req.body.Body || "").trim();
    const texto = normalizar(msg);

    console.log("📩 Mensagem recebida:", msg);

    if (!msg) {
      twiml.message("Não consegui entender sua mensagem.");
      return res.type("text/xml").send(twiml.toString());
    }

    if (saudacoes.includes(texto)) {

      twiml.message(
`Olá! Eu sou o *Lubi* da PerfectLub 🚗

Me envie:

• modelo e ano do carro
ou
• a placa do veículo

Que eu calculo a troca de óleo.`
      );

      return res.type("text/xml").send(twiml.toString());
    }

    if (detectarPlaca(texto)) {

      twiml.message(
`Recebi a placa.

Vou consultar os dados do veículo para calcular a troca de óleo.`
      );

      return res.type("text/xml").send(twiml.toString());
    }

    const ficha = await analisarMensagem(msg);

    if (!ficha || ficha.tipo === "interacao") {

      twiml.message(
`Pode me informar o modelo e ano do veículo?

Exemplo:

"Civic 2019 2.0"`
      );

      return res.type("text/xml").send(twiml.toString());
    }

    const orcamento = await calcularOrcamento(ficha);

    if (!orcamento) {

      twiml.message(
`Seu veículo usa ${ficha.litros}L de ${ficha.viscosidade}.

Mas não encontrei esse óleo no sistema agora.

Um consultor da PerfectLub vai verificar para você.`
      );

      return res.type("text/xml").send(twiml.toString());
    }

    const resposta =
`✅ *ORÇAMENTO PERFECTLUB*

🚘 Veículo: ${ficha.modelo_exato}

🔧 Motor: ${ficha.motor}
⚡ Potência: ${ficha.potencia}

📏 Capacidade: ${ficha.litros}L
🛢️ Óleo: ${ficha.viscosidade}

🛢️ Óleo: R$ ${orcamento.totalOleo.toFixed(2)}
⚙️ Filtro: R$ ${orcamento.valorFiltro.toFixed(2)}
🔧 Mão de obra: R$ ${orcamento.valorMO.toFixed(2)}

💰 *TOTAL: R$ ${orcamento.total.toFixed(2)}*

Deseja agendar a troca?`;

    twiml.message(resposta);

    res.type("text/xml").send(twiml.toString());

  } catch (err) {

    console.log("❌ Erro geral:", err);

    twiml.message(
      "Sistema temporariamente indisponível. Tente novamente."
    );

    res.type("text/xml").send(twiml.toString());
  }

});

/* ===========================
   ROTAS
=========================== */

app.get("/", (req, res) => {
  res.send("🚀 Lubi PerfectLub Online");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

/* ===========================
   SERVER
=========================== */

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
