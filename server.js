require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { MessagingResponse } = require('twilio').twiml;

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// 1. CONEXÃO AJUSTADA (Usando os nomes EXATOS do seu print no Render)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY; // <--- Mudei aqui para bater com seu print

// Validação extra para o servidor não cair se a chave sumir
if (!supabaseUrl || !supabaseKey) {
    console.error("ERRO: SUPABASE_URL ou SUPABASE_ANON_KEY não encontradas no Render!");
}

const supabase = createClient(supabaseUrl, supabaseKey);

// 2. TABELA TÉCNICA (O "Cérebro" da PerfectLub)
const catalogoTecnico = {
    "onix": { litros: 3.5, viscosidade: "5W30", filtroOleo: "PEL676" },
    "astra": { litros: 4.5, viscosidade: "5W30", filtroOleo: "PSL612" },
    "hb20": { litros: 3.6, viscosidade: "5W30", filtroOleo: "PSL152" },
    "corolla": { litros: 4.2, viscosidade: "5W30", filtroOleo: "PSL129" },
    "gol": { litros: 3.5, viscosidade: "5W40", filtroOleo: "PSL560" }
};

// 3. FUNÇÃO DE ORÇAMENTO
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

        // Busca o óleo (Lubrax) e o Filtro no seu Supabase
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

// 4. ROTAS DO SERVIDOR
app.get('/', (req, res) => res.send('PerfectLub Online!'));

app.post('/whatsapp', async (req, res) => {
    const msgCliente = req.body.Body || "";
    const twiml = new MessagingResponse();
    const orcamento = await gerarOrcamento(msgCliente);

    if (orcamento) {
        twiml.message(orcamento);
    } else {
        twiml.message("Olá! Para saber o valor da troca, digite o modelo do seu carro (ex: Onix, Astra).");
    }
    res.type('text/xml').send(twiml.toString());
});

// 5. ESCUTA DA PORTA (Essencial para o Render)
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Servidor ouvindo na porta ${PORT}`);
});
