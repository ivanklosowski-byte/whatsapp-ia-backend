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
if (!process.env.OPENAI_API_KEY || !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
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
    const prompt = `Você é especialista em lubrificação automotiva brasileira. Cliente escreveu: "${msg}". 
    Se for um veículo, retorne obrigatoriamente este JSON: 
    {"modelo":"ex","modelo_exato":"ex","motor":"ex","potencia":"ex","litros":4.0,"viscosidade":"
