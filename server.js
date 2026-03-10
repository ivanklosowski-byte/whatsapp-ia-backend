require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { OpenAI } = require('openai');
const { MessagingResponse } = require('twilio').twiml;

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// 1. CONEXÕES
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 2. IA PESQUISADORA (Consulta Manuais e Fóruns Técnicos)
async function pesquisarFichaTecnica(carroCliente) {
    try {
        const prompt = `Você é um mecânico sênior da PerfectLub. O cliente quer trocar o óleo de: ${carroCliente}.
        Pesquise em manuais técnicos e retorne APENAS um JSON:
        {
          "litros": quantidade_decimal,
          "viscosidade": "ex_5W30",
          "filtro_ref": "referencia_mercado_tecfil_ou_wega"
        }
        Importante: Se a mensagem for apenas uma saudação ou não for um carro, retorne {"erro": "nao_e_carro"}.`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" }
        });

        const ficha = JSON.parse(response.choices[0].message.content);
        return ficha.erro ? null : ficha;
    } catch (e) {
        return null;
    }
}

// 3. LÓGICA PRINCIPAL DE RESPOSTA
async function gerarResposta(msg) {
    const texto = msg.toLowerCase().trim();

    // A. FILTRO DE SAUDAÇÕES
    const saudacoes = ["oi", "ola", "olá", "bom dia", "boa tarde", "boa noite", "opa"];
    if (saudacoes.includes(texto)) {
        return "Olá! Sou o assistente da *PerfectLub* 🚗💨\n\nComo posso ajudar? Se precisar de um orçamento, mande o *modelo e ano do seu carro* (ex: Onix 2023).";
    }

    // B. BUSCA DIRETA DE PRODUTOS (Ex: "Tem Lubrax?", "Qual valor do 5w30?")
    if (texto.includes("valor") || texto.includes("preço") || texto.includes("tem") || texto.includes("quanto custa")) {
        const termoBusca = texto.replace(/qual|o|valor|do|dos|preço|quanto|custa|tem|temos/g, "").trim();
        if (termoBusca.length > 2) {
            const { data: produtos } = await supabase.from('produtos').select('produto, preco').ilike('produto', `%${termoBusca}%`).limit(5);
            if (produtos?.length > 0) {
                let lista = `🔎 *Itens em estoque para: ${termoBusca.toUpperCase()}*\n\n`;
                produtos.forEach(p => {
                    const preco = parseFloat(p.preco.toString().replace(",", ".")).toFixed(2);
                    lista += `▪️ ${p.produto}: *R$ ${preco}*\n`;
                });
                return lista;
            }
        }
    }

    // C. IDENTIFICAÇÃO TÉCNICA DO VEÍCULO
    const ficha = await pesquisarFichaTecnica(msg);
    if (!ficha) return "Não identifiquei o modelo. Poderia informar o veículo e o ano? Ex: 'Troca de óleo Honda HRV 2017'.";

    try {
        // Busca Óleo (Prioriza o mais barato/custo-benefício da viscosidade)
        const { data: oleos } = await supabase.from('produtos').select('produto, preco').ilike('produto', `%${ficha.viscosidade}%`).order('preco', { ascending: true }).limit(1);
        
        // Busca Filtro (Pela referência técnica)
        const { data: filtros } = await supabase.from('produtos').select('produto, preco').ilike('produto', `%${ficha.filtro_ref}%`).limit(1);

        // Mão de Obra
        const { data: mo } = await supabase.from('produtos').select('preco').ilike('produto', '%mão de obra%').limit(1);

        if (oleos?.length > 0) {
            const vLitro = parseFloat(oleos[0].preco.toString().replace(",", "."));
            const vMO = mo?.length > 0 ? parseFloat(mo[0].preco.toString().replace(",", ".")) : 70;
            const vFiltro = filtros?.length > 0 ? parseFloat(filtros[0].preco.toString().replace(",", ".")) : 0;

            const totalOleo = vLitro * ficha.litros;
            const totalGeral = totalOleo + vFiltro + vMO;

            let resposta = `✅ *Orçamento PerfectLub: ${msg.toUpperCase()}*\n\n` +
                           `📊 *Manual:* ${ficha.litros}L de óleo ${ficha.viscosidade}\n\n` +
                           `🛢️ *Óleo:* R$ ${totalOleo.toFixed(2)} (${oleos[0].produto})\n`;

            if (vFiltro > 0) {
                resposta += `⚙️ *Filtro:* R$ ${vFiltro.toFixed(2)} (${filtros[0].produto})\n`;
            } else {
                resposta += `⚙️ *Filtro (${ficha.filtro_ref}):* Sob consulta no balcão.\n`;
            }

            resposta += `🔧 *Mão de Obra:* R$ ${vMO.toFixed(2)}\n\n` +
                        `💰 *TOTAL ESTIMADO: R$ ${totalGeral.toFixed(2)}*\n\n` +
                        `Deseja agendar o serviço para hoje?`;
            return resposta;
        }
        return `Achei os dados (${ficha.litros}L de ${ficha.viscosidade}), mas não localizei esse óleo no estoque agora.`;
    } catch (err) {
        return "Erro ao acessar o banco de dados. Um consultor físico vai te chamar!";
    }
}

// 4. ROTAS
app.get('/', (req, res) => res.send('Servidor PerfectLub IA Ativo!'));

app.post('/whatsapp', async (req, res) => {
    const msgCliente = req.body.Body || "";
    const twiml = new MessagingResponse();
    const respostaFinal = await gerarResposta(msgCliente);
    twiml.message(respostaFinal);
    res.type('text/xml').send(twiml.toString());
});

// 5. PORTA
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Servidor Especialista rodando na porta ${PORT}`));
