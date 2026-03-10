require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { OpenAI } = require('openai');
const { MessagingResponse } = require('twilio').twiml;

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 1. IA PESQUISADORA (Agora busca Ficha Técnica Detalhada)
async function pesquisarDadosDetalhados(veiculo) {
    try {
        const prompt = `Você é o Lubi, especialista da PerfectLub. 
        O cliente informou: ${veiculo}.
        Retorne um JSON com a ficha técnica exata para troca de óleo:
        {
          "modelo_exato": "ex: Honda Civic G10 2.0 i-VTEC",
          "ano": "2017/2018",
          "motor": "2.0 16V Flex",
          "potencia": "155 cv",
          "litros": 4.2,
          "viscosidade": "0W20",
          "filtro_oleo": "PSL55",
          "filtro_ar": "FAP2827"
        }
        Seja extremamente preciso com a motorização.`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" }
        });

        return JSON.parse(response.choices[0].message.content);
    } catch (e) { return null; }
}

// 2. LÓGICA DE RESPOSTA DO LUBI
async function gerarResposta(msg) {
    const texto = msg.toLowerCase().trim();
    const nomeBot = "*Lubi*"; 

    // A. SAUDAÇÕES
    const saudacoes = ["oi", "ola", "olá", "bom dia", "boa tarde", "boa noite", "opa"];
    if (saudacoes.includes(texto)) {
        return `Olá! Eu sou o ${nomeBot}, seu consultor técnico na *PerfectLub* 🚗💨\n\nPara um orçamento preciso, me mande o *modelo e ano* do seu carro!`;
    }

    // B. IDENTIFICAÇÃO E ORÇAMENTO DETALHADO
    const ficha = await pesquisarDadosDetalhados(msg);
    if (!ficha || !ficha.litros) return `Não identifiquei os detalhes desse modelo. Pode confirmar o ano e motor?`;

    try {
        // Busca Óleo no Estoque
        const { data: oleos } = await supabase.from('produtos').select('produto, preco').ilike('produto', `%${ficha.viscosidade}%`).ilike('produto', '%1L%').order('preco', { ascending: true }).limit(1);
        
        // Busca Filtro de Óleo
        const { data: fOleo } = await supabase.from('produtos').select('produto, preco').ilike('produto', `%${ficha.filtro_oleo}%`).limit(1);

        // Busca Mão de Obra
        const { data: mo } = await supabase.from('produtos').select('preco').ilike('produto', '%mão de obra%').limit(1);

        if (oleos?.length > 0) {
            const vLitro = parseFloat(oleos[0].preco.toString().replace(",", "."));
            const vMO = mo?.length > 0 ? parseFloat(mo[0].preco.toString().replace(",", ".")) : 70;
            const vFO = fOleo?.length > 0 ? parseFloat(fOleo[0].preco.toString().replace(",", ".")) : 35;

            const totalBase = (vLitro * ficha.litros) + vFO + vMO;

            return `✅ *ORÇAMENTO TÉCNICO PERFECTLUB*\n\n` +
                   `🚘 *Veículo:* ${ficha.modelo_exato}\n` +
                   `📅 *Ano:* ${ficha.ano}\n` +
                   `⚙️ *Motor:* ${ficha.motor} (${ficha.potencia})\n` +
                   `📏 *Capacidade:* ${ficha.litros} Litros\n\n` +
                   `--- *VALORES ESTIMADOS* ---\n` +
                   `🛢️ *Óleo (${ficha.viscosidade}):* R$ ${(vLitro * ficha.litros).toFixed(2)}\n` +
                   `⚙️ *Filtro de Óleo:* R$ ${vFO.toFixed(2)}\n` +
                   `🔧 *Mão de Obra:* R$ ${vMO.toFixed(2)}\n\n` +
                   `💰 *TOTAL: R$ ${totalBase.toFixed(2)}*\n\n` +
                   `⚠️ *Para validar o chassi e garantir estas peças, por favor, me informe a PLACA do veículo.*`;
        }
        return `Achei os dados para o ${ficha.modelo_exato}, mas não temos o óleo ${ficha.viscosidade} em estoque hoje.`;
    } catch (err) {
        return "Erro ao consultar o sistema. Um consultor físico vai te atender agora!";
    }
}

// 4. ROTAS
app.get('/', (req, res) => res.send('Lubi Especialista Online!'));
app.post('/whatsapp', async (req, res) => {
    const twiml = new MessagingResponse();
    twiml.message(await gerarResposta(req.body.Body || ""));
    res.type('text/xml').send(twiml.toString());
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 O Lubi está rodando na porta ${PORT}`));
