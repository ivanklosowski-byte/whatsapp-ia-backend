const { createClient } = require('@supabase/supabase-js');

// Configuração do Supabase (Substitui pelos teus dados se ainda não tiveres)
const supabaseUrl = 'SUA_URL_DO_SUPABASE';
const supabaseKey = 'SUA_CHAVE_DO_SUPABASE';
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Função principal para consultar o banco de memória (Supabase)
 * @param {string} termo - O que o cliente digitou no WhatsApp
 */
async function consultarPreco(termo) {
    try {
        // Remove espaços extras e prepara a busca
        const busca = termo.trim();

        // Faz a consulta na tabela 'produtos' que criámos
        const { data, error } = await supabase
            .from('produtos')
            .select('produto, preco')
            .ilike('produto', `%${busca}%`) // Busca parcial e inteligente
            .limit(5); // Retorna até 5 opções para o cliente

        if (error) throw error;

        if (data && data.length > 0) {
            // Formata a lista de produtos encontrados
            const listaFormatada = data.map(item => {
                return `⚙️ *${item.produto.trim()}*\n💰 Preço: R$ ${item.preco.trim()}`;
            }).join('\n\n');

            return `Encontrei estes itens no meu estoque:\n\n${listaFormatada}`;
        } else {
            return "Não encontrei esse produto no catálogo. Queres que eu verifique com um consultor humano?";
        }

    } catch (err) {
        console.error("Erro na consulta ao Supabase:", err.message);
        return "Desculpa, tive um problema ao consultar a tabela de preços. Tenta novamente em instantes.";
    }
}

// Exemplo de como usar esta função dentro do teu bot (WhatsApp-IA):
/*
 client.on('message', async (msg) => {
    if (msg.body.toLowerCase().startsWith('preço') || msg.body.toLowerCase().startsWith('valor')) {
        const produtoParaBuscar = msg.body.replace(/preço|valor/gi, '').trim();
        const resposta = await consultarPreco(produtoParaBuscar);
        msg.reply(resposta);
    }
 });
*/

module.exports = { consultarPreco };
