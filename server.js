require("dotenv").config();
const express = require("express");
const { MessagingResponse } = require("twilio").twiml;
const { createClient } = require("@supabase/supabase-js");
const OpenAI = require("openai");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Configuração das conexões
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.post("/whatsapp", async (req, res) => {
    const incomingMsg = req.body.Body;
    const sender = req.body.From;
    const twiml = new MessagingResponse();

    try {
        // 1. MEMÓRIA: Recupera o contexto para não perguntar o carro duas vezes
        const { data: historico } = await supabase
            .from("historico_messages")
            .select("role, content")
            .eq("phone_number", sender)
            .order("created_at", { ascending: false })
            .limit(10);

        const contextoAnterior = historico?.reverse().map(h => ({
            role: h.role === 'assistant' ? 'assistant' : 'user',
            content: h.content
        })) || [];

        // 2. IA CONSULTORA: Age como o Ivan no balcão (Conhece manual e códigos)
        const aiResponse = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { 
                    role: "system", 
                    content: `Você é a Lubi, consultora técnica da PerfectLub em Ponta Grossa. 
                    Seu processo de venda:
                    1. Identificar o veículo.
                    2. Consultar o manual (seu conhecimento interno) para viscosidade, norma e litros.
                    3. Traduzir o pedido em termos de busca técnica (ex: '5W30', 'PSL55', 'W712').
                    4. Sugerir filtros de AR, COMBUSTÍVEL e CABINE.

                    Regra: Se não souber o carro, peça Modelo, Ano e Motor. Se souber, não pergunte de novo.
                    
                    Retorne APENAS JSON:
                    {
                        "resposta_tecnica": "Explicação sobre óleo, norma e litros",
                        "busca_oleo": "ex: 5W30",
                        "busca_filtro": "ex: PSL55",
                        "carro_confirmado": "ex: Onix 1.0 20
