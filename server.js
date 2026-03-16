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
        // PILAR 1: MEMÓRIA - Buscar o que já foi dito
        const { data: historico } = await supabase
            .from("historico_messages")
            .select("role, content")
            .eq("phone_number", sender)
            .order("created_at", { ascending: false })
            .limit(6);

        const mensagensContexto = historico?.reverse().map(h => ({
            role: h.role,
            content: h.content
        })) || [];

        // PILAR 2 & 3: RACIOCÍNIO E INTENÇÃO
        const promptIA = [
            { 
                role: "system", 
                content: `Você é o Lubi, consultor técnico da PerfectLub. 
                Sua tarefa é ser um especialista em manutenção automotiva.
                
                LOGICA:
                1. Se faltar modelo, ano ou motor, peça essas informações.
                2. Se você já tem os dados, identifique o óleo e filtros corretos pelo seu conhecimento de manual.
                3. Sugira SEMPRE a troca completa (Óleo + Filtro Óleo + Ar + Combustível).
                
                Responda em JSON:
                {"resposta": "Sua fala para o cliente", "busca_banco": "termo técnico para pesquisar no estoque"}` 
            },
            ...mensagensContexto,
            { role: "user", content: incomingMsg }
        ];

        const aiResponse = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: promptIA,
            response_format: { type: "json_object" }
        });

        const analise = JSON.parse(aiResponse.choices[0].message.content);

        // CONVERSÃO PARA SUA TABELA DE PREÇOS
        let resultadoEstoque = "";
        if (analise.busca_banco) {
            const { data: produtos } = await supabase
                .from("produtos")
                .select("descricao, preco")
                .ilike("descricao", `%${analise.busca_banco}%`)
                .limit(4);

            if (produtos?.length > 0) {
                resultadoEstoque = "\n\n📋 Preços na PerfectLub:\n";
                produtos.forEach(p => {
                    resultadoEstoque += `▪️ ${p.descricao}: R$ ${p.preco.toLocaleString('pt-BR')}\n`;
                });
            }
        }

        const respostaFinal = analise.resposta + resultadoEstoque;

        // SALVAR PARA NÃO ESQUECER NA PRÓXIMA MENSAGEM
        await supabase.from("historico_messages").insert([
            { phone_number: sender, role: 'user', content: incomingMsg },
            { phone_number: sender, role: 'assistant', content: respostaFinal }
        ]);

        twiml.message(respostaFinal);

    } catch (err) {
        console.error(err);
        twiml.message("Estou analisando o manual técnico do seu veículo...");
    }

    res.writeHead(200, { "Content-Type": "text/xml" });
    res.end(twiml.toString());
});

app.listen(process.env.PORT || 10000);
