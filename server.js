const { createClient } = require('@supabase/supabase-js');

// 1. CONEXÃO COM O BANCO DE DADOS
// No Render, preencha estas variáveis em "Environment Variables" para maior segurança
const supabaseUrl = process.env.SUPABASE_URL || 'SUA_URL_DO_SUPABASE';
const supabaseKey = process.env.SUPABASE_KEY || 'SUA_CHAVE_DO_SUPABASE';
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * 2. FUNÇÃO DE BUSCA NO ESTOQUE (1.314 ITENS)
 */
async function consultarPrecoNoEstoque(mensagemCliente) {
    try {
        // Limpa o texto para focar apenas no produto (ex: "Filtro Astra")
        const busca = mensagemCliente.toLowerCase()
            .replace(/bom dia|boa tarde|olá|queria|saber|preço|valor|quanto|custa/gi, '')
            .trim();

        if (busca.length < 3) return null;

        const { data, error } = await supabase
            .from('produtos')
            .select('produto, preco')
            .ilike('produto', `%${busca}%`)
            .limit(4);

        if (error) throw error;

        if (data && data.length > 0) {
            const itens = data.map(item => {
                const precoLimpo = item.preco === "0" || !item.preco ? "Consultar Consultor" : `R$ ${item.preco}`;
                return `⚙️ *${item.produto.trim()}*\n💰 Preço: ${precoLimpo}`;
            }).join('\n\n');

            return `Encontrei estes itens na PerfectLub:\n\n${itens}`;
        }
        return null;
    } catch (err) {
        console.error("Erro Supabase:", err);
        return null;
    }
}

/**
 * 3. LÓGICA PRINCIPAL DO BOT (ONDE O TWILIO/WHATSAPP RECEBE)
 */
async function processarMensagemDoBot(msg) {
    const textoCliente = msg.body;

    // A PRIORIDADE É SEMPRE O SEU ESTOQUE
    // Se o cliente falar de preço ou peça, o bot consulta a "memória" primeiro
    const resultadoEstoque = await consultarPrecoNoEstoque(textoCliente);

    if (resultadoEstoque) {
        // Se achou na planilha, responde direto e para aqui
        return resultadoEstoque;
    }

    // Se NÃO achou na planilha, aqui entra a sua IA (OpenAI/Twilio)
    // Isso evita que a IA invente preços (alucinação)
    return "Não encontrei esse item exato no sistema. Gostaria de falar com um de nossos mecânicos para um orçamento personalizado?";
}

// Exporta para o seu sistema de rotas usar
module.exports = { consultarPrecoNoEstoque, processarMensagemDoBot };
