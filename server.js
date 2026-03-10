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

// 2. IA PESQUISADORA (Onde a mágica acontece)
async function pesquisarFichaTecnica(carroCliente) {
    try {
        const prompt = `Você é um mecânico sênior da PerfectLub. O cliente quer trocar o óleo de: ${carroCliente}.
        Pesquise em manuais e fóruns técnicos e retorne APENAS um JSON:
        {
          "litros": quantidade_decimal,
          "viscosidade": "ex_5W30",
          "filtro_ref": "codigo_filtro_comum"
        }`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini", // Mais rápido e preciso para dados técnicos
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" }
        });

        return JSON.parse(response.choices[0].message.content);
    } catch (e) {
        console.error("Erro na pesquisa da IA:", e);
        return null;
    }
}

// 3. LÓGICA DE ORÇAMENTO
async function gerarOrcamento(msg) {
    // A IA descobre os dados do manual
    const ficha = await pesquisarFichaTecnica(msg);
    if (!ficha) return "Não consegui encontrar os dados técnicos para esse modelo. Pode conferir se o nome está correto?";

    try {
        // Busca óleo e filtro no seu estoque do Supabase
        const { data: oleo } = await supabase.from('produtos').select('produto, preco').ilike('produto', `%${ficha.viscosidade}%`).limit(1);
        const { data: filtro } = await supabase.from('produtos').select('produto, preco').ilike('produto', `%${ficha.filtro_ref}%`).limit(1);
        const { data: mo } = await supabase.from('produtos').select('preco').ilike('produto', '%mão de obra%').limit(1);

        if (oleo?.length > 0 && filtro?.length > 0) {
            const vLitro = parseFloat(oleo[0].preco.toString().replace(",", "."));
            const vFiltro = parseFloat(filtro[0].preco.toString().replace(",", "."));
            const vMO = mo?.length > 0 ? parseFloat(mo[0].preco.toString().replace(",", ".")) : 60;

            const total = (vLitro * ficha.litros) + vFiltro + vMO;

            return `✅ *Orçamento Técnico PerfectLub*\n\n` +
                   `🚗 Veículo: ${msg.toUpperCase()}\n` +
                   `📊 Ficha Técnica: ${ficha.litros}L (${ficha.viscosidade})\n\n` +
                   `🛢️ Óleo (${oleo[0].produto}): R$ ${(vLitro * ficha.litros).toFixed(2)}\n` +
                   `⚙️ Filtro (${ficha.filtro_ref}): R$ ${vFiltro.toFixed(2)}\n` +
                   `🔧 Mão de Obra: R$ ${vMO.toFixed(2)}\n\n` +
                   `💰 *TOTAL: R$ ${total.toFixed(2)}*`;
        }

        return `Identifiquei que o ${msg} usa ${ficha.litros}L de ${ficha.viscosidade} e filtro ${ficha.filtro_ref}, mas não achei esses itens exatos no meu estoque agora. Quer falar com um humano?`;
    } catch (err) {
        return "Tive um problema ao consultar meu banco de dados. Tente novamente!";
    }
}

// 4. ROTAS
app.post('/whatsapp', async (req, res) => {
    const twiml = new MessagingResponse();
    const resposta = await gerarOrcamento(req.body.Body || "");
    twiml.message(resposta);
    res.type('text/xml').send(twiml.toString());
});

app.get('/', (req, res) => res.send('Especialista PerfectLub Online!'));

// 5. PORTA
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Bot Pesquisador na porta ${PORT}`));
