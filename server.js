require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { MessagingResponse } = require('twilio').twiml;

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// 1. CONEXÃO COM O SUPABASE (Usa Variáveis de Ambiente do Render)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// 2. TABELA TÉCNICA (Evita alucinações e erros de litragem)
const catalogoTecnico = {
    "onix": { litros: 3.5, viscosidade: "5W30", filtroOleo: "PEL676", motor: "1.0/1.4" },
    "astra": { litros: 4.5, viscosidade: "5W30", filtroOleo: "PSL612", motor: "2.0" },
    "hb20": { litros: 3.6, viscosidade: "5W30", filtroOleo: "PSL152", motor: "1.0/1.6" },
    "corolla": { litros: 4.2, viscosidade: "5W30", filtroOleo: "PSL129", motor: "1.8/2.0" }
};

// 3. FUNÇÃO DE CÁLCULO DE ORÇAMENTO REAL
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

        // Busca Preço do Filtro de Óleo específico
        const { data: filtro } = await supabase
            .from('produtos')
            .select('produto, preco')
            .ilike('produto', `%${carro.filtroOleo}%`)
            .limit(1);

        // Busca Mão de Obra
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
                   `Posso agendar o seu serviço?`;
        }
        return null;
    } catch (e) {
        console.error("Erro na busca:", e);
        return null;
    }
}

// 4. ROTA DO WEBHOOK (Onde o Twilio envia a mensagem)
app.post('/whatsapp', async (req, res) => {
    const msgCliente = req.body.Body;
    const twiml = new MessagingResponse();

    // Tenta gerar orçamento pelo estoque primeiro
    const orcamento = await gerarOrcamento(msgCliente);

    if (orcamento) {
        twiml.message(orcamento);
    } else {
        // Se não for pedido de orçamento, aqui você chamaria a sua IA (OpenAI)
        twiml.message("Olá! Sou o assistente da PerfectLub. Para orçamentos, informe o modelo do carro.");
    }

    res.type('text/xml').send(twiml.toString());
});

// 5. INICIALIZAÇÃO DO SERVIDOR (Essencial para o Render não fechar)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando com sucesso na porta ${PORT}`);
});
