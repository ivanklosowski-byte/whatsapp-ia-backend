require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { OpenAI } = require('openai');
const { MessagingResponse } = require('twilio').twiml;

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// 1. CONEXÕES (Render Environment)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 2. IA PESQUISADORA (Busca em Manuais Técnicos)
async function pesquisarFichaTecnica(carroCliente) {
    try {
        const prompt = `Você é um mecânico sênior da PerfectLub especialista em manuais. 
        O cliente possui um: ${carroCliente}.
        PESQUISE RIGOROSAMENTE O MANUAL DO FABRICANTE E RETORNE APENAS JSON:
        {
          "litros": quantidade_decimal,
          "viscosidade": "viscosidade_exata_manual",
          "filtro_ref": "referencia_tecfil_ou_wega"
        }
        Atenção: Para Honda HR-V e carros modernos, verifique se é 0W20 ou 5W30 conforme o ano. 
        Se a mensagem for apenas saudação ou dúvida genérica, retorne {"erro": "nao_e_carro"}.`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" }
        });

        const ficha = JSON.parse(response.choices[0].message.content);
        return ficha.erro ? null : ficha;
    } catch (e) {
        console.error("Erro na pesquisa da IA:", e);
        return null;
    }
}

// 3. LÓGICA DE RESPOSTA E ORÇAMENTO
async function gerarResposta(msg) {
    const texto = msg.toLowerCase().trim();

    // A. FILTRO DE SAUDAÇÕES
    const saudacoes = ["oi", "ola", "olá", "bom dia", "boa tarde", "boa noite", "opa", "tudo bem"];
    if (saudacoes.includes(texto)) {
        return "Olá! Sou o assistente da *PerfectLub* 🚗💨\n\nComo posso ajudar? Se precisar de
