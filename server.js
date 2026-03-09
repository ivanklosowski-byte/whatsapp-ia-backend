require("dotenv").config()

const express = require("express")
const bodyParser = require("body-parser")
const twilio = require("twilio")
const OpenAI = require("openai")

const app = express()

app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

app.get("/", (req, res) => {
  res.send("Servidor funcionando")
})

app.post("/webhook", async (req, res) => {

  try {

    const message = req.body.Body

    const ai = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Você responde clientes no WhatsApp de forma educada."
        },
        {
          role: "user",
          content: message
        }
      ]
    })

    const reply = ai.choices[0].message.content

    const twiml = new twilio.twiml.MessagingResponse()

    twiml.message(reply)

    res.writeHead(200, { "Content-Type": "text/xml" })
    res.end(twiml.toString())

  } catch (error) {

    console.error(error)

    res.send("Erro no servidor")

  }

})

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log("Servidor rodando na porta " + PORT)
})
