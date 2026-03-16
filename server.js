require("dotenv").config();
const express = require("express");
const { MessagingResponse } = require("twilio").twiml;
const { createClient } = require("@supabase/supabase-js");
const OpenAI = require("openai");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const PORT = process.env.PORT || 10000;

// Configuração dos Clientes
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.post("/whatsapp", async (req, res) => {
    const incomingMsg = req.body.Body;
    const sender = req.body.From; // Número do WhatsApp: whatsapp:+55...
    const twiml = new MessagingResponse();

    try {
        // 1. BUSCAR CONTEXTO DO CLIENTE (Para saber se já temos o carro dele)
        let { data: contexto } = await supabase
            .from("clientes_contexto")
            .select("*")
            .eq("telefone", sender)
            .single();

        // 2. IA ANALISA A MENSAGEM (Manual Técnico + Intenção)
        // Aqui a IA substitui sua tabela limitada de carros buscando no "conhecimento de manual" dela
        const promptIA = `
            Você é a Lubi, consultora técnica da PerfectLub.
            Contexto do Carro Atual: ${contexto?.carro || "Ainda não informado"}.
            Mensagem do Cliente: "${incomingMsg}"

            Sua tarefa:
            1. Se o cliente informou um carro, identifique (Marca, Modelo, Ano, Motor).
            2. Se o cliente quer óleo ou filtro, use seu conhecimento de manual para definir a VISCOSIDADE (ex: 5W30) ou CÓDIGO DE FILTRO.
            3. Responda APENAS em JSON:
            {
              "carro_identificado": "string ou null",
              "termo_busca_banco": "palavra-chave técnica para buscar na planilha de produtos",
              "resposta_direta": "frase curta de atendimento"
            }
        `;

        const aiResponse = await openai.chat.completions.create({
            model: "gpt-4o-mini", // Mais rápido e inteligente para JSON
            messages: [{ role
