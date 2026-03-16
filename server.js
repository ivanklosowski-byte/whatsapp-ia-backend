require("dotenv").config();
const express = require("express");
const { MessagingResponse } = require("twilio").twiml;
const { createClient } = require("@supabase/supabase-js");
const OpenAI = require("openai");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.post("/whatsapp", async (req, res) => {
    const incomingMsg = req.body.Body;
    const sender = req.body.From;
    const twiml = new MessagingResponse();

    try {
        // 1. MEMÓRIA: Recupera o histórico para a Lubi não esquecer o carro do cliente
        const { data: historico } = await supabase
            .from("historico_messages")
            .select("role, content")
            .eq("phone_number", sender)
            .order("created_at", { ascending: false })
            .limit(10);

        const contextoAnterior = historico?.reverse().map(h => ({
            role: h.role === 'assistant' ? 'assistant' : 'user',
            content: h.content
        })) || [];

        // 2. IA ESPECIALISTA: Define a parte técnica e o que buscar no estoque
        const promptIA = [
            { 
                role: "system", 
                content: `Você é a Lubi, consultora técnica sênior da PerfectLub em Ponta Grossa.
                Sua missão é dar orçamentos educados e técnicos.

                FORMATO DE RESPOSTA:
                - Se souber o carro: Explique o óleo (viscosidade, norma tipo Dexos 1, litros).
                - Identifique o termo de busca para o banco (ex: "5W30" ou "Filtro Onix").
                - Se NÃO souber o carro: Peça educadamente o modelo, ano e motor.
                - NUNCA repita saudações como "Boa tarde" se já estiver no histórico.

                Retorne JSON: {"intro_tecnica": "string", "termo_busca": "string", "dica_especialista": "string", "carro_identificado": "string"}` 
            },
            ...contextoAnterior,
            { role: "user", content: incomingMsg }
        ];

        const aiResponse = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: promptIA,
            response_format: { type: "json_object" }
        });

        const analise = JSON.parse(aiResponse.choices[0].message.content);

        // 3. CONSULTA E CÁLCULO: Puxa preços reais e soma com a mão de obra
        let listaItens = "";
        let somaProdutos = 0;
        const maoDeObra = 70.00;

        if (analise.termo_busca) {
            const { data: produtos } = await supabase
                .from("produtos")
                .select("descricao, preco")
                .ilike("descricao", `%${analise.termo_busca}%`)
                .limit(3);

            if (produtos && produtos.length > 0) {
                produtos.forEach(p => {
                    listaItens += `🔧 ${p.descricao}: R$ ${p.preco.toLocaleString('pt-BR', {minimumFractionDigits: 2})}\n`;
                    somaProdutos += p.preco;
                });
            }
        }

        // 4. MONTAGEM DA RESPOSTA (IGUAL AO SEU MODELO APROVADO)
        let respostaFinal = "";
        
        if (!analise.termo_busca) {
            // Se ainda não temos o carro, apenas pede a informação
            respostaFinal = analise.intro_tecnica;
        } else {
            // Se já temos o carro, monta o orçamento completo
            const totalGeral = (somaProdutos + maoDeObra).toLocaleString('pt-BR', {minimumFractionDigits: 2});
            
            respostaFinal = `Boa tarde! Com certeza, para o seu ${analise.carro_identificado}, ${analise.intro_tecnica}\n\n` +
            `Fiz um levantamento aqui no nosso estoque agora e os valores ficam assim:\n` +
            `${listaItens}` +
            `🔧 Mão de obra especializada: R$ ${maoDeObra.toLocaleString('pt-BR', {minimumFractionDigits: 2})}\n\n` +
            `*Total aproximado: R$ ${totalGeral}*\n\n` +
            `*Dica de especialista:* ${analise.dica_especialista}\n\n` +
            `Temos horário livre para essa tarde aqui na oficina em Ponta Grossa. Vamos agendar?`;
        }

        // 5. SALVA NO HISTÓRICO PARA A PRÓXIMA MENSAGEM
        await supabase.from("historico_messages").insert([
            { phone_number: sender, role: 'user', content: incomingMsg },
            { phone_number: sender, role: 'assistant', content: respostaFinal }
        ]);

        twiml.message(respostaFinal);

    } catch (err) {
        console.error(err);
        twiml.message("Boa tarde! Para eu te passar o valor exato agora, poderia me dizer o modelo e ano do seu carro?");
    }

    res.writeHead(200, { "Content-Type": "text/xml" });
    res.end(twiml.toString());
});

app.listen(process.env.PORT || 10000);
