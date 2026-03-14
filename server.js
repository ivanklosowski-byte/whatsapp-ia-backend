require("dotenv").config()

const express = require("express")
const { MessagingResponse } = require("twilio").twiml
const { createClient } = require("@supabase/supabase-js")
const { OpenAI } = require("openai")

const app = express()

app.use(express.urlencoded({ extended: false }))
app.use(express.json())

const PORT = process.env.PORT || 10000

const openai = new OpenAI({
 apiKey: process.env.OPENAI_API_KEY
})

const supabase = createClient(
 process.env.SUPABASE_URL,
 process.env.SUPABASE_ANON_KEY
)

/* =========================
DETECTAR CARRO
========================= */

function detectarCarro(msg){

 if(msg.includes("onix")) return "onix"
 if(msg.includes("gol")) return "gol"
 if(msg.includes("hb20")) return "hb20"

 return null
}

/* =========================
ÓLEO RECOMENDADO
========================= */

function oleoRecomendado(carro){

 if(carro==="onix"){

 return `🔧 Troca de óleo PerfectLub

Veículo: Chevrolet Onix

Óleo recomendado:
5W30 Dexos

Itens da troca:

• Óleo
• Filtro de óleo

Deseja orçamento completo?`
 }

 if(carro==="gol"){

 return `🔧 Troca de óleo

Veículo: Gol

Óleo recomendado:
5W40

Deseja orçamento?`
 }

 return null

}

/* =========================
BUSCAR PRODUTO
========================= */

async function buscarProduto(termo){

 const { data } = await supabase
 .from("produtos")
 .select("produto,preco")
 .ilike("produto",`%${termo}%`)
 .limit(5)

 return data || []

}

/* =========================
FORMATAR PRODUTOS
========================= */

function formatarProdutos(lista){

 if(lista.length===0) return null

 let resposta="🔧 PRODUTOS ENCONTRADOS\n\n"

 lista.forEach(p=>{

 resposta+=`${p.produto}\n`
 resposta+=`💰 R$ ${p.preco}\n\n`

 })

 return resposta

}

/* =========================
MENU
========================= */

function menu(){

 return `Olá amigo! 👋

Sou o Lubi da PerfectLub.

Como posso ajudar?

1️⃣ Troca de óleo
2️⃣ Orçamento de peça
3️⃣ Diagnóstico
4️⃣ Endereço`

}

/* =========================
IA (somente fallback)
========================= */

async function respostaIA(msg){

 const response = await openai.chat.completions.create({

 model:"gpt-4o-mini",

 messages:[
 {
 role:"system",
 content:"Você é atendente de oficina mecânica. Responda curto."
 },
 {
 role:"user",
 content:msg
 }
 ]

 })

 return response.choices[0].message.content

}

/* =========================
WHATSAPP
========================= */

app.post("/whatsapp",async(req,res)=>{

 const mensagem=req.body.Body?.toLowerCase()||""

 const twiml=new MessagingResponse()

 let resposta=""

/* SAUDAÇÃO */

 if(
 mensagem.includes("oi")||
 mensagem.includes("ola")||
 mensagem.includes("bom dia")
 ){

 resposta=menu()

 }

/* MENU TROCA OLEO */

 else if(mensagem==="1"){

 resposta=`🔧 Troca de óleo

Informe o veículo:

Exemplo:
Onix 2013
Gol 2016`

 }

/* DETECTAR CARRO */

 else{

 const carro=detectarCarro(mensagem)

 if(carro){

 resposta=oleoRecomendado(carro)

 }

 else{

 const produtos=await buscarProduto(mensagem)

 const respostaProdutos=formatarProdutos(produtos)

 if(respostaProdutos){

 resposta=respostaProdutos

 }

 else{

 resposta=await respostaIA(mensagem)

 }

 }

 }

 twiml.message(resposta)

 res.type("text/xml")
 res.send(twiml.toString())

})

/* =========================
SERVIDOR
========================= */

app.get("/",(req,res)=>{

 res.send("Servidor PerfectLub rodando ✅")

})

app.listen(PORT,()=>{

 console.log("Servidor rodando")

})
