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
        // 1. MEMÓRIA: Puxa o histórico para saber que já estamos falando do Onix 2013
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

        // 2. IA TÉCNICA: Define o óleo e gera o termo de busca para o banco
        const promptIA = [
            { 
                role: "system", 
                content: `Você é o Lubi da PerfectLub. 
                Seu objetivo é vender a troca de óleo e filtros.
                
                REGRAS:
                - Se o cliente perguntou o valor e você já sabe o carro, identifique o óleo técnico (ex: 5W30).
                - Use o campo "termo_busca" para colocar a viscosidade ou modelo (ex: "5W30" ou "Filtro Onix").
                - Seja proativo: sugira filtros de ar e combustível.
                
                Retorne JSON: {"resposta": "Sua explicação técnica", "termo_busca": "termo para o banco"}` 
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

        // 3. CONSULTA REAL NO SEU ESTOQUE (1.300+ itens)
        let listaPrecos = "";
        if (analise.termo_busca) {
            const { data: produtos } = await supabase
                .from("produtos")
                .select("descricao, preco")
                .ilike("descricao", `%${analise.termo_busca}%`)
                .limit(5);

            if (produtos?.length > 0) {
                listaPrecos = "\n\n💰 *Confira os valores em nosso estoque:* \n";
                produtos.forEach(p => {
                    const preco = p.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                    listaPrecos += `▪️ ${p.descricao}: *R$ ${preco}*\n`;
                });
                listaPrecos += "\n*Mão de obra especializada:* R$ 70,00";
            }
        }

        const respostaFinal = analise.resposta + listaPrecos;

        // 4. SALVAR HISTÓRICO
        await supabase.from("historico_messages").insert([
            { phone_number: sender, role: 'user', content: incomingMsg },
            { phone_number: sender, role: 'assistant', content: respostaFinal }
        ]);

        twiml.message(respostaFinal);

    } catch (err) {
        console.error(err);
        twiml.message("Estou consultando a tabela de preços para o seu veículo...");
    }

    res.writeHead(200, { "Content-Type": "text/xml" });
    res.end(twiml.toString());
});

app.listen(process.env.PORT || 10000);
