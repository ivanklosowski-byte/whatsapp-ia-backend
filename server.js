require("dotenv").config()

const express = require("express")
const { MessagingResponse } = require("twilio").twiml
const { OpenAI } = require("openai")
const { createClient } = require("@supabase/supabase-js")

const app = express()
app.use(express.urlencoded({ extended: false }))
app.use(express.json())

const PORT = process.env.PORT || 10000

// OpenAI
const openai = new OpenAI({
 apiKey: process.env.OPENAI_API_KEY
})

// Supabase
const supabase = createClient(
 process.env.SUPABASE_URL,
 process.env.SUPABASE_ANON_KEY
)

// buscar produtos no estoque
async function buscarProduto(termo){

 const { data, error } = await supabase
   .from("produtos")
   .select("*")
   .ilike("Descricao", `%${termo}%`)
   .limit(3)

 if(error){
   console.log(error)
   return []
 }

 return data
}


// IA responde cliente
async function responderIA(pergunta){

const resposta = await openai.chat.completions.create({

model: "gpt-4o-mini",

messages: [
{
role: "system",
content: `
Você é o Lubi, consultor da PerfectLub Centro Automotivo.

Objetivo: converter conversa em serviço na oficina.

Regras:

Nunca ensine o cliente a consertar o carro.

Sempre incentive trazer o veículo para diagnóstico.

Quando cliente pedir troca de óleo:

1 identificar veículo
2 indicar óleo correto
3 oferecer opção econômica e premium
4 sugerir agendamento

Se houver dúvida técnica diga que um especialista da PerfectLub irá verificar.
`
},
{
role: "user",
content: pergunta
}
]

})

return resposta.choices[0].message.content

}


// webhook whatsapp
app.post("/whatsapp", async (req, res) => {

const msg = req.body.Body.toLowerCase()

const twiml = new MessagingResponse()

let resposta = ""

// troca de oleo
if(msg.includes("óleo") || msg.includes("oleo")){

const produtos = await buscarProduto("óleo")

if(produtos.length > 0){

resposta = `🔧 Troca de óleo PerfectLub

Temos estas opções:

`

produtos.forEach(p => {

resposta += `• ${p.Descricao}  
💰 R$ ${p["Preco Vista"]}

`

})

resposta += `
Podemos fazer a troca hoje na PerfectLub.

Deseja agendar?`

}

}

// filtro
else if(msg.includes("filtro")){

const produtos = await buscarProduto("filtro")

if(produtos.length > 0){

resposta = `🔧 Filtros disponíveis:

`

produtos.forEach(p => {

resposta += `• ${p.Descricao}  
💰 R$ ${p["Preco Vista"]}

`

})

resposta += `
Quer agendar instalação na PerfectLub?`

}

}

// IA geral
else{

resposta = await responderIA(msg)

}

twiml.message(resposta)

res.writeHead(200, {"Content-Type": "text/xml"})
res.end(twiml.toString())

})


app.listen(PORT, () => {
console.log("Servidor PerfectLub rodando ✅")
})
