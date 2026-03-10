require("dotenv").config()

const express = require("express")
const { MessagingResponse } = require("twilio").twiml
const { OpenAI } = require("openai")
const { createClient } = require("@supabase/supabase-js")

const app = express()

app.use(express.urlencoded({ extended: false }))
app.use(express.json())

const PORT = process.env.PORT || 10000

// ==============================
// VALIDAÇÃO DE AMBIENTE
// ==============================

if (!process.env.OPENAI_API_KEY) {
  console.log("⚠️ OPENAI_API_KEY não configurada")
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  console.log("⚠️ Supabase não configurado")
}

// ==============================
// CONEXÕES
// ==============================

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_ANON_KEY || ""
)

// ==============================
// FUNÇÕES AUXILIARES
// ==============================

function normalizar(txt) {
  return (txt || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
}

const saudacoes = [
  "oi",
  "ola",
  "olá",
  "bom dia",
  "boa tarde",
  "boa noite",
  "opa"
]

// ==============================
// IA ANALISAR MENSAGEM
// ==============================

async function analisarMensagem(msg) {

  try {

    const prompt = `
Cliente escreveu: "${msg}"

Identifique veículo e retorne JSON:

{
"modelo":"Civic",
"modelo_exato":"Honda Civic 2.0",
"motor":"2.0 16V",
"potencia":"155cv",
"litros":4.2,
"viscosidade":"0W20",
"filtro":"PSL55",
"tipo":"carro"
}

Se não for veículo:

{"tipo":"interacao"}

Responda somente JSON.
`

    const response = await openai.chat.completions.create({

      model: "gpt-4o-mini",

      messages: [
        {
          role: "system",
          content: "Especialista em lubrificação automotiva brasileira"
        },
        {
          role: "user",
          content: prompt
        }
      ],

      response_format: { type: "json_object" }

    })

    const dados = JSON.parse(response.choices[0].message.content)

    return dados

  } catch (err) {

    console.log("❌ Erro IA:", err.message)

    return { tipo: "interacao" }

  }

}

// ==============================
// CALCULAR ORÇAMENTO
// ==============================

async function calcularOrcamento(ficha) {

  try {

    const { data: oleo } = await supabase
      .from("produtos")
      .select("produto, preco")
      .ilike("produto", `%${ficha.viscosidade}%`)
      .limit(1)

    const { data: filtro } = await supabase
      .from("produtos")
      .select("produto, preco")
      .ilike("produto", `%${ficha.filtro}%`)
      .limit(1)

    if (!oleo || oleo.length === 0) return null

    const valorOleo = parseFloat(oleo[0].preco) * ficha.litros
    const valorFiltro = filtro?.length ? parseFloat(filtro[0].preco) : 40
    const maoObra = 70

    const total = valorOleo + valorFiltro + maoObra

    return {
      oleo: oleo[0].produto,
      valorOleo,
      valorFiltro,
      maoObra,
      total
    }

  } catch (err) {

    console.log("❌ Erro orçamento:", err.message)

    return null

  }

}

// ==============================
// WEBHOOK WHATSAPP
// ==============================

app.post("/whatsapp", async (req, res) => {

  const twiml = new MessagingResponse()

  try {

    const msg = req.body.Body || ""

    console.log("📩 Mensagem recebida:", msg)

    const texto = normalizar(msg)

    // SAUDAÇÃO
    if (saudacoes.includes(texto)) {

      twiml.message(`
Olá 👋

Sou o *Lubi* da PerfectLub.

Envie:

• modelo e ano do carro
ou
• placa do veículo

Exemplo:
"Civic 2019"
`)

      res.writeHead(200, { "Content-Type": "text/xml" })
      return res.end(twiml.toString())

    }

    // IA
    const ficha = await analisarMensagem(msg)

    if (!ficha || ficha.tipo === "interacao") {

      twiml.message("Pode me informar o modelo e ano do carro?")

      res.writeHead(200, { "Content-Type": "text/xml" })
      return res.end(twiml.toString())

    }

    // ORÇAMENTO
    const orc = await calcularOrcamento(ficha)

    if (!orc) {

      twiml.message(`
Seu veículo usa ${ficha.litros}L de óleo ${ficha.viscosidade}.

Mas não encontrei o produto no estoque agora.
`)

      res.writeHead(200, { "Content-Type": "text/xml" })
      return res.end(twiml.toString())

    }

    const resposta = `
🚗 ORÇAMENTO PERFECTLUB

Veículo: ${ficha.modelo_exato}

Motor: ${ficha.motor}

Óleo: ${ficha.viscosidade}

Óleo: R$ ${orc.valorOleo.toFixed(2)}

Filtro: R$ ${orc.valorFiltro.toFixed(2)}

Mão de obra: R$ ${orc.maoObra.toFixed(2)}

TOTAL: R$ ${orc.total.toFixed(2)}

Deseja agendar?
`

    twiml.message(resposta)

    res.writeHead(200, { "Content-Type": "text/xml" })
    res.end(twiml.toString())

  } catch (err) {

    console.log("❌ Erro webhook:", err)

    twiml.message("Sistema temporariamente indisponível.")

    res.writeHead(200, { "Content-Type": "text/xml" })
    res.end(twiml.toString())

  }

})

// ==============================
// ROTAS DE TESTE
// ==============================

app.get("/", (req, res) => {

  res.send("🚀 Lubi PerfectLub rodando")

})

app.get("/health", (req, res) => {

  res.json({ status: "ok" })

})

// ==============================
// START SERVER
// ==============================

app.listen(PORT, () => {

  console.log("🚀 Servidor rodando na porta", PORT)

})
