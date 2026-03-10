require('dotenv').config();

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { OpenAI } = require('openai');
const { MessagingResponse } = require('twilio').twiml;

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

/* =====================================================
CONFIGURAÇÃO E VALIDAÇÃO
===================================================== */

const PORT = process.env.PORT || 10000;

if (!process.env.OPENAI_API_KEY) {
    console.error("ERRO: OPENAI_API_KEY não configurada");
    process.exit(1);
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    console.error("ERRO: Supabase não configurado");
    process.exit(1);
}

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

/* =====================================================
UTILS
===================================================== */

function normalizarTexto(texto) {
    return texto
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
}

const saudacoes = [
    "oi",
    "ola",
    "bom dia",
    "boa tarde",
    "boa noite",
    "opa",
    "e ai",
    "eae",
    "boa"
];

/* =====================================================
INTELIGÊNCIA (IA)
===================================================== */

async function analisarMensagem(msg) {

    const texto = normalizarTexto(msg);

    if (texto.length < 3 || saudacoes.includes(texto)) {
        return { tipo: "interacao" };
    }

    try {

        const prompt = `
Você é um especialista em lubrificação automotiva da PerfectLub.

Cliente escreveu: "${msg}"

Retorne JSON com:

{
 "modelo":"Civic G10",
 "modelo_exato":"Honda Civic 2.0 i-VTEC",
 "motor":"2.0 16V Flex",
 "potencia":"155 cv",
 "litros":4.2,
 "viscosidade":"0W20",
 "filtro":"PSL55",
 "tipo":"carro"
}

Se for apenas saudação ou conversa:

{ "tipo":"interacao" }

Se for placa:

{ "tipo":"placa" }

Retorne SOMENTE JSON.
`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: "Especialista em manutenção automotiva brasileira."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            response_format: { type: "json_object" },
        
        });

        return JSON.parse(response.choices[0].message.content);

    } catch (err) {

        console.error("Erro IA:", err.message);
        return null;

    }

}

/* =====================================================
ORÇAMENTO
===================================================== */

async function calcularOrcamento(ficha) {

    try {

        const visc = ficha.viscosidade.replace(/[^a-zA-Z0-9]/g, "");

        const { data: oleos } = await supabase
            .from('produtos')
            .select('produto, preco')
            .or(`produto.ilike.%${visc}%,produto.ilike.%${ficha.viscosidade}%`)
            .ilike('produto', '%1L%')
            .order('preco', { ascending: true })
            .limit(1);

        const { data: filtros } = await supabase
            .from('produtos')
            .select('produto, preco')
            .ilike('produto', `%${ficha.filtro}%`)
            .limit(1);

        const { data: mao } = await supabase
            .from('produtos')
            .select('preco')
            .ilike('produto', '%mão de obra%')
            .limit(1);

        if (!oleos || oleos.length === 0) return null;

        const vLitro = parseFloat(
            oleos[0].preco.toString().replace(",", ".")
        );

        const vFiltro = filtros?.length
            ? parseFloat(filtros[0].preco.toString().replace(",", "."))
            : 40;

        const vMO = mao?.length
            ? parseFloat(mao[0].preco.toString().replace(",", "."))
            : 70;

        const totalOleo = vLitro * ficha.litros;

        const total = totalOleo + vFiltro + vMO;

        return {
            oleo: oleos[0].produto,
            totalOleo,
            valorFiltro: vFiltro,
            valorMO: vMO,
            total
        };

    } catch (err) {

        console.error("Erro orçamento:", err.message);
        return null;

    }

}

/* =====================================================
CONTROLLER WHATSAPP
===================================================== */

app.post('/whatsapp', async (req, res) => {

    const twiml = new MessagingResponse();

    try {

        const msg = (req.body.Body || "").trim();

        console.log("Mensagem recebida:", msg);

        if (!msg) {

            twiml.message(
                "Não consegui entender sua mensagem. Pode tentar novamente?"
            );

            return res.type('text/xml').send(twiml.toString());
        }

        const ficha = await analisarMensagem(msg);

        if (!ficha || ficha.tipo === "interacao") {

            twiml.message(
`Olá! Eu sou o *Lubi* da PerfectLub 🚗

Me diga:

• modelo e ano do carro
ou
• envie a placa

Que eu calculo a troca de óleo para você.`
            );

            return res.type('text/xml').send(twiml.toString());
        }

        if (ficha.tipo === "placa") {

            twiml.message(
                "Recebi a placa. Vou consultar os dados do veículo. Um momento."
            );

            return res.type('text/xml').send(twiml.toString());
        }

        const orcamento = await calcularOrcamento(ficha);

        if (!orcamento) {

            twiml.message(
`Seu veículo utiliza ${ficha.litros}L de ${ficha.viscosidade}.

Mas não encontrei esse óleo no sistema agora.

Um consultor da PerfectLub irá verificar para você.`
            );

            return res.type('text/xml').send(twiml.toString());
        }

        const resposta =
`✅ *ORÇAMENTO PERFECTLUB*

🚘 Veículo: ${ficha.modelo_exato}

🔧 Motor: ${ficha.motor}
⚡ Potência: ${ficha.potencia}

📏 Capacidade: ${ficha.litros}L
🛢️ Óleo: ${ficha.viscosidade}

🛢️ Óleo: R$ ${orcamento.totalOleo.toFixed(2)}
⚙️ Filtro: R$ ${orcamento.valorFiltro.toFixed(2)}
🔧 Mão de obra: R$ ${orcamento.valorMO.toFixed(2)}

💰 *TOTAL: R$ ${orcamento.total.toFixed(2)}*

Deseja agendar a troca?`;

        twiml.message(resposta);

        console.log("Resposta enviada");

        res.type('text/xml').send(twiml.toString());

    } catch (err) {

        console.error("Erro geral:", err);

        twiml.message(
            "O sistema está temporariamente indisponível. Tente novamente em alguns instantes."
        );

        res.type('text/xml').send(twiml.toString());

    }

});

/* =====================================================
ROTAS DE MONITORAMENTO
===================================================== */

app.get('/', (req, res) => {
    res.send("🚀 Lubi PerfectLub Online");
});

app.get('/health', (req, res) => {
    res.json({ status: "ok", service: "lubi-bot" });
});

/* =====================================================
START SERVER
===================================================== */

app.listen(PORT, () => {
    console.log(`🚀 Lubi rodando na porta ${PORT}`);
});
