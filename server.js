require('dotenv').config()

const express = require("express")
const { createClient } = require("@supabase/supabase-js")
const { OpenAI } = require("openai")
const { MessagingResponse } = require("twilio").twiml

const app = express()

app.use(express.urlencoded({ extended: false }))
app.use(express.json())

const PORT = process.env.PORT || 10000

const supabase = createClient(
process.env.SUPABASE_URL,
process.env.SUPABASE_ANON_KEY
)

const openai = new OpenAI({
apiKey: process.env.OPENAI_API_KEY
})

function normalizar(txt){
return txt
.toLowerCase()
.normalize("NFD")
.replace(/[\u0300-\u036f]/g,"")
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

async function analisarMensagem(msg){

try{

const prompt = `
Cliente escreveu: "${msg}"

Identifique o veículo e retorne JSON:

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

Somente JSON
`

const response = await openai.chat.completions.create({

model:"gpt-4o-mini",

messages:[
{
role:"system",
content:"Especialista em lubrificação automotiva"
},
{
role:"user",
content:prompt
}
],

response_format:{ type:"json_object" }

})

let dados

try{

dados = JSON.parse(response.choices[0].message.content)

}catch{

return { tipo:"interacao" }

}

return dados

}catch(e){

console.log("Erro IA",e.message)
return null

}

}

async function calcularOrcamento(ficha){

try{

const { data:oleo } = await supabase
.from("produtos")
.select("produto,preco")
.ilike("produto",`%${ficha.viscosidade}%`)
.limit(1)

const { data:filtro } = await supabase
.from("produtos")
.select("produto,preco")
.ilike("produto",`%${ficha.filtro}%`)
.limit(1)

if(!oleo || oleo.length === 0){

return null

}

const vOleo = parseFloat(oleo[0].preco)
const vFiltro = filtro?.length ? parseFloat(filtro[0].preco) : 40
const vMO = 70

const totalOleo = vOleo * ficha.litros
const total = totalOleo + vFiltro + vMO

return{

oleo:oleo[0].produto,
valorOleo:totalOleo,
valorFiltro:vFiltro,
valorMO:vMO,
total

}

}catch(e){

console.log("Erro orçamento",e.message)
return null

}

}

app.post("/whatsapp", async (req,res)=>{

const twiml = new MessagingResponse()

try{

const msg = req.body.Body || ""

const texto = normalizar(msg)

console.log("📩 Mensagem recebida:",msg)

if(!msg){

twiml.message("Não entendi sua mensagem")

return res.type("text/xml").send(twiml.toString())

}

if(saudacoes.includes(texto)){

twiml.message(`Olá 👋

Sou o Lubi da PerfectLub.

Envie:

Modelo e ano do carro

ou

Placa do veículo.

Exemplo:
"Civic 2019"`)

return res.type("text/xml").send(twiml.toString())

}

const ficha = await analisarMensagem(msg)

if(!ficha || ficha.tipo === "interacao"){

twiml.message("Pode informar o modelo e ano do carro?")

return res.type("text/xml").send(twiml.toString())

}

const orc = await calcularOrcamento(ficha)

if(!orc){

twiml.message(`Seu carro usa ${ficha.litros}L de óleo ${ficha.viscosidade}, mas não encontrei no estoque.`)

return res.type("text/xml").send(twiml.toString())

}

const resposta = `

ORÇAMENTO PERFECTLUB

Veículo: ${ficha.modelo_exato}

Motor: ${ficha.motor}

Óleo: ${ficha.viscosidade}

Óleo: R$ ${orc.valorOleo.toFixed(2)}

Filtro: R$ ${orc.valorFiltro.toFixed(2)}

Mão de obra: R$ ${orc.valorMO.toFixed(2)}

TOTAL: R$ ${orc.total.toFixed(2)}

Deseja agendar?
`

twiml.message(resposta)

res.type("text/xml").send(twiml.toString())

}catch(e){

console.log(e)

twiml.message("Erro interno")

res.type("text/xml").send(twiml.toString())

}

})

app.get("/",(req,res)=>{

res.send("Lubi rodando")

})

app.listen(PORT,()=>{

console.log("Servidor rodando na porta",PORT)

})
