require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { MessagingResponse } = require('twilio').twiml;

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// 1. CONEXÃO COM O SUPABASE
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// 2. TABELA TÉCNICA (Litragem e Filtros)
const catalogoTecnico = {
    "onix": { litros: 3.5, viscosidade: "5W30", filtroOleo: "PEL676" },
    "astra": { litros: 4.5, viscosidade: "5W30", filtroOleo: "PSL612" },
    "hb20": { litros: 3.6, viscosidade: "5W30", filtroOleo: "PSL152" },
    "corolla": { litros: 4.2, viscosidade: "5W30", filtroOleo: "PSL129" },
    "gol": { litros: 3.5, viscosidade: "5W40", filtroOleo: "PSL560" }
};

// 3. LÓGICA DE ORÇAMENTO
async function gerarOrcamento(textoCliente) {
    try {
        const msg = textoCliente.toLowerCase();
        let carro = null;

        for (let modelo in catalogoTecnico) {
            if (msg.includes(modelo)) {
                carro = { nome: modelo, ...catalogoTecnico[modelo] };
                break;
            }
        }

        if (!carro) return null;

        const { data: oleo } = await supabase.from('produtos').select('preco').ilike('produto', `%lubrax%${carro.viscosidade}%`).limit(1);
        const { data: filtro } = await supabase.from('produtos').select('preco').ilike('produto', `%${carro.filtroOleo}%`).limit(1);
        const { data: mo } = await supabase.from('produtos').select('preco').ilike('produto', '%mão de obra (troca de óleo)%').single();

        if (oleo?.length > 0 && filtro?.length > 0) {
            const vLitro = parseFloat(oleo[0].preco);
            const vFiltro = parseFloat(filtro[0].preco);
            const vMO = parseFloat(mo?.preco || 60);
            const total = (vLitro * carro.litros) + vFiltro + vMO;

            return `✅ *Orçamento PerfectLub: ${carro.nome.toUpperCase()}*\n\n` +
                   `🛢️ Óleo Lubrax (${carro.litros}L): R$ ${(vLitro * carro.litros).toFixed(2)}\n` +
                   `⚙️ Filtro de Óleo: R$ ${vFiltro.toFixed(2)}\n` +
                   `🔧 Mão de Obra: R$ ${vMO.toFixed(2)}\n\n` +
                   `💰 *TOTAL: R$ ${total.toFixed(2)}*`;
        }
        return null;
    } catch (e) { return null; }
}

// 4. ROTAS (O que o Render e o Twilio procuram)
app.get('/', (req, res) => res.send('Servidor PerfectLub Ativo!'));

app.post('/whatsapp', async (req, res) => {
    const msgCliente = req.body.Body || "";
    const twiml = new MessagingResponse();
    const orcamento = await gerarOrcamento(msgCliente);

    if (orcamento) {
        twiml.message(orcamento);
    } else {
        twiml.message("Olá! Para orçamentos, digite o modelo do seu carro (ex: Onix, Astra).");
    }
    res.type('text/xml').send(twiml.toString());
});
