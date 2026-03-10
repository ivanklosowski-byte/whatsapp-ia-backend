require("dotenv").config()

const express = require("express")
const { MessagingResponse } = require("twilio").twiml

const app = express()

app.use(express.urlencoded({ extended: false }))

const PORT = process.env.PORT || 10000

app.get("/", (req, res) => {
  res.send("Servidor online")
})

app.post("/whatsapp", (req, res) => {

  console.log("Mensagem recebida:", req.body.Body)

  const twiml = new MessagingResponse()

  twiml.message("Teste WhatsApp funcionando ✅")

  res.writeHead(200, { "Content-Type": "text/xml" })
  res.end(twiml.toString())

})

app.listen(PORT, () => {
  console.log("Servidor rodando na porta", PORT)
})
