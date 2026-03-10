require("dotenv").config()

const express = require("express")
const { MessagingResponse } = require("twilio").twiml
const { OpenAI } = require("openai")

const app = express()

app.use(express.urlencoded({ extended: false }))
app.use(express.json())

const PORT = process.env.PORT || 10000

// =============================
// OpenAI (opcional)
// =============================

let openai = null

if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  })
  console.log("✅ OpenAI conectada")
} else {
  console.log("⚠️ OPENAI_API_KEY não configurada")
}

// =============================
// Função IA (opcional)
// =============================

async function responderIA(msg) {

  if (!openai) return null

  try {

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Você é um especialista em manutenção automotiva brasileira e atendimento de oficina."
        },
        {
          role: "user",
          content: msg
        }
      ]
    })

    return response.choices[0].message.content

  } catch (err) {

    console.log("❌ Erro OpenAI:", err.message)
    return null

  }

}

// =============================
// Rotas de teste
// =============================

app.get("/", (req, res) => {
  res.send("🚀 Servidor PerfectLub rodando")
})

app.get("/whatsapp", (req, res) => {
  res.send("✅ Webhook WhatsApp ativo")
})

// =============================
// Webhook WhatsApp
// =============================

app.post("/whatsapp", async (req, res) => {

  const twiml = new MessagingResponse()

  try {

    const mensagem = req.body.Body || ""

    console.log("📩 Mensagem recebida:", mensagem)

    const texto = mensagem.toLowerCase().trim()

    // saudação simples
    if (
      texto === "oi" ||
      texto === "ola" ||
      texto === "olá" ||
      texto === "bom dia" ||
      texto === "boa tarde" ||
      texto === "boa noite"
    ) {

      twiml.message(
`Olá 👋

Sou o assistente da PerfectLub.

Envie o modelo e ano do seu carro para orçamento de troca de óleo.

Exemplo:
"Civic 2019"`
      )

    } else {

      // tentar responder com IA
      const respostaIA = await responderIA(mensagem)

      if (respostaIA) {

        twiml.message(respostaIA)

      } else {

        twiml.message(
`Recebi sua mensagem:

"${mensagem}"

Em breve um atendente da PerfectLub irá responder.`
        )

      }

    }

  } catch (erro) {

    console.log("❌ Erro webhook:", erro)

    twiml.message("⚠️ Sistema temporariamente indisponível.")

  }

  res.writeHead(200, { "Content-Type": "text/xml" })
  res.end(twiml.toString())

})

// =============================
// Inicializar servidor
// =============================

app.listen(PORT, () => {

  console.log("🚀 Servidor rodando na porta", PORT)

})
