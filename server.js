require("dotenv").config();
const express = require("express");
const { MessagingResponse } = require("twilio").twiml;
const { createClient } = require("@supabase/supabase-js");
const OpenAI = require("openai");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const PORT = process.env.PORT || 10000;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.post("/whatsapp", async (req, res) => {
    const incomingMsg = req.body.Body;
    const twiml = new MessagingResponse();

    try {
        // 1. A IA decide se a mensagem é um PRODUTO ou apenas uma SAUDAÇÃO
        const aiResponse = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "Você é o assistente da PerfectLub. Analise se a mensagem do cliente é uma saudação ou se ele está citando um carro/peça. Se for saudação, responda com uma recepção calorosa. Se for peça/carro, retorne apenas a palavra 'BUSCAR'." },
                { role: "user", content: incomingMsg }
            ]
        });

        const decisaoIA = aiResponse.choices[0].message.content;

        if (decisaoIA !== "BUSCAR") {
            // Se for saudação (como "Boa tarde"), responde educadamente sem buscar no banco
            twiml.message(decisaoIA);
        } else {
            // Se for produto/carro, aí sim faz a busca no seu banco de 1300 itens
            const { data, error } = await supabase
                .from("produtos")
                .select("descricao, preco")
                .ilike("descricao", `%${incomingMsg}%`)
                .limit(3);

            if (data && data.length > 0) {
                let resposta = "Encontrei estes itens na PerfectLub:\n\n";
                data.forEach((p) => {
                    const preco = p.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                    resposta += `🔧 ${p.descricao}\n💰 R$ ${preco}\n\n`;
                });
                twiml.message(resposta);
            } else {
                twiml.message("Não encontrei esse item específico. Poderia me dar mais detalhes do veículo ou da peça?");
            }
        }

    } catch (err) {
        console.error(err);
        twiml.message("Ops, tive um probleminha. Pode repetir?");
    }

    res.writeHead(200, { "Content-Type": "text/xml" });
    res.end(twiml.toString());
});

app.listen(PORT, () => console.log("Lubi da PerfectLub Ativa ✅"));
