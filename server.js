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

// 2. IA PESQUISADORA (Lubi consultando manuais e fóruns)
async function pesquisarRevisaoCompleta(carroCliente) {
    try {
        const prompt = `Você é o Lubi, consultor técnico especialista da PerfectLub. 
        O cliente quer trocar o óleo de: ${carroCliente}.
        Pesquise em manuais técnicos e retorne APENAS um JSON:
        {
          "litros": quantidade_decimal,
          "viscosidade": "ex_0W20",
          "filtro_oleo": "referencia_tecfil_wega",
          "filtro_ar": "referencia_filtro_ar",
          "filtro_cabine": "referencia_filtro_cabine"
        }
        Se a mensagem não for um carro ou for apenas saudação, retorne {"erro": "ignore"}.`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" }
        });

        const ficha = JSON.parse(response.choices[0].message.content);
        return ficha.litros ? ficha : null;
    } catch (e) { return null; }
}

// 3. LÓGICA DE RESPOSTA DO LUBI
async function gerarResposta(msg) {
    const texto = msg.toLowerCase().trim();
    const nomeBot = "*Lubi*"; 

    // A. SAUDAÇÕES
    const saudacoes = ["oi", "ola", "olá", "bom dia", "boa tarde", "boa noite", "opa", "tudo bem"];
    if (saudacoes.includes(texto)) {
        return `Olá! Eu sou o ${nomeBot}, seu assistente técnico aqui na *PerfectLub* 🚗💨\n\nComo posso te ajudar hoje? Se quiser um orçamento, me mande o *modelo e ano do seu carro*!`;
    }

    // B. BUSCA DIRETA (Ex: "Qual valor do óleo Lubrax?")
    if (texto.includes("valor") || texto.includes("preço") || texto.includes("tem") || texto.includes("quanto custa")) {
        const termoBusca = texto.replace(/qual|o|valor|do|dos|preço|quanto|custa|tem|temos/g, "").trim();
        if (termoBusca.length > 2) {
            const { data: produtos } = await supabase.from('produtos').select('produto, preco').ilike('produto', `%${termoBusca}%`).limit(5);
            if (produtos?.length > 0) {
                let lista = `🔎 *Lubi encontrou no estoque para: ${termoBusca.toUpperCase()}*\n\n`;
                produtos.forEach(p => {
                    const preco = parseFloat(p.preco.toString().replace(",", ".")).toFixed(2);
                    lista += `▪️ ${p.produto}: *R$ ${preco}*\n`;
                });
                return lista;
            }
        }
    }

    // C. IDENTIFICAÇÃO E ORÇAMENTO TÉCNICO
    const ficha = await pesquisarRevisaoCompleta(msg);
    if (!ficha) return `Ainda não identifiquei o modelo. Pode confirmar o veículo e o ano? Ex: Honda HRV 2017.`;

    try {
        // Busca Óleo (Custo-benefício 1L)
        const { data: oleos } = await supabase.from('produtos').select('produto, preco').ilike('produto', `%${ficha.viscosidade}%`).ilike('produto', '%1L%').order('preco', { ascending: true }).limit(1);
        
        // Busca Filtro de Óleo
        const { data: fOleo } = await supabase.from('produtos').select('produto, preco').ilike('produto', `%${ficha.filtro_oleo}%`).limit(1);

        // Busca Filtro de Ar (Oportunidade de Venda)
        const { data: fAr } = await supabase.from('produtos').select('produto, preco').ilike('produto', `%${ficha.filtro_ar}%`).limit(1);

        // Mão de Obra
        const { data: mo } = await supabase.from('produtos').select('preco').ilike('produto', '%mão de obra%').limit(1);

        if (oleos?.length > 0) {
            const vLitro = parseFloat(oleos[0].preco.toString().replace(",", "."));
            const vMO = mo?.length > 0 ? parseFloat(mo[0].preco
