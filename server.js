require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { MessagingResponse } = require('twilio').twiml;

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// 1. CONEXÃO COM O SUPABASE
// Certifique-se de que SUPABASE_URL e SUPABASE_KEY estão no Environment do Render
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// 2. TABELA TÉCNICA (O "Cérebro" para não alucinar)
const catalogoTecnico = {
    "onix": { litros: 3.5, viscosidade: "5W30", filtroOleo: "PEL676" },
    "astra": { litros: 4.5, viscosidade: "5W30", filtroOleo: "PSL612" },
    "hb20": { litros: 3.6, viscosidade: "5W30", filtroOleo: "PSL152" },
    "corolla": { litros: 4.2, viscosidade: "5W30", filtroOleo: "PSL129" },
    "gol": { litros: 3.5, viscosidade: "5W40", filtroOleo: "PSL560" }
};

// 3. FUNÇÃO DE CÁLCULO DE ORÇAMENTO
async function gerarOrcamento(textoCliente) {
    try {
        const msg = textoCliente.toLowerCase();
        let carro = null;

        // Identifica o carro na mensagem
        for (let modelo in catalogoTecnico) {
            if (msg.includes(modelo)) {
                carro = { nome: modelo, ...catalogoTecnico[modelo] };
                break;
            }
        }

        if (!carro) return null;

        // Busca Preço do Óleo (Ex: Lubrax 5W30)
        const { data: oleo } = await supabase
            .from('produtos')
            .select('preco')
            .ilike('produto', `%lubrax%${carro.viscosidade}%`)
            .limit(1);

        // Busca Preço do Filtro de Óleo
        const { data: filtro } = await supabase
            .from('produtos')
            .select('produto, preco')
            .ilike('produto', `%${carro.filtroOleo}%`)
            .limit(1);

        // Busca Mão de Obra (R$ 60,00 da sua planilha)
        const { data: mo } = await supabase
            .from('produtos')
            .select('preco')
            .ilike('produto', '%mão de obra (troca de óleo)%')
            .single();

        if (oleo?.length > 0 && filtro?.length > 0) {
            const vLitro = parseFloat(oleo[0].preco);
            const vFiltro = parseFloat(filtro[0].preco);
            const vMO = parseFloat(mo?.preco || 60);

            const totalOleo = vLitro * carro.litros;
            const totalGeral = totalOleo + vFiltro + vMO;

            return `✅ *Orçamento PerfectLub: ${carro.nome.toUpperCase()}*\n\n` +
                   `🛢️ Óleo Lubrax (${carro.litros}L): R$ ${totalOleo.toFixed(2)}\n` +
                   `⚙️ Filtro de Óleo: R$ ${vFiltro.toFixed(2)}\n` +
                   `🔧 Mão de Obra: R$ ${vMO.toFixed(2)}\n\n` +
                   `💰 *TOTAL: R$ ${totalGeral.toFixed(2)}*\n\n` +
                   `Deseja agendar o serviço?`;
        }
        return null;
    } catch (e) {
        console.error("Erro na busca:", e);
        return null;
    }
}

// 4. ROTA DO WEBHOOK (Onde o Twilio se conecta)
app.post('/whatsapp', async (req, res) => {
    const msgCliente = req.body.Body || "";
    const twiml = new MessagingResponse();

    const orcamento = await gerarOrcamento(msgCliente);

    if (orcamento) {
        twiml.message(orcamento);
    } else {
        // Se não for orçamento, ele responde de forma genérica (ou você liga sua IA aqui)
        twiml.message("Olá! Sou o assistente da PerfectLub. Para saber o valor da troca, digite o modelo do seu carro.");
    }

    res.type('text/xml').send(twiml.toString());
});

// Rota de teste para o Render não dar "Exited Early"
app.get('/', (req, res) => res.send('Servidor PerfectLub Ativo!'));

// 5. ESCUTA DA PORTA (Essencial para o Render)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
