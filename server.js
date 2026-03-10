require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { MessagingResponse } = require('twilio').twiml;

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// 1. CONEXÃO COM O NOME EXATO DO SEU PRINT NO RENDER
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY; // <--- Nome corrigido aqui

// Validação para o log do Render te avisar se algo sumir
if (!supabaseUrl || !supabaseKey) {
    console.error("ERRO CRÍTICO: Verifique se SUPABASE_URL e SUPABASE_ANON_KEY estão no Environment do Render!");
}

const supabase = createClient(supabaseUrl, supabaseKey);

// 2. TABELA TÉCNICA (Cérebro da PerfectLub)
const catalogoTecnico = {
    "onix": { litros: 3.5, viscosidade: "5W30", filtroOleo: "PEL676" },
    "astra": { litros: 4.5, viscosidade: "5W30", filtroOleo: "PSL612" },
    "hb20": { litros: 3.6, viscosidade: "5W30", filtroOleo: "PSL152" },
    "corolla": { litros: 4.2, viscosidade: "5W30", filtroOleo: "PSL129" },
    "gol": { litros: 3.5, viscosidade: "5W40", filtroOleo: "PSL560" }
};

// 3. FUNÇÃO DE ORÇAMENTO (Consulta sua planilha de 1.314 itens)
async function gerarOrcamento(textoCliente) {
    try {
        const msg = textoCliente.toLowerCase();
        let carro = null;

        // Identifica o carro
        for (let modelo in catalogoTecnico) {
            if (msg.includes(modelo)) {
                carro = { nome: modelo, ...catalogoTecnico[modelo] };
                break;
            }
        }

        if (!carro) return null;

        // Busca Óleo Lubrax 5W30 (ou a viscosidade do carro)
        const { data: oleo } = await supabase
            .from('produtos')
            .select('preco')
            .ilike('produto', `%lubrax%${carro.viscosidade}%`)
            .limit(1);

        // Busca Filtro pelo Código Técnico
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
                   `Deseja agendar o serviço?`;
        }
        return "Encontrei o carro, mas não localizei o preço de um dos itens. Um consultor vai te chamar!";
    } catch (e) {
        console.error("Erro no orçamento:", e);
        return null;
    }
}

// 4. ROTAS DO WEBHOOK
app.get('/', (req, res) => res.send('Servidor PerfectLub Online!'));

app.post('/whatsapp', async (req, res) => {
    const msgCliente = req.body.Body || "";
    const twiml = new MessagingResponse();

    const orcamento = await gerarOrcamento(msgCliente);

    if (orcamento) {
        twiml.message(orcamento);
    } else {
        // Se não for orçamento, responde com instrução
        twiml.message("Olá! Sou o assistente da PerfectLub. Para saber o valor da troca, informe o modelo do carro (ex: Onix, Astra, Gol).");
    }

    res.type('text/xml').send(twiml.toString());
});

// 5. ESCUTA DA PORTA (Configurada para o Render)
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor PerfectLub rodando na porta ${PORT}`);
});
