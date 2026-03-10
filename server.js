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

// 1. IA PESQUISADORA (Com trava de saudação)
async function pesquisarDadosDetalhados(veiculo) {
    const v = veiculo.toLowerCase().trim();
    // Se for saudação curta, nem chama a IA para economizar e não errar
    if (v.length < 4 || ["boa", "bom", "oi", "ola", "olá"].includes(v)) return { saudacao: true };

    try {
        const prompt = `Você é o Lubi da PerfectLub. O cliente diz: ${veiculo}.
        Se for um carro, retorne JSON:
        { "modelo": "ex: Civic", "litros": 4.2, "viscosidade": "0W20", "filtro": "PSL55" }
        Se for saudação ou placa, retorne { "tipo": "interacao" }.`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" }
        });

        return JSON.parse(response.choices[0].message.content);
    } catch (e) { return null; }
}

// 2. LÓGICA DE RESPOSTA
async function gerarResposta(msg) {
    const texto = msg.toLowerCase().trim();
    const nomeBot = "*Lubi*"; 

    // A. FILTRO DE SAUDAÇÕES (Reforçado)
    const saudacoes = ["oi", "ola", "olá", "bom dia", "boa tarde", "boa noite", "opa", "boa", "tudo bem"];
    if (saudacoes.includes(texto) || texto.length < 4) {
        return `Olá! Eu sou o ${nomeBot}, seu consultor na *PerfectLub* 🚗💨\n\nQual o modelo e ano do seu carro? (Ou mande a placa!)`;
    }

    const ficha = await pesquisarDadosDetalhados(msg);
    if (ficha?.tipo === "interacao") return `Legal! Me mande os detalhes do veículo ou a placa para eu consultar aqui!`;

    if (!ficha || !ficha.litros) return `Não entendi o modelo. Pode confirmar o ano e motor?`;

    try {
        // BUSCA DE ÓLEO MELHORADA (Tenta várias formas da viscosidade)
        const viscLimpa = ficha.viscosidade.replace(/[^a-zA-Z0-10]/g, ""); // "0W20"
        
        const { data: oleos } = await supabase.from('produtos')
            .select('produto, preco')
            .or(`produto.ilike.%${viscLimpa}%, produto.ilike.%${ficha.viscosidade}%`) // Tenta 0W20 ou 0W-20
            .ilike('produto', '%1L%')
            .order('preco', { ascending: true })
            .limit(1);
        
        const { data: fOleo } = await supabase.from('produtos').select('produto, preco').ilike('produto', `%${ficha.filtro}%`).limit(1);
        const { data: mo } = await supabase.from('produtos').select('preco').ilike('produto', '%mão de obra%').limit(1);

        if (oleos?.length > 0) {
            const vLitro = parseFloat(oleos[0].preco.toString().replace(",", "."));
            const vMO = mo?.length > 0 ? parseFloat(mo[0].preco.toString().replace(",", ".")) : 70;
            const vFO = fOleo?.length > 0 ? parseFloat(fOleo[0].preco.toString().replace(",", ".")) : 40;

            const total = (vLitro * ficha.litros) + vFO + vMO;

            return `✅ *ORÇAMENTO DO ${nomeBot.toUpperCase()}*\n\n` +
                   `🚘 *Veículo:* ${ficha.modelo}\n` +
                   `📏 *Capacidade:* ${ficha.litros}L de ${ficha.viscosidade}\n\n` +
                   `🛢️ *Óleo:* R$ ${(vLitro * ficha.litros).toFixed(2)} (${oleos[0].produto})\n` +
                   `⚙️ *Filtro:* R$ ${vFO.toFixed(2)}\n` +
                   `🔧 *Mão de Obra:* R$ ${vMO.toFixed(2)}\n\n` +
                   `💰 *TOTAL: R$ ${total.toFixed(2)}*`;
        }
        
        return `O ${nomeBot} viu que seu carro usa ${ficha.litros}L de ${ficha.viscosidade}, mas não achei esse óleo no sistema. Um consultor vai te passar o valor agora!`;
    } catch (err) {
        return "Erro no sistema. Aguarde um momento!";
    }
}

// ROTAS
app.get('/', (req, res) => res.send('Lubi v7 Online!'));
app.post('/whatsapp', async (req, res) => {
    const twiml = new MessagingResponse();
    twiml.message(await gerarResposta(req.body.Body || ""));
    res.type('text/xml').send(twiml.toString());
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Lubi v7 na porta ${PORT}`));
