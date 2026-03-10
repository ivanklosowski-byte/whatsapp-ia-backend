require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { OpenAI } = require('openai');
const { MessagingResponse } = require('twilio').twiml;

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// 1. CONEXÕES (Utilizando suas variáveis do Render)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 2. IA PESQUISADORA (Consulta Manuais e Fóruns Técnicos)
async function pesquisarFichaTecnica(carroCliente) {
    try {
        const prompt = `Você é um mecânico sênior da PerfectLub especialista em troca de óleo. 
        O cliente possui um: ${carroCliente}.
        Pesquise em manuais técnicos e retorne APENAS um JSON no formato abaixo:
        {
          "litros": quantidade_decimal,
          "viscosidade": "ex_5W30",
          "filtro_ref": "referencia_mercado_tecfil_ou_wega"
        }
        Importante: Para o campo "filtro_ref", use códigos de mercado como PEL676, PSL55, PSL129. Não use códigos originais de montadora.`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" }
        });

        const ficha = JSON.parse(response.choices[0].message.content);
        
        // Evita que a IA responda com placeholders se não souber o carro
        if (ficha.litros === "quantidade_decimal" || !ficha.litros) return null;
        
        return ficha;
    } catch (e) {
        console.error("Erro na pesquisa da IA:", e);
        return null;
    }
}

// 3. LÓGICA DE ORÇAMENTO E CONSULTA DE PREÇOS
async function gerarResposta(msg) {
    const texto = msg.toLowerCase();

    // A. SE FOR UMA PERGUNTA GERAL DE PREÇO
    if (texto.includes("valor") || texto.includes("preço") || texto.includes("quanto custa")) {
        const termoBusca = texto.replace(/qual|o|valor|do|dos|preço|quanto|custa/g, "").trim();
        
        if (termoBusca.length > 2) {
            const { data: produtos } = await supabase.from('produtos').select('produto, preco').ilike('produto', `%${termoBusca}%`).limit(5);

            if (produtos?.length > 0) {
                let lista = `🔎 *Itens encontrados para: ${termoBusca.toUpperCase()}*\n\n`;
                produtos.forEach(p => {
                    const precoFormatado = parseFloat(p.preco.toString().replace(",", ".")).toFixed(2);
                    lista += `▪️ ${p.produto}: R$ ${precoFormatado}\n`;
                });
                return lista;
            }
        }
        // Se a pergunta de preço for sobre um carro, a lógica continua para o passo B
    }

    // B. SE FOR IDENTIFICAÇÃO DE VEÍCULO
    const ficha = await pesquisarFichaTecnica(msg);
    if (!ficha) return "Olá! Sou o assistente da PerfectLub. Para orçamentos, informe o modelo e ano do carro. Para preços avulsos, pergunte ex: 'Qual valor do óleo 5w30?'";

    try {
        // Busca Óleo no Supabase (pela viscosidade)
        const { data: oleos } = await supabase.from('produtos').select('produto, preco').ilike('produto', `%${ficha.viscosidade}%`).limit(1);
        
        // Busca Filtro no Supabase (pela referência sugerida pela IA)
        const { data: filtros } = await supabase.from('produtos').select('produto, preco').ilike('produto', `%${ficha.filtro_ref}%`).limit(1);

        // Busca Mão de Obra
        const { data: mo } = await supabase.from('produtos').select('preco').ilike('produto', '%mão de obra%').limit(1);

        if (oleos?.length > 0) {
            const vLitro = parseFloat(oleos[0].preco.toString().replace(",", "."));
            const vMO = mo?.length > 0 ? parseFloat(mo[0].preco.toString().replace(",", ".")) : 60;
            const vFiltro = filtros?.length > 0 ? parseFloat(filtros[0].preco.toString().replace(",", ".")) : 0;

            const totalOleo = vLitro * ficha.litros;
            const totalGeral = totalOleo + vFiltro + vMO;

            let resposta = `✅ *Orçamento Técnico: ${msg.toUpperCase()}*\n\n` +
                           `📊 Dados do Manual: ${ficha.litros}L de óleo ${ficha.viscosidade}\n\n` +
                           `🛢️ Óleo (${oleos[0].produto}): R$ ${totalOleo.toFixed(2)}\n`;

            if (vFiltro > 0) {
                resposta += `⚙️ Filtro (${filtros[0].produto}): R$ ${vFiltro.toFixed(2)}\n`;
            } else {
                resposta += `⚙️ Filtro (${ficha.filtro_ref}): Sob consulta (não localizado no estoque imediato)\n`;
            }

            resposta += `🔧 Mão de Obra: R$ ${vMO.toFixed(2)}\n\n` +
                        `💰 *TOTAL ESTIMADO: R$ ${totalGeral.toFixed(2)}*\n\n` +
                        `Podemos agendar sua visita?`;
            
            return resposta;
        }

        return `Identifiquei que o ${msg} utiliza ${ficha.litros}L de ${ficha.viscosidade}, mas não localizei o preço deste óleo no sistema agora. Deseja falar com um atendente?`;

    } catch (err) {
        console.error("Erro no processamento:", err);
        return "Tive um problema ao consultar os preços. Um consultor físico já foi avisado e vai te chamar!";
    }
}

// 4. ROTAS DO SERVIDOR
app.get('/', (req, res) => res.send('Especialista PerfectLub Online!'));

app.post('/whatsapp', async (req, res) => {
    const msgCliente = req.body.Body || "";
    const twiml = new MessagingResponse();

    const respostaFinal = await gerarResposta(msgCliente);
    twiml.message(respostaFinal);

    res.type('text/xml').send(twiml.toString());
});

// 5. INICIALIZAÇÃO
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor Especialista rodando na porta ${PORT}`);
});
