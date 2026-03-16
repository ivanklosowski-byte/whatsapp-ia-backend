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
        // 1. MEMÓRIA: Recupera o que foi conversado antes para não repetir perguntas
        const { data: historico } = await supabase
            .from("historico_messages")
            .select("role, content")
            .eq("phone_number", sender)
            .order("created_at", { ascending: false })
            .limit(6);

        const contextoAnterior = historico?.reverse().map(h => ({
            role: h.role === 'assistant' ? 'assistant' : 'user',
            content: h.content
        })) || [];

        // 2. IA TÉCNICA: O "Manual do Mecânico"
        const promptIA = [
            { 
                role: "system", 
                content: `Você é o Lubi, consultor técnico sênior da PerfectLub. 
                Sua tarefa é identificar o carro e sugerir os produtos corretos.

                REGRAS DE OURO:
                - Se o carro (Modelo, Ano, Motor) não foi identificado no histórico ou agora, PEÇA ESSAS INFORMAÇÕES de forma educada.
                - Se você já sabe o carro, use seu conhecimento técnico para definir o óleo (ex: 5W30) e filtros.
                - SEMPRE sugira a troca dos filtros de ar, combustível e cabine junto com o óleo.
                - Retorne APENAS um JSON: 
                {"busca": "termo técnico para o banco", "resposta": "texto para o cliente", "completo": true/false}` 
            },
            ...contextoAnterior,
            { role: "user", content: incomingMsg }
        ];

        const aiResponse = await openai.chat.completions.create({
            model: "gpt-4o", // O 4o é melhor para manuais e lógica
            messages: promptIA,
            response_format: { type: "json_object" }
        });

        const analise = JSON.parse(aiResponse.choices[0].message.content);

        // 3. CONSULTA NA TABELA DE PREÇOS (O que você tem no Supabase)
        let produtosEstoque = "";
        if (analise.busca) {
            const { data: produtos } = await supabase
                .from("produtos")
                .select("descricao, preco")
                .ilike("descricao", `%${analise.busca}%`)
                .limit(4);

            if (produtos?.length > 0) {
                produtosEstoque = "\n\n📋 Valores no nosso sistema:\n";
                produtos.forEach(p => {
                    const valor = p.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                    produtosEstoque += `▪️ ${p.descricao}: R$ ${valor}\n`;
                });
            }
        }

        const respostaFinal = analise.resposta + produtosEstoque;

        // 4. SALVA TUDO PARA A PRÓXIMA MENSAGEM
        await supabase.from("historico_messages").insert([
            { phone_number: sender, role: 'user', content: incomingMsg },
            { phone_number: sender, role: 'assistant', content: respostaFinal }
        ]);

        twiml.message(respostaFinal);

    } catch (err) {
        console.error(err);
        twiml.message("Estou verificando os manuais para o seu veículo, um momento...");
    }

    res.writeHead(200, { "Content-Type": "text/xml" });
    res.end(twiml.toString());
});

app.listen(process.env.PORT || 10000);
