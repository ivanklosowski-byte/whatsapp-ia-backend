require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { OpenAI } = require('openai');
const { MessagingResponse } = require('twilio').twiml;

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// 1. CONEXÕES
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 2. SERVIÇO DE INTELIGÊNCIA (aiService integrado)
async function analisarMensagem(msg) {
    try {
        const prompt = `Você é o Lubi, consultor técnico da PerfectLub. O cliente diz: ${msg}.
        Retorne um JSON rigoroso com a ficha técnica:
        {
          "modelo": "ex: Civic G10",
          "modelo_exato": "Honda Civic 2.0 i-VTEC",
          "motor": "2.0 16V Flex",
          "potencia": "155 cv",
          "litros": 4.2,
          "viscosidade": "0W20",
          "filtro": "PSL55",
          "filtro_ar": "FAP2827",
          "tipo": "carro"
        }
        Se for uma placa ou pergunta sobre placa, mude "tipo" para "placa".
        Se for apenas saudação, mude "tipo" para "interacao".`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "system", content: "Especialista em lubrificação automotiva." }, 
                       { role: "user", content: prompt }],
            response_format: { type: "json_object" }
        });
        return JSON.parse(response.choices[0].message.content);
    } catch (e) { return null; }
}

// 3. SERVIÇO DE ORÇAMENTO (orcamentoService integrado)
async function calcularOrcamento(ficha) {
    try {
        // Busca Óleo (Tenta 0W20, 0W-20, etc)
        const { data: oleos } = await supabase.from('produtos')
            .select('produto, preco')
            .ilike('produto', `%${ficha.viscosidade.replace(/[^a-zA-Z0-9]/g, "")}%`)
            .ilike('produto', '%1L%')
            .order('preco', { ascending: true }).limit(1);

        const { data: filtros } = await supabase.from('produtos')
            .select('produto, preco')
            .ilike('produto', `%${ficha.filtro}%`).limit(1);

        const { data: mo } = await supabase.from('produtos')
            .select('preco')
            .ilike('produto', '%mão de obra%').limit(1);

        if (!oleos || oleos.length === 0) return null;

        const vLitro = parseFloat(oleos[0].preco.toString().replace(",", "."));
        const vFiltro = filtros?.length > 0 ? parseFloat(filtros[0].preco.toString().replace(",", ".")) : 40;
        const vMO = mo?.length > 0 ? parseFloat(mo[0].preco.toString().replace(",", ".")) : 70;

        return {
            nomeOleo: oleos[0].produto,
            totalOleo: vLitro * ficha.litros,
            valorFiltro: vFiltro,
            valorMO: vMO,
            total: (vLitro * ficha.litros) + vFiltro + vMO
        };
    } catch (e) { return null; }
}

// 4. CONTROLLER (Lógica de Mensagens)
app.post('/whatsapp', async (req, res) => {
    const msg = (req.body.Body || "").toLowerCase().trim();
    const twiml = new MessagingResponse();
    const saudacoes = ["oi", "ola", "olá", "bom dia", "boa tarde", "boa noite", "opa", "boa"];

    // A. SAUDAÇÕES
    if (saudacoes.includes(msg) ||
