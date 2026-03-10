const { createClient } = require('@supabase/supabase-js');

// 1. Configuração de Conexão (Use as chaves que aparecem no seu painel do Supabase)
const supabaseUrl = 'SUA_URL_AQUI';
const supabaseKey = 'SUA_CHAVE_AQUI';
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Função de busca no banco de 1.314 itens
 * @param {string} textoCliente - O que o cliente escreveu no WhatsApp
 */
async function consultarPreco(textoCliente) {
    try {
        // Limpa o texto para focar no nome do produto
        const termoBusca = textoCliente.toLowerCase()
            .replace(/preço|valor|quanto|custa|vocês|têm/gi, '')
            .trim();

        if (termoBusca.length < 3) return null;

        // Consulta na tabela 'produtos' que você acabou de preencher
        const { data, error } = await supabase
            .from('produtos')
            .select('produto, preco')
            .ilike('produto', `%${termoBusca}%`) // Busca peças que contenham o nome digitado
            .limit(4); // Traz as 4 melhores opções

        if (error) throw error;

        if (data && data.length > 0) {
            const resposta = data.map(item => {
                // Se o preço na planilha for 0, pede para consultar o balcão
                const precoFormatado = (item.preco === "0" || !item.preco) 
                    ? "Consultar consultor" 
                    : `R$ ${item.preco}`;
                
                return `⚙️ *${item.produto.trim()}*\n💰 Preço: ${precoFormatado}`;
            }).join('\n\n');

            return `Encontrei estes itens na PerfectLub:\n\n${resposta}`;
        }

        return "Não encontrei esse item específico. Pode me dar mais detalhes ou o nome da marca?";

    } catch (err) {
        console.error("Erro ao acessar o banco de dados:", err);
        return "Tive um probleminha técnico ao consultar o estoque. Tente novamente.";
    }
}

// 2. Exemplo de como usar no seu bot de WhatsApp
/*
client.on('message', async (msg) => {
    // Gatilhos comuns para consulta de preço
    const gatilhos = ['preço', 'valor', 'quanto', 'tem'];
    const mensagem = msg.body.toLowerCase();

    if (gatilhos.some(g => mensagem.includes(g))) {
        const respostaEstoque = await consultarPreco(msg.body);
        if (respostaEstoque) {
            await msg.reply(respostaEstoque);
        }
    }
});
*/

module.exports = { consultarPreco };
