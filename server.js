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

// 2. FUNÇÃO DE PESQUISA TÉCNICA (IA CONSULTANDO MANUAIS)
async function pesquisarDadosTecnicos(carroCliente) {
    try {
        const prompt = `Você é um mecânico especialista. O cliente quer trocar o óleo de um: ${carroCliente}.
        Pesquise em manuais técnicos e responda APENAS um JSON:
        {
          "litros": quantidade_em_litros,
          "viscosidade": "ex_5W30",
          "filtro_ref": "codigo_comum_do_filtro"
        }`;

        const response = await openai.chat.completions.create({
            model: "gpt-4-turbo-preview", 
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" }
        });

        return JSON.parse(response.choices[0].message.content);
    } catch (e) {
        console.error("Erro na pesquisa IA:", e);
        return null;
    }
}

// 3. FUNÇÃO DE ORÇAMENTO COM CONSULTA AO SUPABASE
async function gerarOrcamento(msg) {
    // Passo 1: A IA descobre o que o carro precisa (Litragem/Viscosidade/Filtro)
    const ficha = await pesquisarDadosTecnicos(msg);
    if (!ficha) return "Não consegui encontrar os dados técnicos desse carro. Pode me confirmar o modelo?";

    try {
        // Passo 2: Busca o óleo no seu Supabase baseado na viscosidade que a IA achou
        const { data: oleo } = await supabase.from('produtos').select('produto, preco').ilike('produto', `%${ficha.viscosidade}%`).limit(1);
        
        // Passo 3: Busca o filtro no seu Supabase pela referência que a IA achou
        const { data: filtro } = await supabase.from('produtos').select('produto, preco').ilike('produto', `%${ficha.filtro_ref}%`).limit(1);

        // Passo 4: Busca Mão de Obra
        const { data: mo } = await supabase.from('produtos').select('preco').ilike('produto', '%mão de obra%').single();

        if (oleo?.length > 0 && filtro?.length > 0) {
            const vLitro = parseFloat(oleo[0].preco.toString().replace(",", "."));
            const vFiltro = parseFloat(filtro[0].preco.toString().replace(",", "."));
            const vMO = mo ? parseFloat(mo.preco.toString().replace(",", ".")) : 60;

            const total = (vLitro * ficha.litros) + vFiltro + vMO;

            return `✅ *Orçamento Técnico PerfectLub*\n\n` +
                   `🚗 Veículo: ${msg.toUpperCase()}\n` +
                   `📊 Dados do Manual: ${ficha.litros}L de óleo ${ficha.viscosidade}\n\n` +
                   `🛢️ Óleo (${oleo[0].produto}): R$ ${(vLitro * ficha.litros).toFixed(2)}\n` +
                   `⚙️ Filtro (${ficha.filtro_ref}): R$ ${vFiltro.toFixed(2)}\n` +
                   `🔧 Mão de Obra: R$ ${vMO.toFixed(2)}\n\n` +
                   `💰 *TOTAL: R$ ${total.toFixed(2)}*`;
        }

        return `Identifiquei que o ${msg} usa ${ficha.litros}L de ${ficha.viscosidade} e filtro ${ficha.filtro_ref}, mas não localizei esses itens no meu sistema agora. Quer falar com um consultor?`;
    } catch (err) {
        return "Erro ao consultar preços. Tente novamente em instantes.";
    }
}

// 4. ROTAS
app.post('/whatsapp', async (req, res) => {
    const twiml = new MessagingResponse();
    const resposta = await gerarOrcamento(req.body.Body);
    twiml.message(resposta);
    res.type('text/xml').send(twiml.toString());
});

app.get('/', (req, res) => res.send('Especialista PerfectLub Ativo!'));

// 5. PORTA
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Bot Pesquisador rodando na porta ${PORT}`));
