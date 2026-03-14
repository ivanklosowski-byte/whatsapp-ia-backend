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

// Função para buscar veículo no banco
async function buscarVeiculo(marca, modelo, ano, motor) {
  const { data, error } = await supabase
    .from("veiculos")
    .select("*")
    .ilike("marca", `%${marca}%`)
    .ilike("modelo", `%${modelo}%`)
    .eq("ano", parseInt(ano))
    .ilike("motor", `%${motor}%`)
  
  if(error || data.length === 0) return null
  return data[0]
}

// Função para buscar produtos compatíveis
async function buscarProdutos(tipo, veiculoStr) {
  const { data, error } = await supabase
    .from("produtos")
    .select("*")
    .ilike("tipo", `%${tipo}%`)
    .ilike("compatibilidade_veiculos", `%${veiculoStr}%`)
    .limit(5)
  if(error || !data) return []
  return data
}

// Função para gerar respostas de IA (quando necessário)
async function responderIA(pergunta) {
  const resposta = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `
Você é o Lubi, consultor da PerfectLub Centro Automotivo.

Objetivo: converter conversa em serviço na oficina.

Regras:
- Nunca ensine o cliente a consertar o carro.
- Sempre incentive trazer o veículo para diagnóstico.
- Pergunte os dados básicos do veículo antes de informar valor.
- Se houver dúvida técnica, diga que um especialista da PerfectLub vai verificar.
- Quando cliente pedir troca de óleo, colete marca, modelo, ano, motor antes de indicar preço.
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

// Webhook WhatsApp
app.post("/whatsapp", async (req, res) => {
  const msg = req.body.Body.toLowerCase()
  const twiml = new MessagingResponse()

  let resposta = ""

  // Detecta se é pedido de troca de óleo
  if(msg.includes("troca de óleo") || msg.includes("troca de oleo") || msg.includes("oleo") || msg.includes("óleo")) {

    // Tenta extrair veículo direto da mensagem (simples)
    const regexVeiculo = /([a-z]+)\s+(\d{4})\s+([\d\.]+)/i
    const match = msg.match(regexVeiculo)

    if(match){
      const marca = match[1]
      const ano = match[2]
      const motor = match[3]
      const modelo = match[1] // se quiser separar modelo diferente da marca, ajustar aqui

      const veiculoStr = `${marca} ${modelo} ${ano} ${motor}`
      const veiculo = await buscarVeiculo(marca, modelo, ano, motor)

      if(!veiculo){
        resposta = `Não encontrei o veículo ${veiculoStr} no nosso banco. Pode confirmar marca, modelo, ano e motor?`
      } else {
        // Buscar produtos compatíveis
        const produtos = await buscarProdutos("óleo", veiculoStr)
        let listaProdutos = ""
        produtos.forEach(p => {
          listaProdutos += `• ${p.Descricao} 💰 R$ ${p["Preco Vista"]}\n`
        })

        resposta = `🔧 Troca de óleo PerfectLub\n\n`
        resposta += `Veículo: ${veiculo.marca} ${veiculo.modelo} ${veiculo.ano} ${veiculo.motor}\n`
        resposta += `Óleo recomendado: ${veiculo.oleo}\n`
        resposta += `Quantidade: ${veiculo.litros} litros\n\n`
        resposta += `Opções disponíveis:\n${listaProdutos}\nDeseja agendar a troca?`
      }

    } else {
      // Se não capturou veículo, pede dados
      resposta = `Para indicar o óleo e preço correto, preciso dos dados do veículo: marca, modelo, ano e motor.`
    }
  }
  else {
    // Resposta padrão IA
    resposta = await responderIA(msg)
  }

  twiml.message(resposta)
  res.writeHead(200, {"Content-Type": "text/xml"})
  res.end(twiml.toString())
})

app.listen(PORT, () => {
  console.log(`Servidor PerfectLub rodando ✅ na porta ${PORT}`)
})
