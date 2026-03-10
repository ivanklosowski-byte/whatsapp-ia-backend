require("dotenv").config()

const express = require("express")
const { MessagingResponse } = require("twilio").twiml

const app = express()

app.use(express.urlencoded({ extended:false }))
app.use(express.json())

const PORT = process.env.PORT || 10000


// ROTA PRINCIPAL
app.get("/",(req,res)=>{

res.send("Lubi rodando")

})


// ROTA DO WHATSAPP
app.post("/whatsapp",(req,res)=>{

console.log("📩 Mensagem recebida:",req.body.Body)

const twiml = new MessagingResponse()

twiml.message("Bot PerfectLub funcionando ✅")

res.set("Content-Type","text/xml")

res.send(twiml.toString())

})


// INICIAR SERVIDOR
app.listen(PORT,()=>{

console.log("Servidor rodando na porta",PORT)

})
