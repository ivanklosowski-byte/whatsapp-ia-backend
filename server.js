require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { OpenAI } = require('openai');
const { MessagingResponse } = require('twilio').twiml;

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const PORT = process.env.PORT || 10000;

// Validação de Configurações
if (!process.env.OPENAI_API_KEY || !process.env.SUPABASE_URL) {
  console.error("❌ Erro: Variáveis de ambiente faltando no Render!");
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* --- UTILITÁRIOS --- */
function normalizar(texto) {
  return texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function detectarPlaca(texto) {
  const clean = texto.replace(/[^a-zA-Z0-9]/g, "");
  return /^[a-zA-Z]{3}[0-9][0-9a-zA-Z][0-9]{2}$/.test(clean);
}

/* --- INTELIGÊNCIA ARTIFICIAL --- */
async function analisarMensagem(msg) {
  console.log("🤖 Chamando OpenAI...");
  try {
    const prompt = `Você é especialista em lubrificação automotiva. Cliente: "${msg}". 
    Se for veículo, retorne JSON: {"modelo":"ex","modelo_exato":"ex","motor":"ex","potencia":"ex","litros":4.0,"viscosidade":"5W30","filtro":"PEL676","tipo":"carro"}. 
    Se não for, retorne: {"tipo":"interacao"}. Retorne APENAS JSON.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Expert em manutenção automotiva brasileira." },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" }
    });

    console.log("✅ OpenAI respondeu.");
    return JSON.parse(response.choices[0].message.content);
  } catch (err) {
    console.error("❌ Erro OpenAI:", err.message);
    return null;
  }
}

/* --- ORÇAMENTO --- */
async function calcularOrcamento(ficha) {
  console.log(`🔍 Buscando óleo ${ficha.viscosidade} no Supabase...`);
  try {
    const visc = ficha.viscosidade.replace(/[^a-zA-Z0-9]/g, "");
    
    // Busca Óleo
    const { data: oleos, error: errOleo } = await supabase
      .from("produtos")
      .select("produto, preco")
      .or(`produto.ilike.%${visc}%,produto.ilike.%${ficha.viscosidade}%`)
      .ilike("produto", "%1L%")
      .order("preco", { ascending: true })
      .limit(1);

    if (errOleo || !oleos?.length) {
      console.log("⚠️ Óleo não encontrado ou erro no banco.");
      return null;
    }

    // Busca Mão de Obra
    const { data: mao } = await supabase.from("produtos").select("preco").ilike("produto
