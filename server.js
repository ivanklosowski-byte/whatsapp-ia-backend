require("dotenv").config()

const express = require("express")
const { MessagingResponse } = require("twilio").twiml
const { OpenAI } = require("openai")
const { createClient } = require("@supabase/supabase-js")

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

/* =======================
BUSCAR CONTEXTO
======================= */

async function buscarContexto(phone){

 const { data } = await supabase
 .from("clientes_contexto")
 .select("*")
 .eq("telefone",phone)
 .limit(1)

 return data?.[0] || null
}

/* =======================
SALVAR CONTEXTO
======================= */

async function salvarContexto(phone,carro,assunto){

 await supabase
 .from("clientes_contexto")
 .upsert({
 telefone:phone,
 carro:carro,
 ultimo_assunto:assunto
 })

}

/* =======================
BUSCAR PRODUTO
======================= */

async function buscarProduto(termo){

 const { data } = await supabase
 .from("produtos")
 .select("produto,preco,categoria")
 .or(`produto.ilike.%${termo}%,categoria.ilike.%${termo}%`)
 .limit(5)

 return data || []

}

/* =======================
FORMATAR PRODUTO
======================= */

function formatarProdutos(lista){

 if(lista.length===0) return null

 let resposta="🔧 PRODUTOS ENCONTRADOS\n\n"

 lista.forEach(p=>{

 resposta+=`${p.produto}\n`
 resposta+=`💰 R$ ${p.preco}\n\n`

 })

 resposta+="Deseja instalar na PerfectLub?"

 return resposta

}

/* =======================
MENU
======================= */

function menu(){

 return `Olá 👋

Sou o Lubi da PerfectLub.

Como posso ajudar?

1️⃣ Troca de óleo
2️⃣ Orçamento de peça
3️⃣ Diagnóstico
4️⃣ Endereço`

}

/* =======================
WEBHOOK
======================= */

app.post("/whatsapp", async (req,res)=>{

 const mensagem=req.body.Body?.toLowerCase()||""
 const phone=req.body.From

 const twiml=new MessagingResponse()

 let resposta=""

 const contexto=await buscarContexto(phone)

/* SAUDAÇÃO */

 if(mensagem.includes("oi") || mensagem.includes("bom dia")){

 resposta=menu()

 }

/* TROCA OLEO */

 else if(mensagem==="1" || mensagem.includes("oleo")){

 resposta=`🔧 Troca de óleo

Me diga:

marca modelo ano

Ex:
Onix 2013`

 await salvarContexto(phone,null,"oleo")

 }

/* CLIENTE ENVIOU CARRO */

 else if(mensagem.includes("onix") || mensagem.includes("gol") || mensagem.includes("hb20")){

 await salvarContexto(phone,mensagem,"oleo")

 resposta=`Perfeito 👍

Para ${mensagem} recomendamos:

Óleo 5W30 Dexos
Filtro de óleo

Deseja orçamento completo?`

 }

/* BUSCA PRODUTO */

 else{

 const produtos=await buscarProduto(mensagem)

 const respostaProduto=formatarProdutos(produtos)

 if(respostaProduto){

 resposta=respostaProduto

 }

 else{

 resposta="Pode me explicar melhor o que você precisa?"

 }

 }

 twiml.message(resposta)

 res.type("text/xml")
 res.send(twiml.toString())

})

/* =======================
SERVIDOR
======================= */

app.get("/",(req,res)=>{

 res.send("Servidor PerfectLub rodando")

})

app.listen(PORT,()=>{

 console.log("Servidor rodando")

})
