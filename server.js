const { createClient } = require('@supabase/supabase-js');

// 1. CONEXÃO COM O SUPABASE
const supabaseUrl = process.env.SUPABASE_URL || 'SUA_URL_AQUI';
const supabaseKey = process.env.SUPABASE_KEY || 'SUA_CHAVE_AQUI';
const supabase = createClient(supabaseUrl, supabaseKey);

// 2. TABELA TÉCNICA (O Cérebro do Bot)
// Podes adicionar mais carros aqui seguindo o mesmo padrão
const catalogoTecnico = {
    "onix": { litros: 3.5, viscosidade: "5W30", filtroOleo: "PEL676", filtroAr: "ARL8830", combustivel: "GI04/7" },
    "astra": { litros: 4.5, viscosidade: "5W30", filtroOleo: "PSL612", filtroAr: "ARL8825", combustivel: "GI04/7" },
    "hb20": { litros: 3.6, viscosidade: "5W30", filtroOleo: "PSL152", filtroAr: "ARL2340", combustivel: "GI50/7" },
    "corolla": { litros: 4.2, viscosidade: "5W30", filtroOleo: "PSL129", filtroAr: "ARL2203", combustivel: "GI04/7" },
    "gol": { litros: 3.5, viscosidade: "5W40", filtroOleo: "PSL560", filtroAr: "ARL6079", combustivel: "GI04/7" }
};

/**
 * 3. FUNÇÃO PRINCIPAL DE ORÇAMENTO
 */
async function consultarOrcamento(mensagem) {
    try {
        const texto = mensagem.toLowerCase();
        
        // Identifica o carro na mensagem
        let carro = null;
        for (let modelo in catalogoTecnico) {
            if (texto.includes(modelo)) {
                carro = { nome: modelo, ...catalogoTecnico[modelo] };
                break;
            }
        }

        if (!carro) {
            return "Poderia informar o modelo e motor do carro? (Ex: Onix 1.0, Astra 2.0)";
        }

        // Define a marca de óleo preferida (Padrão: Lubrax)
        let marcaOleo = "lubrax";
        if (texto.includes("shell")) marcaOleo = "shell";
        if (texto.includes("petronas")) marcaOleo = "petronas";

        // BUSCA NO SUPABASE (Preço do Litro)
        const { data: prodOleo } = await supabase
            .from('produtos')
            .select('produto, preco')
            .ilike('produto', `%${marcaOleo}%${carro.viscosidade}%`)
            .limit(1);

        // BUSCA NO SUPABASE (Preço do Filtro de Óleo)
        const { data: prodFiltro } = await supabase
            .from('produtos')
            .select('produto, preco')
            .ilike('produto', `%${carro.filtroOleo}%`)
            .limit(1);

        // BUSCA NO SUPABASE (Mão de Obra)
        const { data: mo } = await supabase
            .from('produtos')
            .select('preco')
            .ilike('produto', '%mão de obra (troca de óleo)%')
            .single();

        if (prodOleo && prodOleo.length > 0 && prodFiltro && prodFiltro.length > 0) {
            const valorLitro = parseFloat(prodOleo[0].preco);
            const valorFiltro = parseFloat(prodFiltro[0].preco);
            const valorMO = parseFloat(mo.preco || 60);

            const totalOleo = valorLitro * carro.litros;
            const totalGeral = totalOleo + valorFiltro + valorMO;

            let resposta = `✅ *Orçamento PerfectLub: ${carro.nome.toUpperCase()}*\n\n`;
            resposta += `🛢️ Óleo ${marcaOleo.toUpperCase()} (${carro.litros}L): R$ ${totalOleo.toFixed(2)}\n`;
            resposta += `⚙️ Filtro de Óleo (${carro.filtroOleo}): R$ ${valorFiltro.toFixed(2)}\n`;
            resposta += `🔧 Mão de Obra: R$ ${valorMO.toFixed(2)}\n\n`;
            resposta += `💰 *TOTAL: R$ ${totalGeral.toFixed(2)}*`;

            // Verifica se o cliente quer outros filtros
            if (texto.includes("completo") || texto.includes("ar")) {
                resposta += `\n\n_Deseja que eu calcule também os filtros de Ar e Combustível?_`;
            }

            return resposta;
        }

        return `Encontrei o ${carro.nome}, mas não localizei o preço de um dos itens no estoque. Gostaria de falar com um consultor?`;

    } catch (error) {
        console.error("Erro no processamento:", error);
        return "Tive um problema ao consultar o sistema. Um momento, por favor.";
    }
}

module.exports = { consultarOrcamento };
