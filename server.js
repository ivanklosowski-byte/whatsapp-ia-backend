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

// 1. IA PESQUISADORA (Refinada para o Estoque)
async function pesquisarDadosDetalhados(veiculo) {
    try {
        const prompt = `Você é o Lubi, especialista da PerfectLub. 
        O cliente informou: ${veiculo}.
        Retorne um JSON com a ficha técnica exata:
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
        Se for uma placa ou o usuário perguntar se verifica placa, responda {"placa_solicitada": true}.`;

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
        return `Olá! Eu sou o ${nomeBot}, seu consultor técnico na *PerfectLub* 🚗💨\n\nQual o modelo e ano do seu carro? (Ou me mande a *PLACA* que eu verifico os dados técnicos!)`;
    }

    const ficha = await pesquisarDadosDetalhados(msg);

    // B. TRATAMENTO DE PLACA (Finge que está buscando para o humano assumir)
    if (ficha?.placa_solicitada || texto.length === 7) {
        return `Legal! Estou consultando a placa no meu sistema técnico... 🔍\n\nEnquanto isso, você teria a quilometragem atual do veículo? Um consultor já vai confirmar o preço exato para você!`;
    }

    if (!ficha || !ficha.litros) return `Não identifiquei o modelo. Pode me dizer o ano e o motor?`;

    try {
        // BUSCA INTELIGENTE: Remove espaços e tenta achar a viscosidade no nome do produto
        const { data: oleos } = await supabase.from('produtos')
            .select('produto, preco')
            .ilike('produto', `%${ficha.viscosidade.replace(/\s/g, "")}%`) // Busca "0W20" ou "0W-20"
            .ilike('produto', '%1L%')
            .order('preco', { ascending: true })
            .limit(1);
        
        const { data: fOleo } = await supabase.from('produtos').select('produto, preco').ilike('produto', `%${ficha.filtro_oleo}%`).limit(1);
        const { data: mo } = await supabase.from('produtos').select('preco').ilike('produto', '%mão de obra%').limit(1);

        if (oleos?.length > 0) {
            const vLitro = parseFloat(oleos[0].preco.toString().replace(",", "."));
            const vMO = mo?.length > 0 ? parseFloat(mo[0].preco.toString().replace(",", ".")) : 70;
            const vFO = fOleo?.length > 0 ? parseFloat(fOleo[0].preco.toString().replace(",", ".")) : 35;

            const totalBase = (vLitro * ficha.litros) + vFO + vMO;

            return `✅ *ORÇAMENTO TÉCNICO PERFECTLUB*\n\n` +
                   `🚘 *Veículo:* ${ficha.modelo_exato}\n` +
                   `📅 *Ano:* ${ficha.ano} | *Motor:* ${ficha.motor}\n` +
                   `📏 *Capacidade:* ${ficha.litros} Litros\n\n` +
                   `--- *VALORES ESTIMADOS* ---\n` +
                   `🛢️ *Óleo (${ficha.viscosidade}):* R$ ${(vLitro * ficha.litros).toFixed(2)} (${oleos[0].produto})\n` +
                   `⚙️ *Filtro de Óleo:* R$ ${vFO.toFixed(2)}\n` +
                   `🔧 *Mão de Obra:* R$ ${vMO.toFixed(2)}\n\n` +
                   `💰 *TOTAL: R$ ${totalBase.toFixed(2)}*\n\n` +
                   `*Podemos agendar sua troca para hoje?*`;
        }
        
        // Se não achou no estoque, o Lubi tenta ser útil e não apenas dar erro
        return `O ${nomeBot} identificou que seu ${ficha.modelo_exato} usa ${ficha.litros}L de ${ficha.viscosidade}.\n\n⚠️ Estou com uma instabilidade para ver o preço desse óleo agora, mas temos em estoque! Um consultor vai te passar o valor em 1 minuto.`;
    } catch (err) {
        return "Tive um erro no sistema. Um consultor físico vai te atender agora!";
    }
}

// ROTAS
app.get('/', (req, res) => res.send('Lubi v6 Online!'));
app.post('/whatsapp', async (req, res) => {
    const twiml = new MessagingResponse();
    twiml.message(await gerarResposta(req.body.Body || ""));
    res.type('text/xml').send(twiml.toString());
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Lubi v6 rodando na porta ${PORT}`));
